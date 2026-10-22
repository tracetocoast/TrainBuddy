const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { createTestApp } = require('./helpers')
const { MemoryStore } = require('../src/store/memoryStore')
const service = require('../src/services/friendService')

describe('Friends: mutual consent, recent training, comments and revocation', () => {
  let ctx, a, b, stranger
  beforeEach(async () => {
    ctx = createTestApp()
    a = await ctx.login('student_only')
    b = await ctx.login('student_claim_coach')
    stranger = await ctx.login('coach_approved')
  })
  afterEach(async () => ctx.cleanup())
  const request = (method, url, actor, body) => ctx.request(method, '/api/v1/friends' + url, { token: actor.sessionToken, body })
  async function bind() {
    const invite = await request('POST', '/invitations', a, {})
    const joined = await request('POST', '/accept', b, { code: invite.body.data.code, consent: true })
    assert.equal(joined.status, 200)
    return joined.body.data.id
  }
  async function addTraining() {
    const today = ctx.time.todayKey()
    await ctx.store.tx(state => {
      const row = (id, date, extra) => Object.assign({ id, studentId: 'u_stu_001', title: '我的训练', status: 'completed', sourceType: 'self', businessDate: date, publicNote: '教练建议不公开', privateNote: '私人备注', exercises: [{ name: '卧推', sets: [{ state: 'done', actualWeight: 50, actualReps: 5 }, { state: 'pending', actualWeight: 55, actualReps: 5 }] }] }, extra)
      state.training.sessions.push(row('today', today), row('boundary', ctx.time.addDays(today, -6)), row('old', ctx.time.addDays(today, -7)), row('future', ctx.time.addDays(today, 1)), row('draft', today, { status: 'draft' }), row('coach-hidden', today, { sourceType: 'coach_post_session', sharedAt: null }))
    })
  }

  it('requires explicit mutual sharing, rejects self-binding and invalidates replaced invites', async () => {
    const first = await request('POST', '/invitations', a, {})
    const latest = await request('POST', '/invitations', a, {})
    assert.equal((await request('POST', '/invitations/preview', b, { code: first.body.data.code })).status, 409)
    assert.equal((await request('POST', '/invitations/preview', a, { code: latest.body.data.code })).status, 422)
    const preview = await request('POST', '/invitations/preview', b, { code: latest.body.data.code })
    assert.equal(preview.body.data.name, '陈佳宁')
    const refused = await request('POST', '/accept', b, { code: latest.body.data.code })
    assert.equal(refused.status, 422)
    assert.equal(ctx.store.state.friends.relations.length, 0)
    assert.ok(!JSON.stringify(ctx.store.state.friends).includes(latest.body.data.code))
  })

  it('consumes an invitation only once under concurrent acceptance', async () => {
    const invite = await request('POST', '/invitations', a, {})
    const results = await Promise.all([b, stranger].map(actor => request('POST', '/accept', actor, { code: invite.body.data.code, consent: true })))
    assert.equal(results.filter(result => result.status === 200).length, 1)
    assert.equal(ctx.store.state.friends.relations.length, 1)
  })

  it('shows exactly seven Shanghai dates and only allowlisted completed training data', async () => {
    const id = await bind()
    await addTraining()
    const list = await request('GET', '/', b)
    assert.equal(list.body.data[0].sessionCount, 2)
    assert.equal(list.body.data[0].days.length, 7)
    assert.equal(list.body.data[0].days[0].date, ctx.time.addDays(ctx.time.todayKey(), -6))
    const response = await request('GET', '/' + id + '/training', b)
    assert.deepEqual(response.body.data.sessions.map(row => row.id).sort(), ['boundary', 'today'])
    assert.equal(response.body.data.sessions[0].exercises[0].sets.length, 1)
    assert.ok(!JSON.stringify(response.body.data).includes('私人备注'))
    assert.ok(!JSON.stringify(response.body.data).includes('教练建议不公开'))
    assert.equal(response.body.data.sessions[0].studentId, undefined)
    assert.equal((await request('GET', '/' + id + '/training', stranger)).status, 403)
  })

  it('persists per-workout comments, deduplicates retries and shows feedback to the workout owner', async () => {
    const id = await bind()
    await addTraining()
    const body = { sessionId: 'today', text: '练得很稳，继续加油！', key: 'same-intent' }
    const first = await request('POST', '/' + id + '/comments', b, body)
    const retry = await request('POST', '/' + id + '/comments', b, body)
    assert.equal(first.status, 200)
    assert.equal(first.body.data.id, retry.body.data.id)
    assert.equal((await request('POST', '/' + id + '/comments', b, Object.assign({}, body, { text: '不同内容' }))).status, 409)
    const own = await request('GET', '/' + id + '/training', a)
    assert.equal(own.body.data.received[0].comments[0].text, body.text)
    assert.equal((await request('POST', '/' + id + '/comments', stranger, body)).status, 403)
    assert.equal((await request('POST', '/' + id + '/comments', b, { sessionId: 'old', text: '太早了', key: 'old' })).status, 403)
    const restored = new MemoryStore(ctx.store.filePath)
    assert.equal(service.feed(restored.state, { userId: 'u_stu_001' }, id).received[0].comments.length, 1)
  })

  it('either member can revoke access immediately, including retries of earlier comments', async () => {
    const id = await bind()
    await addTraining()
    const body = { sessionId: 'today', text: '加油', key: 'before-revoke' }
    await request('POST', '/' + id + '/comments', b, body)
    assert.equal((await request('DELETE', '/' + id, stranger)).status, 403)
    assert.equal((await request('DELETE', '/' + id, a)).status, 200)
    assert.equal((await request('GET', '/', b)).body.data.length, 0)
    assert.equal((await request('GET', '/' + id + '/training', b)).status, 403)
    assert.equal((await request('POST', '/' + id + '/comments', b, body)).status, 403)
  })

  it('expired invitations cannot expose an identity or create a relationship', async () => {
    const invite = await request('POST', '/invitations', a, {})
    await ctx.store.tx(state => { state.friends.invitations[0].expiresAt = ctx.time.nowMs() - 1 })
    assert.equal((await request('POST', '/invitations/preview', b, { code: invite.body.data.code })).status, 409)
    assert.equal((await request('POST', '/accept', b, { code: invite.body.data.code, consent: true })).status, 409)
  })
})
