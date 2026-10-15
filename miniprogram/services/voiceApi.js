/**
 * 课后表语音：录音 → 转写 → 结构化 → 确认合并
 */
const http = require('../utils/http')

function listProviders() {
  return http.get('/voice/providers').then((res) => res.data)
}

function createTask(sessionId, body, idempotencyKey) {
  return http
    .post('/sessions/' + sessionId + '/voice-tasks', body, {
      idempotencyKey: idempotencyKey || 'vt_' + Date.now()
    })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function getTask(sessionId, taskId) {
  return http
    .get('/sessions/' + sessionId + '/voice-tasks/' + taskId)
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function listTasks(sessionId) {
  return http
    .get('/sessions/' + sessionId + '/voice-tasks')
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function mergeTask(sessionId, taskId, body, idempotencyKey) {
  return http
    .post('/sessions/' + sessionId + '/voice-tasks/' + taskId + '/merge', body, {
      idempotencyKey: idempotencyKey || 'vm_' + taskId + '_' + Date.now()
    })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function undoMerge(sessionId) {
  return http
    .post('/sessions/' + sessionId + '/voice-tasks/undo-merge', {})
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function parseText(sessionId, text) {
  return http
    .post('/sessions/' + sessionId + '/parse-text', { text })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

module.exports = {
  listProviders,
  createTask,
  getTask,
  listTasks,
  mergeTask,
  undoMerge,
  parseText
}
