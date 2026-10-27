const crypto = require('crypto')
const config = require('../config')
const time = require('../lib/time')
const { AppError } = require('../lib/errors')

function bodyHash(body) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body || {}))
    .digest('hex')
}
function authorizationStamp(req) {
  const state = req.app.locals.store.state, actor = req.actor
  return bodyHash({ roles: actor && actor.grantedRoles, bindings: (state.bindings || []).filter(binding => actor && (binding.studentId === actor.userId || binding.coachUserId === actor.userId)) })
}

/**
 * 写操作幂等：Idempotency-Key
 * 同键同内容 → 返回缓存成功响应
 * 同键不同内容 → IDEMPOTENCY_CONFLICT
 */
function idempotency() {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key']
    if (!key) return next()

    const store = req.app.locals.store
    const actorId = (req.actor && req.actor.userId) || 'anon'
    const fullKey = actorId + '|' + req.method + '|' + req.path + '|' + key
    const hash = bodyHash(req.body)

    const existing = store.state.idempotency[fullKey]
    if (existing) {
      if (existing.expiresAt < time.nowMs() || (req.app.locals.production && existing.authorizationStamp !== authorizationStamp(req))) {
        delete store.state.idempotency[fullKey]
      } else if (existing.bodyHash !== hash) {
        return next(
          new AppError('IDEMPOTENCY_CONFLICT', '同幂等键内容不一致', { status: 409 })
        )
      } else {
        res.status(existing.status || 200)
        return res.json(existing.response)
      }
    }

    req.idempotencyKey = fullKey
    req.idempotencyBodyHash = hash

    const originalJson = res.json.bind(res)
    res.json = (payload) => {
      if (res.statusCode < 400 && req.idempotencyKey) {
        store.state.idempotency[req.idempotencyKey] = {
          bodyHash: req.idempotencyBodyHash,
          status: res.statusCode || 200,
          response: payload,
          expiresAt: time.nowMs() + config.idempotencyTtlMs,
          authorizationStamp: authorizationStamp(req)
        }
        store.persist()
      }
      return originalJson(payload)
    }
    next()
  }
}

module.exports = { idempotency, bodyHash }
