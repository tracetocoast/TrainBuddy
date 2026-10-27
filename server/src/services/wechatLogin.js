const crypto = require('crypto')
const { AppError } = require('../lib/errors')
const { createSession, presentUser } = require('./authService')

async function exchangeCode(body, options = {}) {
  if (!body || Object.hasOwn(body, 'accountKey') || Object.hasOwn(body, 'claimRole') || typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{6,256}$/.test(body.code) || ['student_only', 'coach_approved', 'coach_b', 'ops_admin', 'student_claim_coach'].includes(body.code)) {
    throw new AppError('UNAUTHORIZED', '请使用微信登录，不接受演示账号或客户端角色声明')
  }
  const env = options.env || process.env
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) throw new AppError('PROVIDER_NOT_CONFIGURED', '微信登录未配置')
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
  url.search = new URLSearchParams({ appid: env.WECHAT_APP_ID, secret: env.WECHAT_APP_SECRET, js_code: body.code, grant_type: 'authorization_code' }).toString()
  try {
    const response = await (options.fetch || fetch)(url, { signal: AbortSignal.timeout(8000), redirect: 'error' })
    if (!response.ok) throw new Error('upstream')
    const text = await response.text()
    if (text.length > 16384) throw new Error('oversized')
    const result = JSON.parse(text)
    if (result.errcode || typeof result.openid !== 'string' || !result.openid || !result.session_key) throw new Error('rejected')
    // session_key is neither persisted nor returned to the mini-program.
    return { subject: 'wx:' + env.WECHAT_APP_ID + ':' + result.openid }
  } catch (_) { throw new AppError('UNAUTHORIZED', '微信登录校验失败，请重新登录') }
}
function login(state, identity) {
  let user = state.users.find(row => row.wechatSubject === identity.subject)
  if (!user) {
    user = { userId: 'u_' + crypto.randomUUID(), displayName: '微信学员', wechatSubject: identity.subject, status: 'active', coachProfile: null, createdAt: Date.now() }
    state.users.push(user)
    state.userRoles.push({ userId: user.userId, role: 'student', status: 'active', grantedBy: 'wechat_registration' })
  }
  if (user.status !== 'active') throw new AppError('UNAUTHORIZED', '账户不可用')
  const grantedRoles = state.userRoles.filter(row => row.userId === user.userId && row.status === 'active').map(row => row.role)
  return { sessionToken: createSession(state, user.userId), user: presentUser(state, user), grantedRoles, mockAccountKey: null }
}
module.exports = { exchangeCode, login }
