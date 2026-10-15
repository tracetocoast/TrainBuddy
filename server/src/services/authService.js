const config = require('../config')
const time = require('../lib/time')
const { makeId } = require('../lib/ids')
const { AppError } = require('../lib/errors')
const { getPrimaryBinding } = require('../lib/permission')

const ACCOUNT_MAP = {
  student_only: 'u_stu_001',
  coach_approved: 'u_coach_001',
  student_claim_coach: 'u_stu_002',
  coach_b: 'u_coach_002'
}

function createSession(state, userId) {
  const token = 'sess_' + makeId('tok')
  state.sessions[token] = {
    userId,
    createdAt: time.nowMs(),
    expiresAt: time.nowMs() + config.sessionTtlMs
  }
  return token
}

function rolesOf(state, userId) {
  return state.userRoles
    .filter((r) => r.userId === userId && r.status === 'active')
    .map((r) => r.role)
}

function presentUser(state, user) {
  return {
    userId: user.userId,
    displayName: user.displayName,
    wechatSubject: user.wechatSubject,
    coachProfile: user.coachProfile
  }
}

/** API01 mock：用 accountKey 代替微信 code；正式环境换真微信 */
function wechatSession(state, { code, accountKey, claimRole }) {
  // 正式：用 code 换 openid。此处演示账号映射。
  const key = accountKey || code || 'student_only'
  const userId = ACCOUNT_MAP[key]
  if (!userId) throw new AppError('USER_NOT_FOUND', '账号不存在')

  const user = state.users.find((u) => u.userId === userId)
  const grantedRoles = rolesOf(state, userId)

  // AC01：客户端声称角色不在已授予列表 → 拒绝
  if (claimRole && grantedRoles.indexOf(claimRole) === -1) {
    throw new AppError('ROLE_NOT_GRANTED', '无法获取该角色权限，请联系平台审核', {
      extra: { grantedRoles }
    })
  }

  const sessionToken = createSession(state, userId)
  return {
    sessionToken,
    user: presentUser(state, user),
    grantedRoles,
    mockAccountKey: key
  }
}

/** API02 GET /me */
function getMe(state, actor) {
  const user = state.users.find((u) => u.userId === actor.userId)
  const binding = getPrimaryBinding(state, actor.userId)
  return {
    user: presentUser(state, user),
    grantedRoles: actor.grantedRoles,
    primaryBinding: binding
      ? {
          id: binding.id,
          coachUserId: binding.coachUserId,
          coachId: binding.coachId,
          coachName: binding.coachName,
          studentId: binding.studentId,
          status: binding.status,
          scopes: binding.scopes,
          boundAt: binding.boundAt,
          isPrimary: binding.isPrimary
        }
      : null
  }
}

function patchMe(state, actor, patch) {
  const user = state.users.find((u) => u.userId === actor.userId)
  if (patch.displayName) user.displayName = String(patch.displayName).slice(0, 32)
  return getMe(state, actor)
}

function applyCoachRole(state, actor) {
  // 只提交申请，不立即授予（AC01）
  return {
    status: 'pending_review',
    message: '已提交教练申请，审核通过前无法使用教练工作台'
  }
}

module.exports = {
  ACCOUNT_MAP,
  wechatSession,
  getMe,
  patchMe,
  applyCoachRole,
  rolesOf,
  presentUser,
  createSession
}
