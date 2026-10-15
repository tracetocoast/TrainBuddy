/**
 * 绑定 / 邀请 / 授权 API（mock）。
 * 正式环境应对齐 API03、ShareGrant / ConsentGrant。
 */

const { INVITE_EXPIRE_DAYS } = require('../utils/constants')

/** 预置邀请：token 明文仅演示用；正式应只存 hash */
const PRESET_INVITES = {
  LINYE7D: {
    inviteId: 'inv_001',
    token: 'LINYE7D',
    coachId: 'coach_001',
    coachUserId: 'u_coach_001',
    coachName: '林野',
    intro: '力量进阶 · 私教工作室',
    expiresAt: null, // 运行时按创建时间计算
    usedAt: null,
    revokedAt: null
  }
}

function now() {
  return Date.now()
}

function makeId(prefix) {
  return prefix + '_' + now() + '_' + Math.floor(Math.random() * 1000)
}

function getInviteCatalog(app) {
  const gd = app.globalData
  if (!gd.inviteCatalog) {
    gd.inviteCatalog = JSON.parse(JSON.stringify(PRESET_INVITES))
    Object.keys(gd.inviteCatalog).forEach((k) => {
      gd.inviteCatalog[k].expiresAt = now() + INVITE_EXPIRE_DAYS * 24 * 3600 * 1000
    })
  }
  return gd.inviteCatalog
}

function lookupInvite(app, token) {
  const catalog = getInviteCatalog(app)
  const key = String(token || '')
    .trim()
    .toUpperCase()
  return catalog[key] || null
}

/**
 * 教练生成邀请（一次性）
 */
function createInvitation(app, coachUser) {
  const catalog = getInviteCatalog(app)
  const token = 'TB' + Math.random().toString(36).slice(2, 8).toUpperCase()
  const invite = {
    inviteId: makeId('inv'),
    token,
    coachId: (coachUser.coachProfile && coachUser.coachProfile.coachId) || 'coach_001',
    coachUserId: coachUser.userId,
    coachName: coachUser.displayName,
    intro: (coachUser.coachProfile && coachUser.coachProfile.intro) || '',
    expiresAt: now() + INVITE_EXPIRE_DAYS * 24 * 3600 * 1000,
    usedAt: null,
    revokedAt: null
  }
  catalog[token] = invite
  app.persist()
  return Promise.resolve({
    token,
    expiresAt: invite.expiresAt,
    expireDays: INVITE_EXPIRE_DAYS
  })
}

/**
 * 预览邀请（不含训练内容）
 */
function previewInvitation(app, token) {
  const invite = lookupInvite(app, token)
  if (!invite) {
    return Promise.reject({ code: 'INVITE_NOT_FOUND', message: '邀请码无效' })
  }
  if (invite.revokedAt) {
    return Promise.reject({ code: 'INVITE_REVOKED', message: '邀请已撤销' })
  }
  if (invite.usedAt) {
    return Promise.reject({ code: 'INVITE_USED', message: '邀请已被使用' })
  }
  if (invite.expiresAt && invite.expiresAt < now()) {
    return Promise.reject({ code: 'INVITE_EXPIRED', message: '邀请已过期' })
  }
  return Promise.resolve({
    token: invite.token,
    coachId: invite.coachId,
    coachName: invite.coachName,
    intro: invite.intro,
    expiresAt: invite.expiresAt
  })
}

/**
 * 学员接受绑定
 * @param {object} scopes 授权类别布尔表
 */
