/**
 * API18–21 日记 / 共享 / 反馈（远程）
 */
const http = require('../utils/http')

const MEAL_TYPES = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' }
]

const SPECIAL_TYPES = [
  { key: 'travel', label: '出差' },
  { key: 'overtime', label: '加班' },
  { key: 'period', label: '生理期' },
  { key: 'injury', label: '受伤/不适' },
  { key: 'other', label: '其他' }
]

function getDailyView(app, studentId, localDate) {
  return http
    .get('/daily-logs', { student_id: studentId, date: localDate })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function setRestDay(app, studentId, localDate, restDay, note) {
  return http
    .request('PUT', '/daily-logs/' + localDate + '/state', {
      body: { restDay, note }
    })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function addMeal(app, payload) {
  return http
    .post('/meals', {
      date: payload.localDate,
      mealType: payload.mealType,
      foodText: payload.foodText,
      portionText: payload.portionText
    })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function deleteMeal(app, mealId) {
  return http
    .del('/meals/' + mealId)
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function addWater(app, studentId, localDate, amountMl) {
  return http
    .post('/waters', { date: localDate, amountMl })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function upsertBodyState(app, studentId, localDate, patch) {
  return http
    .request('PUT', '/daily-logs/' + localDate + '/state', { body: patch })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function shareDayCategory(app, studentId, localDate, category) {
  return http.post('/shares', { date: localDate, category }).then((res) => ({
    data: res.data,
    request_id: res.request_id,
    hint: null
  }))
}

function revokeDayCategory(app, studentId, localDate, category) {
  return http
    .del(
      '/shares?date=' +
        encodeURIComponent(localDate) +
        '&category=' +
        encodeURIComponent(category)
    )
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function getSharedDailyForCoach(app, coachUserId, studentId, localDate) {
  return http
    .get('/daily-logs', { student_id: studentId, date: localDate })
    .then((res) => {
      const data = res.data
      if (!data.canSee) {
        const vis = data.visible || {}
        data.canSee = {
          workout: Array.isArray(vis.sessions),
          meal: Array.isArray(vis.meals),
          body: Object.prototype.hasOwnProperty.call(vis, 'bodyState'),
          special: Object.prototype.hasOwnProperty.call(vis, 'special')
        }
      }
      return { data, request_id: res.request_id }
    })
}

function addFeedback(app, payload) {
  return http
    .post('/feedback', {
      student_id: payload.studentId,
      target_id: payload.targetId,
      target_type: payload.targetType,
      text: payload.text
    }, { idempotencyKey: payload.idempotencyKey })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function listFeedback(app, filter) {
  return http
    .get('/feedback', {
      student_id: filter.studentId,
      target_id: filter.targetId
    })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function getCalendarMarkers(app, studentId, fromDate, toDate) {
  return http
    .get('/calendar/markers', {
      student_id: studentId,
      from: fromDate,
      to: toDate
    })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

module.exports = {
  MEAL_TYPES,
  SPECIAL_TYPES,
  getDailyView,
  setRestDay,
  addMeal,
  deleteMeal,
  addWater,
  upsertBodyState,
  shareDayCategory,
  revokeDayCategory,
  getSharedDailyForCoach,
  addFeedback,
  listFeedback,
  getCalendarMarkers
}
