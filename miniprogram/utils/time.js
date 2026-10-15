/** Asia/Shanghai 业务日工具（演示用；正式可换 dayjs/tz） */

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 当前上海墙钟时间近似：本地若已是 CST 则直接用；否则用固定 +8 偏移 */
function nowMs() {
  return Date.now()
}

function toShanghaiParts(ms) {
  // 用 UTC+8 固定构造，避免依赖运行环境时区
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

/** 上海本地日期 + 时分 → epoch ms */
function shanghaiLocalToMs(dateKey, hm) {
  const d = parseDateKey(dateKey)
  if (!d) return null
  const parts = String(hm).split(':')
  const hour = +parts[0]
  const min = +(parts[1] || 0)
  // Date.UTC(...) - 8h = 上海本地对应的绝对时间
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

function listDateKeys(fromKey, count) {
  const list = []
  for (let i = 0; i < count; i++) list.push(addDays(fromKey, i))
  return list
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
  listDateKeys,
  todayKey,
  overlaps,
  isoShanghai,
  parseDateKey
}
