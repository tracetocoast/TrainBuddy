const { loadEnv } = require('./lib/loadEnv')
loadEnv()

const { createApp } = require('./app')
const config = require('./config')
const { validateProduction } = require('./security/production')

async function start() {
  validateProduction()
  let store
  if (process.env.STORE_DRIVER === 'postgres') {
    const { PostgresStore } = require('./store/postgresStore')
    store = new PostgresStore(require('./store/migrate').createPool())
    try { if (!(await store.health())) throw new Error('DATABASE_NOT_INITIALIZED') }
    catch (err) { await store.close(); throw err }
  }
  const app = createApp({ store })
  const server = app.listen(config.port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'listening', port: config.port, production: app.locals.production })))
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    const timeout = setTimeout(() => process.exit(1), 30000); timeout.unref()
    server.close(async () => { if (store) await store.close(); clearTimeout(timeout) })
    if (server.closeIdleConnections) server.closeIdleConnections()
  }
  process.once('SIGTERM', stop); process.once('SIGINT', stop)
  return { app, server }
}
if (require.main === module) start().catch(err => { console.error(JSON.stringify({ event: 'startup_failed', type: err.name })); process.exitCode = 1 })
module.exports = { start }
