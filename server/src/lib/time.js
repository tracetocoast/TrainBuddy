/** Asia/Shanghai 业务日（服务端权威） */

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function nowMs() {
  return Date.now()
}

function toShanghaiParts(ms) {
  const d = new Date(ms + 8 * 3600 * 1000)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    min: d.getUTCMinutes(),
    sec: d.getUTCSeconds(),
    weekday: d.getUTCDay()
  }
}

function shanghaiDateKey(ms) {
  const p = toShanghaiParts(ms)
  return p.y + '-' + pad(p.m) + '-' + pad(p.day)
}

function parseDateKey(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) return null
  return { y: +m[1], m: +m[2], day: +m[3] }
}

function shanghaiLocalToMs(dateKey, hm) {
  const d = parseDateKey(dateKey)
  if (!d) return null
  const parts = String(hm).split(':')
  const hour = +parts[0]
  const min = +(parts[1] || 0)
  return Date.UTC(d.y, d.m - 1, d.day, hour, min, 0) - 8 * 3600 * 1000
}

function formatHm(ms) {
  const p = toShanghaiParts(ms)
  return pad(p.hour) + ':' + pad(p.min)
}

function formatDateLabel(dateKey) {
  const d = parseDateKey(dateKey)
  if (!d) return dateKey
  const ms = shanghaiLocalToMs(dateKey, '12:00')
  const wd = toShanghaiParts(ms).weekday
  return {
    dateKey,
    weekday: '周' + WEEKDAY_CN[wd],
    day: pad(d.day),
    month: d.m,
    year: d.y,
    label: d.m + '/' + d.day
  }
}

function addDays(dateKey, n) {
  const ms = shanghaiLocalToMs(dateKey, '12:00') + n * 24 * 3600 * 1000
  return shanghaiDateKey(ms)
}

function todayKey() {
  return shanghaiDateKey(nowMs())
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart
}

function isoShanghai(ms) {
  const p = toShanghaiParts(ms)
  return (
    p.y +
    '-' +
    pad(p.m) +
    '-' +
    pad(p.day) +
    'T' +
    pad(p.hour) +
    ':' +
    pad(p.min) +
    ':' +
    pad(p.sec) +
    '+08:00'
  )
}

module.exports = {
  WEEKDAY_CN,
  nowMs,
  toShanghaiParts,
  shanghaiDateKey,
  shanghaiLocalToMs,
  formatHm,
  formatDateLabel,
  addDays,
  todayKey,
  overlaps,
  isoShanghai,
  parseDateKey
}
