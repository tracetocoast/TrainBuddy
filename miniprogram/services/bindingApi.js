/**
 * API03 绑定 / 授权（远程）
 */
const http = require('../utils/http')

function createInvitation(app, user) {
  return http.post('/coach/invitations', {}).then((res) => ({
    token: res.data.token,
    expiresAt: res.data.expiresAt
  }))
}

function previewInvitation(app, token) {
  return http.get('/invitations/preview', { token }).then((res) => res.data)
}

function acceptBinding(app, { token, studentUser, scopes }) {
  return http
    .post(
      '/bindings/accept',
      { token, scopes },
      { idempotencyKey: 'bind_' + Date.now() }
    )
    .then((res) => res.data)
}

function unbind(app, bindingId, actorUserId) {
  return http.del('/bindings/' + bindingId).then((res) => res.data)
}

function updateScopes(app, bindingId, scopes, actorUserId) {
  return http
    .patch('/bindings/' + bindingId + '/scopes', { scopes })
    .then((res) => res.data)
}

function listBoundStudentsForCoach(app, coachUserId) {
  // 同步接口被页面在 onShow 里直接用；远程需缓存或改页面为异步。
  // 提供 sync 空列表 + 异步刷新：此处返回上次缓存。
  const cache = (app.globalData && app.globalData._boundStudentsCache) || []
  // 触发后台刷新
  http
    .get('/coach/students')
    .then((res) => {
      app.globalData._boundStudentsCache = res.data || []
    })
    .catch(() => {})
  return cache
}

function listBoundStudentsForCoachAsync(app) {
  return http.get('/coach/students').then((res) => {
    app.globalData._boundStudentsCache = res.data || []
    return res.data || []
  })
}

function getActivePrimaryCoach(app, studentId) {
  const me = app.globalData._meCache
  if (me && me.primaryBinding) return me.primaryBinding
  return null
}

function refreshMe(app) {
  return http.get('/me').then((res) => {
    app.globalData._meCache = res.data
    return res.data
  })
}

function requestMediaAccess(app, payload) {
  return http.post('/media/access', payload).then((res) => res.data)
}

function normalizeScopes(scopes) {
  const base = {
    workout_self: false,
    meal: false,
    body_state: false,
    special: false,
    posture_report: false,
    raw_photo: false
  }
  return Object.assign(base, scopes || {})
}

module.exports = {
  createInvitation,
  previewInvitation,
  acceptBinding,
  unbind,
  updateScopes,
  listBoundStudentsForCoach,
  listBoundStudentsForCoachAsync,
  getActivePrimaryCoach,
  refreshMe,
  requestMediaAccess,
  normalizeScopes
}
