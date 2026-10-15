const http = require('../utils/http')
const time = require('../utils/time')

function getSummary(app, studentId, range) {
  const q = { student_id: studentId }
  if (range && range.from) q.from = range.from
  if (range && range.to) q.to = range.to
  return http.get('/growth/summary', q).then((res) => ({
    data: res.data,
    request_id: res.request_id
  }))
}

function startOfWeek(dateKey) {
  const ms = time.shanghaiLocalToMs(dateKey, '12:00')
  const wd = time.toShanghaiParts(ms).weekday
  const offset = wd === 0 ? -6 : 1 - wd
  return time.addDays(dateKey, offset)
}

function monthRange(dateKey) {
  const p = time.parseDateKey(dateKey)
  const from = p.y + '-' + (p.m < 10 ? '0' : '') + p.m + '-01'
  const nextM = p.m === 12 ? 1 : p.m + 1
  const nextY = p.m === 12 ? p.y + 1 : p.y
  const nextFirst = nextY + '-' + (nextM < 10 ? '0' : '') + nextM + '-01'
  const to = time.addDays(nextFirst, -1)
  return { from, to }
}

module.exports = { getSummary, startOfWeek, monthRange }
