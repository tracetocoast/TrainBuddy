const { AppError } = require('../lib/errors')
const time = require('../lib/time')
const { makeId } = require('../lib/ids')

// 数据输入边界，不代表健康范围或诊断阈值。
const limits = {
  weight: [1, 500], targetWeight: [1, 500], bodyFat: [0.1, 80], muscleMass: [0.1, 300],
  height: [30, 260], shoulder: [10, 300], chest: [10, 300], waist: [10, 300],
  hip: [10, 300], neck: [5, 100], shoulderWidth: [5, 100],
  upperArm: [5, 150], thigh: [5, 200], calf: [5, 150],
  upperArmLeft: [5, 150], upperArmRight: [5, 150], forearmLeft: [5, 100], forearmRight: [5, 100],
  thighLeft: [5, 200], thighRight: [5, 200], calfLeft: [5, 150], calfRight: [5, 150]
}

function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(date + 'T12:00:00Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

function assertOwner(actor, studentId) {
  if (studentId && studentId !== actor.userId) throw new AppError('FORBIDDEN', '身体测量记录目前仅本人可见')
}

function list(state, actor, query = {}) {
  assertOwner(actor, query.student_id)
  for (const key of ['from', 'to']) {
    if (query[key] && !validDate(query[key])) throw new AppError('VALIDATION', '日期格式不正确')
  }
  if (query.from && query.to && query.from > query.to) throw new AppError('VALIDATION', '开始日期不能晚于结束日期')
  return (state.bodyMeasurements || []).concat(state.bodyMeasurementEntries || []).filter(row => row.userId === actor.userId &&
    (!query.from || row.date >= query.from) && (!query.to || row.date <= query.to))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.measuredAt || 0) - (b.measuredAt || 0) || (a.createdAt || 0) - (b.createdAt || 0))
    .map(row => Object.assign({}, JSON.parse(JSON.stringify(row)), {
      id: row.id || 'legacy_' + row.userId + '_' + row.date,
      timeLabel: row.time || '时间未记录'
    }))
}

function append(state, actor, body, intentKey, intentHash) {
  assertOwner(actor, body.student_id)
  if (!validDate(body.date) || body.date < '1900-01-01') throw new AppError('VALIDATION', '请填写有效的测量日期')
  if (typeof body.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) throw new AppError('VALIDATION', '请填写有效的测量时间')
  const measuredAt = time.shanghaiLocalToMs(body.date, body.time)
  if (measuredAt > Date.now()) throw new AppError('FUTURE_CHECKIN', '不能记录未来的身体测量')
  if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) throw new AppError('VALIDATION', '请填写测量数值')
  const values = {}
  for (const [key, value] of Object.entries(body.values)) {
    if (!Object.prototype.hasOwnProperty.call(limits, key)) throw new AppError('VALIDATION', '不支持的测量指标')
    const bound = limits[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < bound[0] || value > bound[1]) throw new AppError('VALIDATION', '测量数值不正确，请核对单位与输入')
    values[key] = Math.round(value * 100) / 100
  }
  if (!Object.keys(values).length) throw new AppError('VALIDATION', '请填写至少一个测量数值')
  const intent = intentKey && (state.bodyMeasurementIntents || {})[intentKey]
  if (intent) {
    if (intent.hash !== intentHash) throw new AppError('IDEMPOTENCY_CONFLICT', '同一保存请求的内容不一致')
    const existing = (state.bodyMeasurementEntries || []).find(row => row.id === intent.id && row.userId === actor.userId)
    if (existing) return existing
  }
  const row = { id: makeId('bm'), userId: actor.userId, date: body.date, time: body.time, measuredAt, createdAt: Date.now(), values }
  if (!state.bodyMeasurementEntries) state.bodyMeasurementEntries = []
  state.bodyMeasurementEntries.push(row)
  if (intentKey) {
    if (!state.bodyMeasurementIntents) state.bodyMeasurementIntents = {}
    state.bodyMeasurementIntents[intentKey] = { id: row.id, hash: intentHash }
  }
  return row
}

function save(state, actor, date, body) {
  assertOwner(actor, body.student_id)
  if (!validDate(date) || date < '1900-01-01') throw new AppError('VALIDATION', '请填写有效的记录日期')
  if (date > time.todayKey()) throw new AppError('FUTURE_CHECKIN', '不能记录未来的身体测量')
  if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) throw new AppError('VALIDATION', '请填写测量数据')
  const rows = state.bodyMeasurements || []
  const previous = rows.find(row => row.userId === actor.userId && row.date === date)
  const revision = previous ? previous.revision : 0
  if (body.base_revision !== revision) throw new AppError('REVISION_CONFLICT', '该日记录已更新，请重新载入后修改')
  const values = Object.assign({}, previous ? previous.values : {})
  for (const [key, value] of Object.entries(body.values)) {
    if (!Object.prototype.hasOwnProperty.call(limits, key)) throw new AppError('VALIDATION', '不支持的测量指标')
    const bound = limits[key]
    if (value === null) { delete values[key]; continue }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < bound[0] || value > bound[1]) {
      throw new AppError('VALIDATION', '测量数值不正确，请核对单位与输入')
    }
    values[key] = Math.round(value * 100) / 100
  }
  if (!Object.keys(values).length) throw new AppError('VALIDATION', '请至少保留一项身体数据')
  const record = { userId: actor.userId, date, values, revision: revision + 1, updatedAt: Date.now() }
  if (previous) rows[rows.indexOf(previous)] = record
  else rows.push(record)
  state.bodyMeasurements = rows
  return record
}

module.exports = { list, save, append }
