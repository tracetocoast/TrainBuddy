/**
 * AC31 账本核销一次；AC34 订阅到期；AC35 通知 outbox；支付开关
 */
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestApp } = require('./helpers')

describe('AC31 / AC34 / AC35 entitlements · outbox · payment', () => {
  let ctx
  let coach
  let stu
  let ops
  const prevProvider = process.env.AI_PROVIDER
  const prevPay = process.env.PAYMENT_ENABLED

  before(async () => {
    process.env.AI_PROVIDER = 'mock'
    delete process.env.PAYMENT_ENABLED
    // 重新加载 config 困难；payment 读 process 时已在模块加载期求值
    // 测试默认关：直接断言 createCheckout 拒绝
    ctx = createTestApp()
    coach = await ctx.login('coach_approved')
    stu = await ctx.login('student_only')
    ops = await ctx.login('ops_admin')
    await ctx.bindStudent(stu.sessionToken, { workout_self: true, raw_photo: true })
  })

  after(async () => {
    if (prevProvider == null) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = prevProvider
    if (prevPay == null) delete process.env.PAYMENT_ENABLED
    else process.env.PAYMENT_ENABLED = prevPay
    await ctx.cleanup()
  })

  async function upload(token) {
    const intent = await ctx.request('POST', '/api/v1/media/upload-intents', {
      token,
      body: { purpose: 'goal_source', mime: 'image/jpeg', size: 100000 }
    })
    const mediaId = intent.body.data.media_id
    await ctx.request('POST', `/api/v1/media/${mediaId}/complete`, {
      token,
      body: { quality: { person_count: 1 } }
    })
    return mediaId
  }

  it('API30 可查权益与用量账本', async () => {
    const ent = await ctx.request('GET', '/api/v1/entitlements', { token: stu.sessionToken })
    assert.equal(ent.status, 200)
    assert.ok(ent.body.data.features.some((f) => f.feature === 'posture_scan' && f.available > 0))
    assert.equal(ent.body.data.payment_enabled, false)

    const led = await ctx.request('GET', '/api/v1/usage-ledger', { token: stu.sessionToken })
    assert.equal(led.status, 200)
    assert.ok(Array.isArray(led.body.data))
    assert.ok(led.body.data.some((e) => e.action === 'grant'))
  })

  it('AC31 重复回调同一 chargeKey 只核销一次', async () => {
    const src = await upload(stu.sessionToken)
    const before = await ctx.request('GET', '/api/v1/entitlements', { token: stu.sessionToken })
    const availBefore = before.body.data.features.find((f) => f.feature === 'goal_image').available

    const res = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'goal_image',
        mode: 'real',
        input: {
          source_media_id: src,
          nodes: [{ key: 'm2', months: 2 }]
        }
      },
      headers: { 'Idempotency-Key': 'ent_ac31_' + Date.now() }
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'succeeded')
    assert.ok(res.body.data.ledger)
    assert.ok(['charged', 'partial_charged'].indexOf(res.body.data.ledger.status) >= 0)

    const taskId = res.body.data.task_id
    const cb1 = await ctx.request('POST', `/api/v1/ai-tasks/${taskId}/callbacks`, {
      token: stu.sessionToken,
      body: { callback_id: 'ent_dup_cb' }
    })
    const cb2 = await ctx.request('POST', `/api/v1/ai-tasks/${taskId}/callbacks`, {
      token: stu.sessionToken,
      body: { callback_id: 'ent_dup_cb' }
    })
    assert.equal(cb2.body.data.applied, false)
    assert.equal(cb2.body.data.reason, 'duplicate_callback')

    const charges = ctx.store.state.entitlements.ledger.filter(
      (l) => l.taskId === taskId && l.action === 'charge'
    )
    assert.equal(charges.length, 1)

    const after = await ctx.request('GET', '/api/v1/entitlements', { token: stu.sessionToken })
    const availAfter = after.body.data.features.find((f) => f.feature === 'goal_image').available
    assert.equal(availAfter, availBefore - 1)
  })

  it('AC34 订阅到期：历史可读，新付费操作拒绝', async () => {
    const reportsBefore = await ctx.request('GET', '/api/v1/posture-reports', {
      token: stu.sessionToken
    })
    assert.equal(reportsBefore.status, 200)

    const exp = await ctx.request('POST', '/api/v1/admin/subscriptions/expire', {
      token: ops.sessionToken,
      body: {
        ticket_id: 'TKT-AC34',
        user_id: 'u_stu_001',
        reason: '验收到期'
      }
    })
    assert.equal(exp.status, 200)
    assert.equal(exp.body.data.status, 'expired')

    // 历史仍可读
    const reportsAfter = await ctx.request('GET', '/api/v1/posture-reports', {
      token: stu.sessionToken
    })
    assert.equal(reportsAfter.status, 200)
    const ent = await ctx.request('GET', '/api/v1/entitlements', { token: stu.sessionToken })
    assert.equal(ent.status, 200)
    assert.equal(ent.body.data.subscription.status, 'expired')

    // 新付费 AI 任务拒绝
    const src = await upload(stu.sessionToken)
    const blocked = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'goal_image',
        mode: 'real',
        input: { source_media_id: src, nodes: [{ key: 'm2', months: 2 }] }
      },
      headers: { 'Idempotency-Key': 'ac34_block_' + Date.now() }
    })
    assert.equal(blocked.status, 402)
    assert.equal(blocked.body.error.code, 'SUBSCRIPTION_EXPIRED')

    // 演示模式仍可用（不计费）
    const demo = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'goal_image',
        mode: 'demo',
        input: { source_media_id: src, nodes: [{ key: 'm2', months: 2 }] }
      },
      headers: { 'Idempotency-Key': 'ac34_demo_' + Date.now() }
    })
    assert.equal(demo.status, 200)
    assert.equal(demo.body.data.is_demo, true)

    // 恢复试用以便后续用例
    await ctx.request('POST', '/api/v1/admin/entitlements/trial', {
      token: ops.sessionToken,
      body: {
        ticket_id: 'TKT-AC34-RESTORE',
        user_id: 'u_stu_001',
        reason: '恢复试点'
      }
    })
  })

  it('AC35 预约成功且通知投递失败：预约仍在，站内可查，outbox 可重试', async () => {
    const slot = await ctx.findOpenSlot(stu.sessionToken, 'coach_001')
    const booking = await ctx.request('POST', '/api/v1/bookings', {
      token: stu.sessionToken,
      body: {
        coach_id: 'coach_001',
        start_at: slot.startAt,
        course_type_id: 'private_strength_60',
        accepted_rules_version: 3,
        fail_notify: true
      },
      headers: { 'Idempotency-Key': 'ac35_book_' + Date.now() }
    })
    assert.equal(booking.status, 200)
    const bookingId = booking.body.data.id || booking.body.data.booking_id
    assert.ok(bookingId)

    const coachNotes = await ctx.request('GET', '/api/v1/notifications', {
      token: coach.sessionToken
    })
    assert.equal(coachNotes.status, 200)
    assert.ok(
      coachNotes.body.data.some(
        (n) => n.meta && n.meta.related_id === bookingId
      ) || coachNotes.body.data.length >= 1
    )

    const failed = await ctx.request('GET', '/api/v1/admin/outbox?status=failed', {
      token: ops.sessionToken
    })
    assert.equal(failed.status, 200)
    const item = failed.body.data.find((x) => x.related_id === bookingId)
    assert.ok(item)
    assert.equal(item.status, 'failed')

    const retry = await ctx.request('POST', `/api/v1/admin/outbox/${item.outbox_id}/retry`, {
      token: ops.sessionToken,
      body: { ticket_id: 'TKT-AC35', reason: '重试投递' }
    })
    assert.equal(retry.status, 200)
    assert.equal(retry.body.data.status, 'sent')

    // 预约未被回滚
    const got = await ctx.request('GET', `/api/v1/bookings/${bookingId}`, {
      token: stu.sessionToken
    })
    assert.equal(got.status, 200)
    assert.ok(['pending', 'confirmed'].indexOf(got.body.data.status) >= 0)
  })

  it('支付未开放时 checkout 拒绝，不产生订单／权益', async () => {
    const status = await ctx.request('GET', '/api/v1/payments/status', {
      token: stu.sessionToken
    })
    assert.equal(status.body.data.payment_enabled, false)

    const checkout = await ctx.request('POST', '/api/v1/payments/checkout', {
      token: stu.sessionToken,
      body: { sku: 'goal_pack' },
      headers: { 'Idempotency-Key': 'pay_' + Date.now() }
    })
    assert.equal(checkout.status, 403)
    assert.equal(checkout.body.error.code, 'FEATURE_DISABLED')
  })

  it('运营额度补偿写入审计', async () => {
    const grant = await ctx.request('POST', '/api/v1/admin/entitlements/grant', {
      token: ops.sessionToken,
      body: {
        ticket_id: 'TKT-COMP-1',
        user_id: 'u_stu_001',
        feature: 'posture_scan',
        amount: 2,
        reason: '补偿测试'
      }
    })
    assert.equal(grant.status, 200)
    const audits = await ctx.request('GET', '/api/v1/admin/audits?ticket_id=TKT-COMP-1', {
      token: ops.sessionToken
    })
    assert.equal(audits.status, 200)
    assert.ok(audits.body.data.some((a) => a.action === 'entitlement_compensate'))
  })

  it('部分成功目标图只核销成功节点额度', async () => {
    // 确保订阅有效
    await ctx.request('POST', '/api/v1/admin/entitlements/trial', {
      token: ops.sessionToken,
      body: { ticket_id: 'TKT-PARTIAL', user_id: 'u_stu_001', reason: '补额度' }
    })
    const before = await ctx.request('GET', '/api/v1/entitlements', { token: stu.sessionToken })
    const availBefore = before.body.data.features.find((f) => f.feature === 'goal_image').available

    const src = await upload(stu.sessionToken)
    const res = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'goal_image',
        mode: 'real',
        input: {
          source_media_id: src,
          nodes: [
            { key: 'm2', months: 2 },
            { key: 'm3', months: 3 },
            { key: 'm6', months: 6 }
          ],
          fail_nodes: ['m6']
        }
      },
      headers: { 'Idempotency-Key': 'partial_quota_' + Date.now() }
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'partial')

    const charges = ctx.store.state.entitlements.ledger.filter(
      (l) => l.taskId === res.body.data.task_id && l.action === 'charge'
    )
    assert.equal(charges.length, 2)

    const after = await ctx.request('GET', '/api/v1/entitlements', { token: stu.sessionToken })
    const availAfter = after.body.data.features.find((f) => f.feature === 'goal_image').available
    assert.equal(availAfter, availBefore - 2)
  })
})
