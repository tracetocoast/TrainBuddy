/**
 * 体态报告查询与教练复核（API27）
 * 不采用总分；复核不覆盖原 AI 结果。
 */

const time = require('../lib/time')
const { AppError } = require('../lib/errors')
const { assertCoachReadStudent } = require('../lib/permission')
const { ensurePosture } = require('./ai/aiTaskService')

const REVIEW_DECISIONS = ['reviewed', 'needs_more_info', 'rejected']

function getReport(state, actor, reportId) {
  const posture = ensurePosture(state)
  const r = posture.reports.find((x) => x.id === reportId)
  if (!r) throw new AppError('NOT_FOUND', '报告不存在')
  if (r.studentId !== actor.userId) {
    assertCoachReadStudent(state, actor.userId, r.studentId)
  }
  return presentReport(r)
}

function listReports(state, actor, filter = {}) {
  const posture = ensurePosture(state)
  const studentId = filter.student_id || actor.userId
  if (studentId !== actor.userId) {
    assertCoachReadStudent(state, actor.userId, studentId)
  }
  return posture.reports
    .filter((r) => r.studentId === studentId)
    .filter((r) => (filter.is_demo != null ? !!r.isDemo === !!filter.is_demo : true))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(presentReport)
}

/**
 * 教练复核：写入 review 层，保留 aiSnapshot 原样（不覆盖）
 */
function reviewReport(state, actor, reportId, body) {
  const posture = ensurePosture(state)
  const r = posture.reports.find((x) => x.id === reportId)
  if (!r) throw new AppError('NOT_FOUND', '报告不存在')
  assertCoachReadStudent(state, actor.userId, r.studentId)

  const decision = body.decision || body.conclusion
  if (!decision || REVIEW_DECISIONS.indexOf(decision) < 0) {
    throw new AppError('VALIDATION', 'decision 须为 reviewed / needs_more_info / rejected')
  }
  if (body.base_revision != null && Number(body.base_revision) !== r.revision) {
    throw new AppError('REVISION_CONFLICT', '报告已被更新', {
      extra: { latest_revision: r.revision }
    })
  }

  r.review = {
    decision,
    coachUserId: actor.userId,
    coachName: actor.displayName,
    note: body.note || body.reason || '',
    itemOverrides: body.item_overrides || body.itemOverrides || null,
    reviewedAt: time.nowMs()
  }
  // 状态随复核，但不改写 items / aiSnapshot
  if (decision === 'reviewed') r.status = 'reviewed'
  else if (decision === 'needs_more_info') r.status = 'needs_more_info'
  else r.status = 'rejected'
  r.revision += 1
  r.updatedAt = time.nowMs()
  return presentReport(r)
}

function presentReport(r) {
  return {
    report_id: r.id,
    task_id: r.taskId,
    student_id: r.studentId,
    status: r.status,
    is_demo: !!r.isDemo,
    overall_score: null,
    model_version: r.modelVersion,
    items: r.items,
    improvement_hints: r.improvementHints,
    front_media_id: r.frontMediaId,
    side_media_id: r.sideMediaId,
    review: r.review,
    ai_snapshot_preserved: !!r.aiSnapshot,
    revision: r.revision,
    created_at: r.createdAt,
    updated_at: r.updatedAt
  }
}

module.exports = {
  getReport,
  listReports,
  reviewReport,
  presentReport
}
