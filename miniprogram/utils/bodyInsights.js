const bodyApi = require('../services/bodyMeasurementApi')
const time = require('./time')

function chartView(records, key, unit, period, start, end, today) {
  const metric = bodyApi.METRICS.find(item => item.key === key) || bodyApi.METRICS[0]
  const factor = metric.unit === 'kg' && unit === 'jin' ? 2 : 1
  const to = end || today
  const from = start || time.addDays(to, 1 - ({ day: 1, week: 7, month: 30, year: 365 }[period] || 30))
  const rows = records.filter(row => row.date >= from && row.date <= to).map(row => Object.assign({}, row, {
    values: Object.assign({}, row.values, { [metric.key]: row.values[metric.key] == null ? null : row.values[metric.key] * factor })
  }))
  const trend = bodyApi.trend(rows, metric.key)
  const values = trend.dots.map(point => point.value)
  const span = trend.count ? Math.max(trend.max - trend.min, metric.unit === '%' ? 1 : 0.5) : 1
  const low = trend.count ? trend.min - span * 0.2 : 0
  const high = trend.count ? trend.max + span * 0.2 : 1
  const dots = trend.dots.map(point => Object.assign({}, point, {
    x: Number((12 + (point.x - 10) / 580 * 398).toFixed(2)),
    y: Number((270 - (point.value - low) / (high - low) * 240).toFixed(2)),
    label: Number(point.value.toFixed(2)), showLabel: false
  }))
  dots.forEach((point, index) => { point.showLabel = index === 0 || index === dots.length - 1 || index % Math.max(1, Math.ceil(dots.length / 5)) === 0 })
  const lines = dots.slice(1).map((point, index) => {
    const previous = dots[index], dx = point.x - previous.x, dy = point.y - previous.y
    return { id: point.id, style: `left:${previous.x}rpx;top:${previous.y}rpx;width:${Math.sqrt(dx * dx + dy * dy)}rpx;transform:rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)` }
  })
  const previous = values.length > 1 ? values[values.length - 2] : null
  const delta = previous == null ? null : Number((trend.latest - previous).toFixed(2))
  const labels = dots.filter((point, index) => index === 0 || index === dots.length - 1 || (dots.length > 4 && index === Math.floor(dots.length / 2))).map(point => ({ id: point.id, text: point.date.slice(5).replace('-', '/'), x: point.x }))
  return Object.assign({}, trend, {
    metric: Object.assign({}, metric, { unit: metric.unit === 'kg' ? (factor === 2 ? '斤' : '公斤') : metric.unit }),
    dots, lines, labels, from, to,
    latest: trend.count ? Number(Number(trend.latest).toFixed(2)) : '—',
    average: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : '—',
    previousChange: delta == null ? '—' : (delta > 0 ? '+' : '') + delta,
    axes: Array.from({ length: 5 }, (_, index) => ({ key: index, y: 30 + index * 60, value: Number((high - (high - low) * index / 4).toFixed(2)) }))
  })
}

function moveMonth(month, step) {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + step, 1))
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0')
}

module.exports = { chartView, moveMonth }
