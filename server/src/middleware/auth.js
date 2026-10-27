const { fail } = require('../lib/errors')
const time = require('../lib/time')
const { tokenHash } = require('../services/authService')

function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : req.headers['x-session-token']
  if (!token) return next(failWrap('UNAUTHORIZED', '未登录'))

  const store = req.app.locals.store.state
  const sess = store.sessions[tokenHash(token)] || (!req.app.locals.production && store.sessions[token])
  if (!sess || sess.revokedAt || !Number.isFinite(sess.expiresAt) || sess.expiresAt <= time.nowMs()) {
    return next(failWrap('UNAUTHORIZED', '登录已失效'))
  }
  const user = store.users.find((u) => u.userId === sess.userId)
  if (!user || user.status !== 'active') {
    return next(failWrap('UNAUTHORIZED', '用户不可用'))
  }
  const roles = store.userRoles
    .filter((r) => r.userId === user.userId && r.status === 'active')
    .map((r) => r.role)

  req.actor = {
    userId: user.userId,
    displayName: user.displayName,
    wechatSubject: user.wechatSubject,
    grantedRoles: roles,
    coachProfile: user.coachProfile || null,
    token
  }
  next()
}

function failWrap(code, message) {
  const { AppError } = require('../lib/errors')
  return new AppError(code, message)
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.actor || req.actor.grantedRoles.indexOf(role) === -1) {
      return next(new (require('../lib/errors').AppError)('FORBIDDEN', '缺少角色权限'))
    }
    next()
  }
}

module.exports = { authRequired, requireRole }
