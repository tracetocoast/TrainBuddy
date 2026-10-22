const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestApp } = require('./helpers')

describe('Coach space: meal feedback and synchronized training privacy', () => {
  let ctx, coach, student, foreign, date
  before(async () => {
    ctx = createTestApp()
    coach = await ctx.login('coach_approved')
    student = await ctx.login('student_only')
    foreign = await ctx.login('student_claim_coach')
    date = ctx.time.todayKey()
    await ctx.bindStudent(student.sessionToken)
    await ctx.request('POST', '/api/v1/meals', { token: student.sessionToken, body: { date, mealType: 'lunch', foodText: '米饭、鸡肉、蔬菜' } })
  })
  after(async () => ctx.cleanup())

  const payload = () => ({ student_id: 'u_stu_001', target_type: 'meal', target_id: 'u_stu_001|' + date, text: '午餐搭配不错，晚餐也记得加入蔬菜。' })

  it('requires day sharing and saves a typed suggestion exactly once for student retrieval', async () => {
    let response = await ctx.request('POST', '/api/v1/feedback', { token: coach.sessionToken, body: payload() })
    assert.equal(response.status, 403)
    await ctx.request('POST', '/api/v1/shares', { token: student.sessionToken, body: { date, category: 'meal' } })
    for (let i = 0; i < 2; i++) {
      response = await ctx.request('POST', '/api/v1/feedback', { token: coach.sessionToken, body: payload(), headers: { 'Idempotency-Key': 'meal-review' } })
      assert.equal(response.status, 200)
    }
    const own = await ctx.request('GET', '/api/v1/feedback?target_id=u_stu_001|' + date, { token: student.sessionToken })
    assert.equal(own.body.data.length, 1)
    assert.equal(own.body.data[0].targetType, 'meal')
    assert.equal(own.body.data[0].text, payload().text)
    assert.equal(own.body.data[0].authorId, 'u_coach_001')
  })

  it('prevents unrelated account reads, anonymous-wide queries, and student-authored coach reviews', async () => {
    const foreignRead = await ctx.request('GET', '/api/v1/feedback?student_id=u_stu_001', { token: foreign.sessionToken })
    assert.equal(foreignRead.status, 403)
    const defaults = await ctx.request('GET', '/api/v1/feedback', { token: foreign.sessionToken })
    assert.equal(defaults.body.data.length, 0)
    const spoof = await ctx.request('POST', '/api/v1/feedback', { token: student.sessionToken, body: payload() })
    assert.equal(spoof.status, 403)
  })

  it('revocation blocks further meal reviews and coach access while preserving the student history', async () => {
    await ctx.request('DELETE', '/api/v1/shares?date=' + date + '&category=meal', { token: student.sessionToken })
    const write = await ctx.request('POST', '/api/v1/feedback', { token: coach.sessionToken, body: payload() })
    assert.equal(write.status, 403)
    const coachRead = await ctx.request('GET', '/api/v1/feedback?student_id=u_stu_001', { token: coach.sessionToken })
    assert.equal(coachRead.body.data.length, 0)
    const studentRead = await ctx.request('GET', '/api/v1/feedback', { token: student.sessionToken })
    assert.equal(studentRead.body.data.length, 1)
  })

  it('session lists omit coach private notes while retaining synchronized public advice and actual sets', async () => {
    const draft = await ctx.request('POST', '/api/v1/sessions', { token: coach.sessionToken, body: { coachDraft: true, student_id: 'u_stu_001', title: '卧推课' } })
    const id = draft.body.data.session_id
    await ctx.request('PATCH', '/api/v1/sessions/' + id, { token: coach.sessionToken, body: { privateNote: '仅教练私用', publicNote: '注意肩胛稳定' } })
    const hidden = await ctx.request('GET', '/api/v1/sessions', { token: student.sessionToken })
    assert.ok(!hidden.body.data.some(row => row.session_id === id))
    const exercise = await ctx.request('POST', '/api/v1/sessions/' + id + '/exercises', { token: coach.sessionToken, body: { name: '卧推', sets: 1, reps: 5, weight: 50 } })
    const set = exercise.body.data.exercises[0].sets[0]
    await ctx.request('PATCH', '/api/v1/sessions/' + id + '/sets/' + set.id, { token: coach.sessionToken, body: { actualWeight: 50, actualReps: 5, state: 'done' } })
    const done = await ctx.request('POST', '/api/v1/sessions/' + id + '/finalize', { token: coach.sessionToken, body: { share: true, completion_key: 'coach-space-training' } })
    assert.equal(done.status, 200)
    const visible = await ctx.request('GET', '/api/v1/sessions?status=completed', { token: student.sessionToken })
    const row = visible.body.data.find(item => item.session_id === id)
    assert.ok(row.shared_at)
    assert.equal(row.private_note, undefined)
    assert.equal(row.public_note, '注意肩胛稳定')
    assert.equal(row.exercises[0].sets[0].actualWeight, 50)
  })

  it('a new binding cannot reuse shares addressed to the previous coach', async () => {
    await ctx.request('POST', '/api/v1/shares', { token: student.sessionToken, body: { date, category: 'meal' } })
    await ctx.store.tx(state => {
      const binding = state.bindings.find(row => row.studentId === 'u_stu_001' && row.status === 'active')
      binding.coachUserId = 'u_coach_002'
      binding.coachId = 'coach_002'
    })
    const own = await ctx.request('GET', '/api/v1/daily-logs?date=' + date, { token: student.sessionToken })
    assert.equal(own.body.data.shares.meal, false)
    const { asApp } = require('../src/lib/asApp')
    const diary = require('../src/services/diaryService')
    const newCoach = await diary.getSharedDailyForCoach(asApp(ctx.store), 'u_coach_002', 'u_stu_001', date)
    assert.equal(newCoach.data.visible.meals, undefined)
  })
})
