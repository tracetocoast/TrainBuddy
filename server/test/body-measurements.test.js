const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createTestApp } = require('./helpers')
const { MemoryStore } = require('../src/store/memoryStore')
const { trend } = require('../../miniprogram/services/bodyMeasurementApi')

describe('Body measurements: private persistent history and trends', () => {
  let ctx, student, coach, other, date
  beforeEach(async () => {
    ctx = createTestApp()
    student = await ctx.login('student_only')
    coach = await ctx.login('coach_approved')
    other = await ctx.login('student_claim_coach')
    date = ctx.time.todayKey()
  })
  afterEach(async () => { await ctx.cleanup() })
  const save = (date, values, revision = 0) => ctx.request('PUT', '/api/v1/body-measurements/' + date, { token: student.sessionToken, body: { values, base_revision: revision } })
  const list = token => ctx.request('GET', '/api/v1/body-measurements', { token: token || student.sessionToken })

  it('persists dated partial measurements, sorts history and updates one day without duplicating it', async () => {
    assert.equal((await save(date, { weight: 70.2, waist: 82 })).status, 200)
    const previous = ctx.time.addDays(date, -12)
    assert.equal((await save(previous, { waist: 84 })).status, 200)
    assert.equal((await save(date, { bodyFat: 20, waist: 81.5 }, 1)).status, 200)
    const rows = (await list()).body.data
    assert.equal(rows.length, 2)
    assert.equal(rows[0].date, previous)
    assert.deepEqual(rows[1].values, { weight: 70.2, waist: 81.5, bodyFat: 20 })
    assert.equal(rows[1].revision, 2)
    const restored = new MemoryStore(ctx.store.filePath)
    assert.deepEqual(restored.state.bodyMeasurements, ctx.store.state.bodyMeasurements)
  })

  it('keeps measurements private even from a bound coach with body-state sharing', async () => {
    await ctx.bindStudent(student.sessionToken)
    await save(date, { weight: 70 })
    assert.deepEqual((await list(other.sessionToken)).body.data, [])
    for (const token of [other.sessionToken, coach.sessionToken]) {
      assert.equal((await ctx.request('GET', '/api/v1/body-measurements?student_id=u_stu_001', { token })).status, 403)
      assert.equal((await ctx.request('PUT', '/api/v1/body-measurements/' + date, { token, body: { student_id: 'u_stu_001', values: { weight: 80 }, base_revision: 1 } })).status, 403)
    }
    assert.equal((await ctx.request('GET', '/api/v1/body-measurements')).status, 401)
  })

  it('rejects stale saves and invalid data without changing existing records', async () => {
    await save(date, { weight: 70 })
    assert.equal((await save(date, { weight: 80 }, 0)).status, 409)
    for (const values of [{ weight: 0 }, { weight: '75' }, { bodyFat: 100 }, { mystery: 10 }, { constructor: 10 }, { waist: 80, weight: -1 }, { weight: null }]) {
      assert.equal((await save(date, values, 1)).status, 422)
    }
    assert.equal((await save('2026-02-30', { weight: 70 })).status, 422)
    assert.equal((await save(ctx.time.addDays(date, 1), { weight: 70 })).status, 422)
    assert.deepEqual((await list()).body.data[0].values, { weight: 70 })
    assert.equal((await list()).body.data[0].revision, 1)
  })

  it('allows explicit clearing of one metric while retaining other measurements', async () => {
    await save(date, { weight: 70, waist: 80 })
    const updated = await save(date, { waist: null }, 1)
    assert.equal(updated.status, 200)
    assert.deepEqual(updated.body.data.values, { weight: 70 })
  })

  it('plots real calendar spacing, omits missing values and calculates metric-specific deltas', () => {
    const rows = [
      { date: '2026-10-01', values: { weight: 70, bodyFat: 22 } },
      { date: '2026-10-02', values: { weight: 69.8 } },
      { date: '2026-10-11', values: { weight: 69, bodyFat: 20 } }
    ]
    const chart = trend(rows, 'weight')
    assert.equal(chart.deltaText, '-1 kg')
    assert.equal(chart.dots[1].x, 68)
    assert.equal(chart.lines.length, 2)
    assert.equal(trend(rows, 'bodyFat').deltaText, '-2 个百分点')
    assert.equal(trend(rows, 'weight', '2026-10-05').deltaText, '至少两次记录后显示变化')
    assert.equal(trend(rows, 'waist').count, 0)
    assert.equal(trend(rows, 'waist').latest, '—')
  })
})
