const http = require('../utils/http')

const METRICS = [
  { key: 'weight', label: '体重', unit: 'kg' },
  { key: 'targetWeight', label: '目标体重', unit: 'kg' },
  { key: 'bodyFat', label: '体脂率', unit: '%' },
  { key: 'muscleMass', label: '肌肉量', unit: 'kg' },
  { key: 'waist', label: '腰围', unit: 'cm' },
  { key: 'hip', label: '臀围', unit: 'cm' },
  { key: 'chest', label: '胸围', unit: 'cm' },
  { key: 'shoulder', label: '肩围', unit: 'cm' },
  { key: 'neck', label: '脖围', unit: 'cm' },
  { key: 'shoulderWidth', label: '肩宽', unit: 'cm' },
  { key: 'upperArmLeft', label: '左臂围', unit: 'cm' },
  { key: 'upperArmRight', label: '右臂围', unit: 'cm' },
  { key: 'forearmLeft', label: '左小臂围', unit: 'cm' },
  { key: 'forearmRight', label: '右小臂围', unit: 'cm' },
  { key: 'thighLeft', label: '左腿围', unit: 'cm' },
  { key: 'thighRight', label: '右腿围', unit: 'cm' },
  { key: 'calfLeft', label: '左小腿围', unit: 'cm' },
  { key: 'calfRight', label: '右小腿围', unit: 'cm' },
  { key: 'upperArm', label: '上臂围', unit: 'cm' },
  { key: 'thigh', label: '大腿围', unit: 'cm' },
  { key: 'calf', label: '小腿围', unit: 'cm' },
  { key: 'height', label: '身高', unit: 'cm' }
]

function trend(records, key, from) {
  const stamp = row => row.measuredAt || Date.parse(row.date + 'T00:00:00+08:00')
  const points = records.filter(row => (!from || row.date >= from) && row.values[key] != null).slice().sort((a, b) => stamp(a) - stamp(b) || (a.createdAt || 0) - (b.createdAt || 0))
  const metric = METRICS.find(item => item.key === key) || METRICS[0]
  const latest = points[points.length - 1], first = points[0]
  const values = points.map(row => row.values[key])
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  const start = first ? stamp(first) : 0
  const duration = latest ? stamp(latest) - start : 0
  const dots = points.map((row, index) => ({ id: row.id || row.date + '_' + index, date: row.date, value: row.values[key], x: duration ? 10 + (stamp(row) - start) / duration * 580 : 300, y: max === min ? 100 : 180 - (row.values[key] - min) / span * 160 }))
  const lines = dots.slice(1).map((point, i) => {
    const previous = dots[i], dx = point.x - previous.x, dy = point.y - previous.y
    return { id: point.id, style: 'left:' + previous.x + 'rpx;top:' + previous.y + 'rpx;width:' + Math.sqrt(dx * dx + dy * dy) + 'rpx;transform:rotate(' + Math.atan2(dy, dx) * 180 / Math.PI + 'deg)' }
  })
  const delta = points.length >= 2 ? Number((latest.values[key] - first.values[key]).toFixed(2)) : null
  return { metric, dots, lines, latest: latest ? latest.values[key] : '—', latestDate: latest ? latest.date : '', latestTime: latest ? latest.time || '时间未记录' : '', firstDate: first ? first.date : '', min: values.length ? min : null, max: values.length ? max : null, deltaText: delta == null ? '至少两次记录后显示变化' : (delta > 0 ? '+' : '') + delta + (key === 'bodyFat' ? ' 个百分点' : ' ' + metric.unit), count: points.length }
}

module.exports = {
  METRICS, trend,
  list: () => http.get('/body-measurements'),
  append: (date, time, values, key) => http.post('/body-measurements', { date, time, values }, { idempotencyKey: key }),
  save: (date, values, revision) => http.request('PUT', '/body-measurements/' + date, { body: { values, base_revision: revision } })
}
