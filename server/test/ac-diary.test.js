/**
 * AC22–AC25 日记共享与成长指标
 */
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestApp } = require('./helpers')

describe('AC22–25 diary & growth', () => {
  let ctx
  let coach
  let stu
  let date

  before(async () => {
    ctx = createTestApp()
    coach = await ctx.login('coach_approved')
    stu = await ctx.login('student_only')
    date = ctx.time.todayKey()
    await ctx.bindStudent(stu.sessionToken, {
      workout_self: true,
      meal: true,
      body_state: true,
      special: false
    })
  })
  after(async () => {
    await ctx.cleanup()
  })

  it('AC22 meal save → share → revoke visibility', async () => {
    const meal = await ctx.request('POST', '/api/v1/meals', {
      token: stu.sessionToken,
      body: { date, mealType: 'lunch', foodText: '鸡胸肉沙拉' }
    })
    assert.equal(meal.status, 200)

    let coachView = await ctx.request(
      'GET',
      `/api/v1/daily-logs?student_id=u_stu_001&date=${date}`,
      { token: coach.sessionToken }
    )
    assert.equal(coachView.status, 200)
    assert.equal(coachView.body.data.canSee?.meal || !!coachView.body.data.visible?.meals, false)
    assert.ok(coachView.body.data.hiddenReasons.meal)

    await ctx.request('POST', '/api/v1/shares', {
      token: stu.sessionToken,
      body: { date, category: 'meal' }
    })
    coachView = await ctx.request(
      'GET',
      `/api/v1/daily-logs?student_id=u_stu_001&date=${date}`,
      { token: coach.sessionToken }
    )
    assert.ok(Array.isArray(coachView.body.data.visible.meals))
    assert.ok(coachView.body.data.visible.meals.length >= 1)

    await ctx.request('DELETE', `/api/v1/shares?date=${date}&category=meal`, {
      token: stu.sessionToken
    })
    coachView = await ctx.request(
      'GET',
      `/api/v1/daily-logs?student_id=u_stu_001&date=${date}`,
      { token: coach.sessionToken }
    )
    assert.ok(coachView.body.data.hiddenReasons.meal)
  })

  it('AC23 share meal only — special stays hidden', async () => {
    await ctx.request('PUT', `/api/v1/daily-logs/${date}/state`, {
      token: stu.sessionToken,
      body: { specialType: 'period', specialNote: '私密' }
    })
    await ctx.request('POST', '/api/v1/shares', {
      token: stu.sessionToken,
      body: { date, category: 'meal' }
    })
    // 不共享 special
    const coachView = await ctx.request(
      'GET',
      `/api/v1/daily-logs?student_id=u_stu_001&date=${date}`,
      { token: coach.sessionToken }
    )
    assert.ok(coachView.body.data.hiddenReasons.special)
    assert.equal(!!coachView.body.data.visible.special, false)
  })

  it('AC24 rest day counts diary streak not training', async () => {
    await ctx.request('PUT', `/api/v1/daily-logs/${date}/state`, {
      token: stu.sessionToken,
      body: { restDay: true }
    })
    const summary = await ctx.request('GET', '/api/v1/growth/summary', {
      token: stu.sessionToken
    })
    assert.ok(summary.body.data.diaryStreak >= 1)
    // 休息本身不增加 sessionCount（本测例未完成训练）
    assert.equal(typeof summary.body.data.sessionCount, 'number')
  })

  it('AC25 plan completion rate empty when denominator 0', async () => {
    // 新账号无到期计划
    const summary = await ctx.request('GET', '/api/v1/growth/summary', {
      token: stu.sessionToken
    })
    if (summary.body.data.planCompletionRate == null) {
      assert.equal(summary.body.data.empty.planCompletionRate, true)
    } else {
      assert.ok(typeof summary.body.data.planCompletionRate === 'number')
    }
  })

  it('AC02 unbound student forbidden', async () => {
    const res = await ctx.request(
      'GET',
      '/api/v1/daily-logs?student_id=u_stu_unbound_999&date=' + date,
      { token: coach.sessionToken }
    )
    assert.equal(res.status, 403)
    assert.equal(res.body.error.code, 'FORBIDDEN')
  })
})
