const { it } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { PostgresStore } = require('../src/store/postgresStore')
const { emptyState } = require('../src/store/memoryStore')
const { seed } = require('../src/seed')
const { createApp } = require('../src/app')

// A deterministic adapter stub tests HTTP commit ordering only. Row-lock semantics
// are tested exclusively in postgres-integration.test.js against a real server.
function fakePool() {
  const fixture = { state: emptyState(), persist() {} }; seed(fixture)
  return { document: fixture.state, failCommit: false, calls: [],
    async connect() {
      const pool = this; let pending
      return { release() {}, async query(sql, params) {
        pool.calls.push(sql)
        if (sql.startsWith('SELECT document')) return { rows: [{ document: JSON.parse(JSON.stringify(pool.document)) }] }
        if (sql.startsWith('UPDATE runtime_state')) pending = JSON.parse(params[0])
        if (sql === 'COMMIT') { if (pool.failCommit) throw new Error('commit failed'); if (pending) pool.document = pending }
        return { rows: [] }
      } }
    }
  }
}
it('Postgres adapter rejects out-of-transaction access and persists only at commit', async () => {
  const pool = fakePool(), store = new PostgresStore(pool)
  assert.throws(() => store.state, /STATE_OUTSIDE_TRANSACTION/)
  await store.tx(state => { state.extension = 'saved'; store.persist(); assert.equal(pool.document.extension, undefined) })
  assert.equal(pool.document.extension, 'saved')
  await assert.rejects(store.tx(state => { state.extension = 'not-saved'; throw new Error('rollback') }))
  assert.equal(pool.document.extension, 'saved')
  assert.ok(pool.calls.includes('ROLLBACK'))
})
it('Postgres HTTP unit of work refuses success when database commit fails and retains no token', async t => {
  const pool = fakePool(), store = new PostgresStore(pool)
  const server = http.createServer(createApp({ store }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  pool.failCommit = true
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/v1/auth/wechat-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountKey: 'student_only' })
  })
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.error.code, 'DATABASE_UNAVAILABLE')
  assert.equal(body.data, undefined)
  assert.deepEqual(pool.document.sessions, {})
  pool.failCommit = false
  const successful = await fetch('http://127.0.0.1:' + server.address().port + '/api/v1/auth/wechat-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountKey: 'student_only' })
  })
  assert.equal(successful.status, 200)
  assert.ok((await successful.json()).data.sessionToken)
  assert.equal(Object.keys(pool.document.sessions).length, 1)
})
