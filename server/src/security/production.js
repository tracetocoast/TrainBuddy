const crypto = require('crypto')
const { AppError } = require('../lib/errors')
const { authRequired, requireRole } = require('../middleware/auth')

function validateProduction(env = process.env) {
  if (env.NODE_ENV !== 'production') return
  if (env.STORE_DRIVER !== 'postgres' || !env.DATABASE_URL) throw new Error('PRODUCTION_REQUIRES_POSTGRES')
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) throw new Error('PRODUCTION_REQUIRES_WECHAT_CREDENTIALS')
  if (!env.ADMIN_API_KEY || env.ADMIN_API_KEY.length < 32) throw new Error('PRODUCTION_REQUIRES_ADMIN_KEY_32_CHARS')
  if (['mock', 'demo'].includes((env.AI_PROVIDER || '').toLowerCase()) || env.PAYMENT_ENABLED === 'true') throw new Error('PRODUCTION_MOCK_OR_PAYMENT_FORBIDDEN')
  if (env.PRODUCTION_COMPAT_STORE_ACK !== 'single-document-locking-reviewed') throw new Error('COMPAT_STORE_REQUIRES_EXPLICIT_REVIEW_ACK')
}
function safeEqual(actual, expected) {
  const a = Buffer.from(String(actual || '')), b = Buffer.from(String(expected || ''))
  return a.length === b.length && b.length >= 32 && crypto.timingSafeEqual(a, b)
}
function productionGate(req, res, next) {
  // Whole unverified feature families are closed, including reads/exports/callbacks.
  const route = req.path.toLowerCase().replace(/\/+$/, '')
  if (/^\/(media|ai|ai-tasks|goal-groups|posture-reports|nutrition-tasks|voice|payments)(\/|$)/.test(route) ||
      /\/voice-tasks(?:\/|$)|\/parse-text$|^\/admin\/ai-tasks(?:\/|$)|^\/admin\/outbox\/[^/]+\/retry$/.test(route) || ['/notifications/demo', '/auth/apply-coach'].includes(route)) {
    return next(new AppError('FEATURE_DISABLED', '该能力尚未完成生产验收，当前环境未开放', { status: 503 }))
  }
  next()
}
function adminGate(req, res, next) {
  authRequired(req, res, err => {
    if (err) return next(err)
    requireRole('ops')(req, res, roleErr => {
      if (roleErr) return next(roleErr)
      if (!safeEqual(req.headers['x-admin-key'], process.env.ADMIN_API_KEY)) return next(new AppError('FORBIDDEN', '管理员二次验证失败'))
      next()
    })
  })
}
function rateLimit({ limit = 60, windowMs = 60000, maxKeys = 10000 } = {}) {
  const entries = new Map()
  return (req, res, next) => {
    const now = Date.now(), key = req.ip || req.socket.remoteAddress
    for (const [ip, value] of entries) if (value.until <= now) entries.delete(ip)
    if (!entries.has(key)) {
      if (entries.size >= maxKeys) return next(new AppError('RATE_LIMIT', '请求过多，请稍后重试'))
      entries.set(key, { count: 0, until: now + windowMs })
    }
    const entry = entries.get(key)
    if (++entry.count > limit) { res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000))); return next(new AppError('RATE_LIMIT', '请求过多，请稍后重试')) }
    next()
  }
}
module.exports = { validateProduction, safeEqual, productionGate, adminGate, rateLimit }
