const { it } = require('node:test')
const assert = require('node:assert/strict')
const { chartView, moveMonth } = require('../../miniprogram/utils/bodyInsights')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function setupPage() {
  let page
  const filename = path.resolve(__dirname, '../../miniprogram/pages/body-data/index.js')
  const load = createRequire(filename)
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: value => { page = value },
    require: id => id.includes('guard') ? { requireLogin: () => true } : load(id)
  })
  page.setData = patch => Object.assign(page.data, patch)
  page.rows = rows
  page.setData({ month: '2026-10', selectedDate: '2026-10-21' })
  return page
}

const rows = [
  { id: 'late', date: '2026-10-22', time: '18:00', measuredAt: Date.parse('2026-10-22T18:00:00+08:00'), values: { weight: 70, bodyFat: 20 } },
  { id: 'old', date: '2026-09-01', values: { weight: 80 } },
  { id: 'early', date: '2026-10-22', time: '08:00', measuredAt: Date.parse('2026-10-22T08:00:00+08:00'), values: { weight: 71 } },
  { id: 'prior', date: '2026-10-21', values: { weight: 72, waist: 85 } }
]

it('chart periods retain timed measurements and compare the latest two records', () => {
  const chart = chartView(rows, 'weight', 'kg', 'day', '', '', '2026-10-22')
  assert.equal(chart.count, 2)
  assert.equal(chart.latest, 70)
  assert.equal(chart.previousChange, '-1')
  assert.equal(chart.average, 70.5)
  assert.deepEqual(chart.dots.map(point => point.id), ['early', 'late'])
  assert.ok(chart.dots[0].x < chart.dots[1].x)
  assert.ok(chart.dots.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)))
})

it('custom dates are inclusive, unit conversion includes statistics, and source records stay unchanged', () => {
  const before = JSON.stringify(rows)
  const chart = chartView(rows, 'weight', 'jin', 'day', '2026-10-21', '2026-10-22', '2026-10-22')
  assert.equal(chart.count, 3)
  assert.equal(chart.latest, 140)
  assert.equal(chart.average, 142)
  assert.equal(chart.previousChange, '-2')
  assert.equal(chart.metric.unit, '斤')
  assert.equal(JSON.stringify(rows), before)
})

it('end-only filters anchor the chosen period to that end date', () => {
  const chart = chartView(rows, 'weight', 'kg', 'week', '', '2026-09-01', '2026-10-22')
  assert.equal(chart.from, '2026-08-26')
  assert.equal(chart.latest, 80)
  assert.equal(chart.count, 1)
  assert.equal(chart.previousChange, '—')
})

it('empty data and equal-valued samples produce valid chart coordinates', () => {
  assert.equal(chartView([], 'waist', 'kg', 'month', '', '', '2026-10-22').average, '—')
  const chart = chartView(rows, 'bodyFat', 'jin', 'year', '', '', '2026-10-22')
  assert.equal(chart.metric.unit, '%')
  assert.equal(chart.latest, 20)
  assert.ok(chart.dots.every(point => point.y >= 30 && point.y <= 270))
})

it('calendar month navigation crosses year and leap-month boundaries', () => {
  assert.equal(moveMonth('2026-12', 1), '2027-01')
  assert.equal(moveMonth('2026-01', -1), '2025-12')
  assert.equal(moveMonth('2024-02', 1), '2024-03')
})

it('calendar aligns Monday-first and marks only the chosen metric while retaining every timed record', () => {
  const page = setupPage()
  page.renderCalendar()
  assert.equal(page.data.days.filter(day => day.empty).length, 3)
  assert.equal(page.data.days.filter(day => !day.empty).length, 31)
  assert.equal(page.data.dayRows.length, 1)
  page.onCalendarMetric({ currentTarget: { dataset: { key: 'bodyFat' } } })
  assert.equal(page.data.dayRows.length, 0)
  assert.equal(page.data.days.find(day => day.date === '2026-10-21').hasData, false)
  page.onDay({ currentTarget: { dataset: { date: '2026-10-22' } } })
  assert.equal(page.data.dayRows.length, 1)
  assert.equal(page.data.dayRows[0].time, '18:00')
  page.onCalendarMetric({ currentTarget: { dataset: { key: 'weight' } } })
  assert.equal(page.data.dayRows.length, 2)
  page.setData({ month: '2024-02' })
  page.renderCalendar()
  assert.equal(page.data.days.filter(day => !day.empty).length, 29)
})

it('invalid custom date order is rejected without replacing the current filter', () => {
  const page = setupPage()
  page.setData({ startDate: '2026-10-21', endDate: '2026-10-22' })
  page.onFilterDate({ currentTarget: { dataset: { field: 'startDate' } }, detail: { value: '2026-10-23' } })
  assert.equal(page.data.startDate, '2026-10-21')
  assert.ok(page.data.filterError)
})
