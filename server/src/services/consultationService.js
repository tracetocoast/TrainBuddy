/**
 * API28 咨询链路（AC40 幂等）
 * 状态：new / contacted / converted / closed
 * converted = 关联真实预约；不生成订单。
 */

const time = require('../lib/time')
const { makeId } = require('../lib/ids')
const { AppError } = require('../lib/errors')

function ensureConsultations(state) {
  if (!state.consultations) state.consultations = []
  return state.consultations
}

function createConsultation(state, actor, body, idempotencyKey) {
  const list = ensureConsultations(state)

  // AC40：同幂等键返回原单，不生成订单
  if (idempotencyKey) {
    const existing = list.find(
      (c) => c.studentId === actor.userId && c.idempotencyKey === idempotencyKey
    )
    if (existing) return present(existing)
  }

  const coachUserId = body.coach_user_id || body.coachUserId
  if (!coachUserId) {
    // 尝试默认主教练
    const primary = (state.bindings || []).find(
      (b) => b.studentId === actor.userId && b.status === 'active' && b.isPrimary
    )
    if (!primary) {
      throw new AppError('VALIDATION', '无绑定教练，请先输入邀请或指定咨询教练')
    }
    body = Object.assign({}, body, { coach_user_id: primary.coachUserId })
  }

  const resolvedCoach = body.coach_user_id || body.coachUserId
  const binding = (state.bindings || []).find(
    (b) =>
      b.studentId === actor.userId &&
      b.coachUserId === resolvedCoach &&
      b.status === 'active'
  )
  if (!binding) {
    throw new AppError('FORBIDDEN', '只能咨询已绑定的选定教练')
  }

  const c = {
    id: makeId('consult'),
    studentId: actor.userId,
    studentName: actor.displayName,
    coachUserId: resolvedCoach,
    coachId: binding.coachId,
    goalGroupId: body.goal_group_id || body.goalGroupId || null,
    goalTaskId: body.goal_task_id || body.goalTaskId || null,
    note: body.note || body.message || '',
    status: 'new',
    bookingId: null,
    orderId: null,
    idempotencyKey: idempotencyKey || null,
    revision: 1,
    createdAt: time.nowMs(),
    updatedAt: time.nowMs()
  }
  list.push(c)

  // 通知教练
  if (!state.notifications) state.notifications = []
  state.notifications.push({
    id: makeId('ntf'),
    userId: resolvedCoach,
    title: '新的方案咨询',
    body: (actor.displayName || '学员') + '发起了咨询' + (c.goalGroupId ? '（含目标图引用）' : ''),
    createdAt: time.nowMs(),
    readAt: null,
    meta: { consultation_id: c.id }
  })

  return present(c)
}

function patchConsultation(state, actor, id, body) {
  const list = ensureConsultations(state)
  const c = list.find((x) => x.id === id)
  if (!c) throw new AppError('NOT_FOUND', '咨询不存在')
  if (c.studentId !== actor.userId && c.coachUserId !== actor.userId) {
    throw new AppError('FORBIDDEN', '无权修改')
  }
  if (body.base_revision != null && Number(body.base_revision) !== c.revision) {
    throw new AppError('REVISION_CONFLICT', '咨询已被更新', {
      extra: { latest_revision: c.revision }
    })
  }

  const next = body.status
  if (next) {
    if (['new', 'contacted', 'converted', 'closed'].indexOf(next) < 0) {
      throw new AppError('VALIDATION', '非法状态')
    }
    if (next === 'converted') {
      const bookingId = body.booking_id || body.bookingId
      if (!bookingId) {
        throw new AppError('VALIDATION', 'converted 须引用真实预约')
      }
      const booking = (((state.schedule || {}).bookings) || []).find((b) => b.id === bookingId)
      if (!booking) throw new AppError('VALIDATION', '预约不存在，不能伪造成交')
      c.bookingId = bookingId
    }
    // 明确不生成订单
    if (body.order_id || body.create_order) {
      throw new AppError('VALIDATION', '咨询链路不生成订单')
    }
    c.status = next
  }
  if (body.note != null) c.note = body.note
  c.revision += 1
  c.updatedAt = time.nowMs()
  return present(c)
}

function listConsultations(state, actor) {
  return ensureConsultations(state)
    .filter((c) => c.studentId === actor.userId || c.coachUserId === actor.userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(present)
}

function getConsultation(state, actor, id) {
  const c = ensureConsultations(state).find((x) => x.id === id)
  if (!c) throw new AppError('NOT_FOUND', '咨询不存在')
  if (c.studentId !== actor.userId && c.coachUserId !== actor.userId) {
    throw new AppError('FORBIDDEN', '无权查看')
  }
  return present(c)
}

function present(c) {
  return {
    consultation_id: c.id,
    student_id: c.studentId,
    coach_user_id: c.coachUserId,
    goal_group_id: c.goalGroupId,
    goal_task_id: c.goalTaskId,
    note: c.note,
    status: c.status,
    booking_id: c.bookingId,
    order_id: null,
    revision: c.revision,
    created_at: c.createdAt,
    updated_at: c.updatedAt
  }
}

module.exports = {
  createConsultation,
  patchConsultation,
  listConsultations,
  getConsultation
}