function acceptBinding(app, { token, studentUser, scopes }) {
  return previewInvitation(app, token).then((preview) => {
    const catalog = getInviteCatalog(app)
    const invite = catalog[preview.token]
    const bindings = app.globalData.bindings || []

    const activePrimary = bindings.find(
      (b) =>
        b.studentId === studentUser.userId &&
        b.status === 'active' &&
        b.isPrimary
    )
    if (activePrimary) {
      return Promise.reject({
        code: 'PRIMARY_COACH_EXISTS',
        message: '已有主教练，请先解绑后再绑定'
      })
    }

    invite.usedAt = now()
    const binding = {
      id: makeId('bind'),
      coachId: invite.coachId,
      coachUserId: invite.coachUserId,
      coachName: invite.coachName,
      studentId: studentUser.userId,
      studentName: studentUser.displayName,
      workspaceId: 'ws_' + invite.coachId,
      status: 'active',
      isPrimary: true,
      boundAt: now(),
      endedAt: null,
      scopes: normalizeScopes(scopes),
      mediaAccessRevoked: false
    }
    bindings.push(binding)
    app.globalData.bindings = bindings
    app.persist()
    return binding
  })
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

function updateScopes(app, bindingId, scopes, actorUserId) {
  const binding = findBinding(app, bindingId)
  if (!binding) {
    return Promise.reject({ code: 'BINDING_NOT_FOUND', message: '绑定不存在' })
  }
  if (binding.studentId !== actorUserId) {
    return Promise.reject({ code: 'FORBIDDEN', message: '仅学员本人可修改授权' })
  }
  if (binding.status !== 'active') {
    return Promise.reject({ code: 'BINDING_INACTIVE', message: '服务关系已结束' })
  }
  binding.scopes = normalizeScopes(scopes)
  app.persist()
  return Promise.resolve(binding)
}

/**
 * 解绑：立即停止共享；健康内容与图片读取撤销（AC33）
 */
function unbind(app, bindingId, actorUserId) {
  const binding = findBinding(app, bindingId)
  if (!binding) {
    return Promise.reject({ code: 'BINDING_NOT_FOUND', message: '绑定不存在' })
  }
  if (binding.studentId !== actorUserId && binding.coachUserId !== actorUserId) {
    return Promise.reject({ code: 'FORBIDDEN', message: '无权解绑该关系' })
  }
  binding.status = 'ended'
  binding.endedAt = now()
  binding.isPrimary = false
  binding.mediaAccessRevoked = true
  // 清空教练侧该学员的媒体缓存与签名 URL
  revokeCoachMediaCache(app, binding)
  app.persist()
  return Promise.resolve(binding)
}

function revokeCoachMediaCache(app, binding) {
  const cache = app.globalData.coachMediaCache || {}
  const key = binding.coachUserId + ':' + binding.studentId
  delete cache[key]
  app.globalData.coachMediaCache = cache

  const urls = app.globalData.signedMediaUrls || {}
  Object.keys(urls).forEach((assetId) => {
    const item = urls[assetId]
    if (
      item &&
      item.subjectId === binding.studentId &&
      item.viewerId === binding.coachUserId
    ) {
      delete urls[assetId]
    }
  })
  app.globalData.signedMediaUrls = urls
}

function findBinding(app, bindingId) {
  return (app.globalData.bindings || []).find((b) => b.id === bindingId)
}

function listBindingsForUser(app, userId) {
  return (app.globalData.bindings || []).filter(
    (b) => b.studentId === userId || b.coachUserId === userId
  )
}

function getActivePrimaryCoach(app, studentId) {
  return (app.globalData.bindings || []).find(
    (b) => b.studentId === studentId && b.status === 'active' && b.isPrimary
  )
}

/**
 * AC02：教练仅可访问有效绑定学员
 */
function listBoundStudentsForCoach(app, coachUserId) {
  return (app.globalData.bindings || [])
    .filter((b) => b.coachUserId === coachUserId && b.status === 'active')
    .map((b) => ({
      bindingId: b.id,
      studentId: b.studentId,
      name: b.studentName,
      scopes: b.scopes,
      boundAt: b.boundAt
    }))
}

/**
 * 模拟媒体签名 URL（AC33）
 */
function requestMediaAccess(app, { assetId, subjectId, viewerId, purpose }) {
  const binding = (app.globalData.bindings || []).find(
    (b) =>
      b.studentId === subjectId &&
      b.coachUserId === viewerId &&
      b.status === 'active'
  )

  if (viewerId !== subjectId) {
    if (!binding) {
      return Promise.reject({
        code: 'BINDING_INACTIVE',
        message: '服务关系已结束，无法访问照片'
      })
    }
    if (binding.mediaAccessRevoked) {
      return Promise.reject({
        code: 'CONSENT_REVOKED',
        message: '授权已撤回，无法获取照片'
      })
    }
    if (purpose === 'raw_photo' && !binding.scopes.raw_photo) {
      return Promise.reject({
        code: 'CONSENT_REQUIRED',
        message: '尚未授权原始照片'
      })
    }
  }

  const url =
    'https://mock.signed.local/' +
    assetId +
    '?exp=' +
    (now() + 5 * 60 * 1000) +
    '&v=' +
    viewerId
  const store = app.globalData.signedMediaUrls || {}
  store[assetId] = { url, subjectId, viewerId, purpose, expiresAt: now() + 5 * 60 * 1000 }
  app.globalData.signedMediaUrls = store
  app.persist()
  return Promise.resolve({ url, expiresIn: 300 })
}

module.exports = {
  createInvitation,
  previewInvitation,
  acceptBinding,
  updateScopes,
  unbind,
  listBindingsForUser,
  getActivePrimaryCoach,
  listBoundStudentsForCoach,
  requestMediaAccess,
  normalizeScopes
}
