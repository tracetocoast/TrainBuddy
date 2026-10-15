const time = require('../lib/time')
const { makeId } = require('../lib/ids')
const { AppError } = require('../lib/errors')
const { hashToken } = require('../seed')

const SCOPE_KEYS = [
  'workout_self',
  'meal',
  'body_state',
  'special',
  'posture_report',
  'raw_photo'
]

function normalizeScopes(scopes) {
  const base = {}
  SCOPE_KEYS.forEach((k) => {
    base[k] = !!(scopes && scopes[k])
  })
  return base
}

function createInvitation(state, actor) {
  if (actor.grantedRoles.indexOf('coach') === -1) {
    throw new AppError('FORBIDDEN', '仅已审核教练可生成邀请')
  }
  const coachId =
    (actor.coachProfile && actor.coachProfile.coachId) ||
    'coach_' + actor.userId
  const token = 'INV' + makeId('').replace(/_/g, '').slice(0, 8).toUpperCase()
  const row = {
    id: makeId('inv'),
    tokenHash: hashToken(token),
    tokenPlainDemo: token,
    coachUserId: actor.userId,
    coachId,
    coachName: actor.displayName,
    expiresAt: time.nowMs() + 7 * 24 * 3600 * 1000,
    usedAt: null,
    revokedAt: null,
    createdAt: time.nowMs()
  }
  state.invitations.push(row)
  return { token, expiresAt: row.expiresAt, invitationId: row.id }
}

function previewInvitation(state, token) {
  const inv = findInvite(state, token)
  return {
    token,
    coachName: inv.coachName,
    coachId: inv.coachId,
    expiresAt: inv.expiresAt
  }
}

function findInvite(state, token) {
  const h = hashToken(String(token || '').trim())
  const inv = state.invitations.find((i) => i.tokenHash === h)
  if (!inv) throw new AppError('NOT_FOUND', '邀请码无效')
  if (inv.revokedAt) throw new AppError('INVALID_STATE', '邀请已撤销')
  if (inv.usedAt) throw new AppError('INVALID_STATE', '邀请已被使用')
  if (inv.expiresAt < time.nowMs()) throw new AppError('INVALID_STATE', '邀请已过期')
  return inv
}

/** API03 accept */
function acceptBinding(state, { token, studentUser, scopes }) {
  const inv = findInvite(state, token)
  const primary = state.bindings.find(
    (b) => b.studentId === studentUser.userId && b.status === 'active' && b.isPrimary
  )
  if (primary) {
    throw new AppError('PRIMARY_COACH_EXISTS', '已有主教练，请先解绑后再绑定')
  }

  inv.usedAt = time.nowMs()
  const binding = {
    id: makeId('bind'),
    coachUserId: inv.coachUserId,
    coachId: inv.coachId,
    coachName: inv.coachName,
    studentId: studentUser.userId,
    studentName: studentUser.displayName,
    status: 'active',
    isPrimary: true,
    boundAt: time.nowMs(),
    endedAt: null,
    scopes: normalizeScopes(scopes),
    mediaAccessRevoked: false
  }
  state.bindings.push(binding)
  return binding
}

function unbind(state, bindingId, actorUserId) {
  const b = state.bindings.find((x) => x.id === bindingId)
  if (!b) throw new AppError('NOT_FOUND', '绑定不存在')
  if (b.studentId !== actorUserId && b.coachUserId !== actorUserId) {
    throw new AppError('FORBIDDEN', '无权解绑该关系')
  }
  b.status = 'ended'
  b.endedAt = time.nowMs()
  b.mediaAccessRevoked = true
  return { ok: true }
}

function updateScopes(state, bindingId, scopes, actorUserId) {
  const b = state.bindings.find((x) => x.id === bindingId)
  if (!b) throw new AppError('NOT_FOUND', '绑定不存在')
  if (b.studentId !== actorUserId) {
    throw new AppError('FORBIDDEN', '仅学员本人可修改授权')
  }
  if (b.status !== 'active') {
    throw new AppError('BINDING_INACTIVE', '服务关系已结束')
  }
  b.scopes = normalizeScopes(scopes)
  return b
}

function listBoundStudents(state, coachUserId) {
  return state.bindings
    .filter((b) => b.coachUserId === coachUserId && b.status === 'active')
    .map((b) => ({
      studentId: b.studentId,
      name: b.studentName,
      scopes: b.scopes,
      boundAt: b.boundAt
    }))
}

function requestMediaAccess(state, { assetId, subjectId, viewerId, purpose }) {
  if (viewerId === subjectId) {
    return { url: 'https://mock.signed.local/' + assetId + '?self=1', expiresIn: 300 }
  }
  const b = state.bindings.find(
    (x) =>
      x.studentId === subjectId &&
      x.coachUserId === viewerId &&
      x.status === 'active'
  )
  if (!b) throw new AppError('FORBIDDEN', '无权访问')
  if (b.mediaAccessRevoked) {
    throw new AppError('CONSENT_REVOKED', '授权已撤回')
  }
  if (purpose === 'raw_photo' && !(b.scopes && b.scopes.raw_photo)) {
    throw new AppError('CONSENT_REQUIRED', '尚未授权原始照片')
  }
  return {
    url: 'https://mock.signed.local/' + assetId + '?exp=' + (time.nowMs() + 300000),
    expiresIn: 300
  }
}

module.exports = {
  createInvitation,
  previewInvitation,
  acceptBinding,
  unbind,
  updateScopes,
  listBoundStudents,
  requestMediaAccess,
  normalizeScopes,
  SCOPE_KEYS
}
