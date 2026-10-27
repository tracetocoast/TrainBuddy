const path = require('path')
const express = require('express')
const cors = require('cors')
const { MemoryStore } = require('./store/memoryStore')
const { seed } = require('./seed')
const { attachRequestId, errorHandler } = require('./middleware/errors')
const { buildRouter } = require('./routes')

function createApp(options = {}) {
  const production = options.production === undefined ? process.env.NODE_ENV === 'production' : options.production
  const store = options.store || new MemoryStore(options.storeFile)
  if (store.kind !== 'postgres' && !store.state.seeded) {
    if (production) throw new Error('PRODUCTION_SEED_FORBIDDEN')
    seed(store)
  }

  const app = express()
  app.locals.store = store
  app.locals.production = production
  app.disable('x-powered-by')
  if (production) app.set('trust proxy', 1)
  app.use(attachRequestId)

  if (!production) app.use(cors())
  if (production) app.use('/api/v1', require('./security/production').rateLimit())
  // 饮食识别会附带压缩后的照片 base64
  app.use(express.json({ limit: production ? '128kb' : '8mb' }))
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Cache-Control', 'no-store')
    if (production) {
      const start = Date.now()
      res.once('finish', () => console.log(JSON.stringify({ event: 'http', request_id: req.requestId, method: req.method, status: res.statusCode, duration_ms: Date.now() - start })))
    }
    next()
  })

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      timezone: 'Asia/Shanghai',
      service: 'trainbuddy-api',
      payment_enabled: require('./config').features.paymentEnabled
    })
  })
  app.get('/health/live', (req, res) => res.json({ ok: true }))
  app.get('/health/ready', async (req, res) => {
    try {
      if (store.health && !(await store.health())) throw new Error('not_ready')
      res.json({ ok: true })
    } catch (_) { res.status(503).json({ ok: false }) }
  })

  // 最小运营后台静态页
  if (production) app.use('/ops', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: '未开放' } }))
  app.use('/ops', express.static(path.join(__dirname, '..', 'public')))
  app.get('/ops', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'))
  })

  if (production) {
    const { productionGate, rateLimit } = require('./security/production')
    app.post('/api/v1/auth/wechat-session', rateLimit({ limit: 10 }), async (req, res, next) => {
      try { req.wechatIdentity = await require('./services/wechatLogin').exchangeCode(req.body, options.wechat); next() }
      catch (err) { next(err) }
    })
    app.use('/api/v1', productionGate)
  }
  if (store.middleware) app.use('/api/v1', store.middleware())
  if (production) app.use('/api/v1/admin', require('./security/production').adminGate)
  app.use('/api/v1', buildRouter())

  app.use(errorHandler)
  return app
}

module.exports = { createApp }
