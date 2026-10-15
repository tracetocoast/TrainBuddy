/** diaryService 依赖的 bindingApi 形状 */
const bindingService = require('./bindingService')

function getActivePrimaryCoach(app, studentId) {
  const state = app.globalData
  return (state.bindings || []).find(
    (b) => b.studentId === studentId && b.status === 'active' && b.isPrimary
  )
}

module.exports = {
  getActivePrimaryCoach,
  listBoundStudentsForCoach: (app, coachUserId) =>
    bindingService.listBoundStudents(app.globalData, coachUserId)
}
