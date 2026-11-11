const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('path')
const vm = require('node:vm')
const { createTestApp } = require('./helpers')

function loadBookingApi(http) {
  const moduleObj = { exports: {} }
  const source = fs.readFileSync(path.join(__dirname, '../../miniprogram/services/bookingApi.js'), 'utf8')
  vm.runInNewContext(source, {
    require: (id) => {
      if (id.includes('http')) return http
      if (id.includes('scheduleConfig')) return { SCHEDULE_CONFIG: {} }
      throw new Error(id)
    },
    module: moduleObj,
    exports: moduleObj.exports
  })
  return moduleObj.exports
}

test('setAttendance uses a distinct idempotency key per attendance status', async () => {
  const calls = []
  const api = loadBookingApi({
    post(path, body, opts) {
      calls.push({ path, body, key: opts.idempotencyKey })
      return Promise.resolve({ data: { status: body.status }, request_id: 'r1' })
    }
  })
  await api.setAttendance({}, 'bk1', { status: 'in_progress', coachId: 'c1', note: '' })
  await api.setAttendance({}, 'bk1', { status: 'completed', coachId: 'c1', note: '' })
  await api.setAttendance({}, 'bk1', { status: 'no_show', coachId: 'c1' })
  assert.deepEqual(calls.map((row) => row.key), [
    'att_bk1_in_progress',
    'att_bk1_completed',
    'att_bk1_no_show'
  ])
  assert.equal(calls[0].body.status, 'in_progress')
  assert.equal(calls[0].body.note, '')
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].body, 'coachId'), false)
})

test('starting then completing a class does not trip idempotency conflict', async () => {
  const ctx = createTestApp()
  try {
    const coach = await ctx.login('coach_approved')
    const stu = await ctx.login('student_only')
    await ctx.bindStudent(stu.sessionToken)
    const slot = await ctx.findOpenSlot(stu.sessionToken, 'coach_001')
    const created = await ctx.request('POST', '/api/v1/bookings', {
      token: stu.sessionToken,
      body: {
        coach_id: 'coach_001',
        start_at: slot.startAt,
        course_type_id: 'private_strength_60',
        accepted_rules_version: ctx.config.schedule.rulesVersion
      },
      headers: { 'Idempotency-Key': 'attfix_book' }
    })
    assert.equal(created.status, 200, JSON.stringify(created.body))
    const id = created.body.data.booking_id
    const accepted = await ctx.request('POST', '/api/v1/bookings/' + id + '/accept', {
      token: coach.sessionToken,
      body: { revision: created.body.data.revision },
      headers: { 'Idempotency-Key': 'attfix_acc' }
    })
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
    const started = await ctx.request('POST', '/api/v1/bookings/' + id + '/attendance', {
      token: coach.sessionToken,
      body: { status: 'in_progress', note: '' },
      headers: { 'Idempotency-Key': 'att_' + id + '_in_progress' }
    })
    assert.equal(started.status, 200, JSON.stringify(started.body))
    const done = await ctx.request('POST', '/api/v1/bookings/' + id + '/attendance', {
      token: coach.sessionToken,
      body: { status: 'completed', note: '' },
      headers: { 'Idempotency-Key': 'att_' + id + '_completed' }
    })
    assert.equal(done.status, 200, JSON.stringify(done.body))
    assert.equal(done.body.data.status, 'completed')
    const again = await ctx.request('POST', '/api/v1/bookings/' + id + '/attendance', {
      token: coach.sessionToken,
      body: { status: 'completed', note: '' },
      headers: { 'Idempotency-Key': 'att_' + id + '_completed' }
    })
    assert.equal(again.status, 200)
    const conflict = await ctx.request('POST', '/api/v1/bookings/' + id + '/attendance', {
      token: coach.sessionToken,
      body: { status: 'no_show', note: '' },
      headers: { 'Idempotency-Key': 'att_' + id + '_completed' }
    })
    assert.equal(conflict.status, 409)
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT')
  } finally {
    await ctx.cleanup()
  }
})
