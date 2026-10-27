/**
 * 权限矩阵（设计文档 13.1）
 * 每个接口校验：身份、角色、关系、资源归属、授权类别
 */

const { AppError } = require('./errors')

function getActiveBinding(state, coachUserId, studentId) {
  return (state.bindings || []).find(
    (b) =>
      b.coachUserId === coachUserId &&
      b.studentId === studentId &&
      b.status === 'active'
  )
}

function getPrimaryBinding(state, studentId) {
  return (state.bindings || []).find(
    (b) => b.studentId === studentId && b.status === 'active' && b.isPrimary
  )
}

/** 教练读学员：需有效绑定；可选类别 */
function assertCoachReadStudent(state, coachUserId, studentId, category) {
  if (!(state.userRoles || []).some(role => role.userId === coachUserId && role.role === 'coach' && role.status === 'active')) throw new AppError('FORBIDDEN', '缺少有效教练身份')
  const b = getActiveBinding(state, coachUserId, studentId)
  if (!b) {
    throw new AppError('FORBIDDEN', '无权访问该学员', { status: 403 })
  }
  if (category && !(b.scopes && b.scopes[category])) {
    throw new AppError('CONSENT_REQUIRED', '学员未授权该类内容', { status: 403 })
  }
  return b
}

function assertSelfOrBoundCoach(state, actor, studentId, category) {
  if (actor.userId === studentId) return { self: true }
  return {
    self: false,
    binding: assertCoachReadStudent(state, actor.userId, studentId, category)
  }
}

function hasRole(actor, role) {
  return actor.grantedRoles && actor.grantedRoles.indexOf(role) !== -1
}

module.exports = {
  getActiveBinding,
  getPrimaryBinding,
  assertCoachReadStudent,
  assertSelfOrBoundCoach,
  hasRole
}
