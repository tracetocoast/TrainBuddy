const express = require('express')
const cors = require('cors')
const { MemoryStore } = require('./store/memoryStore')
const { seed } = require('./seed')
const { attachRequestId, errorHandler } = require('./middleware/errors')
const { buildRouter } = require('./routes')

function createApp(options = {}) {
  const store = options.store || new MemoryStore(options.storeFile)
  if (!store.state.seeded) seed(store)

  const app = express()
  app.locals.store = store

  app.use(cors())
  app.use(express.json({ limit: '2mb' }))
  app.use(attachRequestId)

  app.get('/health', (req, res) => {
    res.json({ ok: true, timezone: 'Asia/Shanghai', service: 'trainbuddy-api' })
  })

  app.use('/api/v1', buildRouter())

  app.use(errorHandler)
  return app
}

module.exports = { createApp }
