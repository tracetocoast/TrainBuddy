const { AppError } = require('./errors')
const { assertCoachReadStudent, hasRole } = require('./permission')

function canEditPlan(state, actor, plan) {
  if (plan.author_id !== actor.userId) return false
  if (plan.author_role !== 'coach') return plan.student_id === actor.userId
  if (!hasRole(actor, 'coach')) return false
  try { assertCoachReadStudent(state, actor.userId, plan.student_id); return true }
  catch (_) { return false }
}

function presentForActor(state, actor, plan, write) {
  const editable = canEditPlan(state, actor, plan)
  if (write && !editable) throw new AppError('FORBIDDEN', '只有计划作者可修改，教练还需有效服务关系')
  if (!editable) {
    if (plan.student_id !== actor.userId || !plan.published) {
      throw new AppError('FORBIDDEN', '该计划尚未发布或不属于你')
    }
    return Object.assign({}, plan, { latest_draft: null, can_edit: false })
  }
  return Object.assign({}, plan, { can_edit: true })
}

module.exports = { canEditPlan, presentForActor }
