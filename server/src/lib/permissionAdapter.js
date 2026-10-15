/** 兼容 diary mock 的 permission.canCoachReadStudent(app, ...) */
const permission = require('./permission')

function canCoachReadStudent(app, coachUserId, studentId, category) {
  try {
    const binding = permission.assertCoachReadStudent(
      app.globalData,
      coachUserId,
      studentId,
      category
    )
    return { ok: true, binding }
  } catch (err) {
    return { ok: false, code: err.code || 'FORBIDDEN', message: err.message }
  }
}

module.exports = { canCoachReadStudent }
