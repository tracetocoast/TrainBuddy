const { AsyncLocalStorage } = require('async_hooks')
const { emptyState } = require('./memoryStore')

// Compatibility model: a locked PostgreSQL document, NOT a normalized repository.
// Context is request-local; there is no per-process copy of authoritative state.
class PostgresStore {
  constructor(pool) { this.kind = 'postgres'; this.pool = pool; this.context = new AsyncLocalStorage() }
  get state() {
    const current = this.context.getStore()
    if (!current || current.closed) throw new Error('STATE_OUTSIDE_TRANSACTION')
    return current.state
  }
  persist() { void this.state } // Commit only at the outer request boundary.
  async tx(fn) {
    const context = this.context.getStore()
    if (!context) return this.transaction(() => fn(this.state))
    const before = JSON.parse(JSON.stringify(context.state))
    try { return await fn(context.state) }
    catch (err) {
      for (const key of Object.keys(context.state)) delete context.state[key]
      Object.assign(context.state, before)
      throw err
    }
  }
  async transaction(fn) {
    const client = await this.pool.connect()
    const context = { state: null, closed: false }
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '20s'")
      const result = await client.query('SELECT document FROM runtime_state WHERE id = 1 FOR UPDATE')
      if (!result.rows.length) throw new Error('DATABASE_NOT_INITIALIZED')
      context.state = Object.assign(emptyState(), result.rows[0].document)
      const before = JSON.stringify(context.state)
      const output = await this.context.run(context, fn)
      if (before !== JSON.stringify(context.state)) {
        await client.query('UPDATE runtime_state SET document = $1::jsonb, revision = revision + 1, updated_at = now() WHERE id = 1', [JSON.stringify(context.state)])
      }
      await client.query('COMMIT')
      return output
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally { context.closed = true; client.release() }
  }
  async health() {
    const result = await this.pool.query('SELECT id FROM runtime_state WHERE id = 1')
    return result.rows.length === 1
  }
  async close() { await this.pool.end() }
  middleware() {
    return (req, res, next) => {
      const originalEnd = res.end.bind(res)
      let args, settled = false, complete
      const pending = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('REQUEST_TRANSACTION_TIMEOUT')), 25000)
        complete = (error, value) => {
          if (settled) return
          settled = true; clearTimeout(timer)
          if (error) reject(error); else resolve(value)
        }
        res.once('close', () => { if (!res.writableEnded) complete(new Error('CLIENT_DISCONNECTED')) })
      })
      // API routes emit buffered JSON; no streaming/response write is permitted here.
      res.end = (...values) => { args = values; complete(null); return res }
      res.write = () => { throw new Error('STREAMING_NOT_SUPPORTED_IN_STATE_TRANSACTION') }
      this.transaction(async () => {
        next()
        await pending
        if (res.statusCode >= 400) throw Object.assign(new Error('HTTP_ROLLBACK'), { httpRollback: true })
      }).then(() => originalEnd(...args)).catch(err => {
        complete(null)
        if (res.destroyed) return
        if (err.httpRollback) return originalEnd(...args)
        // No stack, database connection string, credentials or request body in the response.
        res.statusCode = 503
        res.removeHeader('Content-Length')
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        originalEnd(JSON.stringify({ error: { code: 'DATABASE_UNAVAILABLE', message: '服务暂时不可用', retryable: true }, request_id: req.requestId }))
      })
    }
  }
}

module.exports = { PostgresStore }
