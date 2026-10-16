/**
 * AC26–32 媒体／体态／目标图；AC40 咨询幂等
 */
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestApp } = require('./helpers')

describe('AC26–32 / AC40 media · AI · posture · goal · consult', () => {
  let ctx
  let coach
  let stu
  const prevProvider = process.env.AI_PROVIDER

  before(async () => {
    process.env.AI_PROVIDER = 'mock'
    ctx = createTestApp()
    coach = await ctx.login('coach_approved')
    stu = await ctx.login('student_only')
    await ctx.bindStudent(stu.sessionToken, {
      workout_self: true,
      raw_photo: true,
      posture_report: true
    })
  })

  after(async () => {
    if (prevProvider == null) delete process.env.AI_PROVIDER
    else process.env.AI_PROVIDER = prevProvider
    await ctx.cleanup()
  })

  async function upload(token, purpose, quality) {
    const intent = await ctx.request('POST', '/api/v1/media/upload-intents', {
      token,
      body: { purpose, mime: 'image/jpeg', size: 100000 }
    })
    assert.equal(intent.status, 200)
    const mediaId = intent.body.data.media_id
    const done = await ctx.request('POST', `/api/v1/media/${mediaId}/complete`, {
      token,
      body: { quality: quality || { person_count: 1 } }
    })
    assert.equal(done.status, 200)
    return mediaId
  }

  it('AC26 缺侧面／多人 → need_retake，无默认正常报告', async () => {
    const front = await upload(stu.sessionToken, 'posture_input', {
      person_count: 1,
      has_front: true
    })
    const res = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'posture_scan',
        mode: 'demo',
        input: {
          front_media_id: front,
          quality_hints: { has_front: true, has_side: false, person_count: 2 }
        }
      },
      headers: { 'Idempotency-Key': 'ac26_' + Date.now() }
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'need_retake')
    assert.ok(!res.body.data.result || !res.body.data.result.report_id)
    const reasons = res.body.data.result.quality.reasons
    assert.ok(reasons.indexOf('missing_side') >= 0 || reasons.indexOf('multiple_persons') >= 0)
  })

  it('AC27 骨盆无法判断 → unable_to_judge，无总分', async () => {
    const front = await upload(stu.sessionToken, 'posture_input')
    const side = await upload(stu.sessionToken, 'posture_input', { view: 'side' })
    const res = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'posture_scan',
        mode: 'demo',
        input: {
          front_media_id: front,
          side_media_id: side,
          force_pelvic_unable: true,
          quality_hints: { has_front: true, has_side: true, person_count: 1 }
        }
      },
      headers: { 'Idempotency-Key': 'ac27_' + Date.now() }
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'succeeded')
    assert.equal(res.body.data.result.overall_score, null)
    const reportId = res.body.data.result.report_id
    const report = await ctx.request('GET', `/api/v1/posture-reports/${reportId}`, {
      token: stu.sessionToken
    })
    assert.equal(report.status, 200)
    assert.equal(report.body.data.overall_score, null)
    const pelvic = report.body.data.items.find((i) => i.key === 'pelvic_posture')
    assert.equal(pelvic.conclusion, 'unable_to_judge')
  })

  it('教练复核不覆盖 AI 原文', async () => {
    const front = await upload(stu.sessionToken, 'posture_input')
    const side = await upload(stu.sessionToken, 'posture_input')
    const task = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'posture_scan',
        mode: 'demo',
        input: {
          front_media_id: front,
          side_media_id: side,
          quality_hints: { has_front: true, has_side: true, person_count: 1 }
        }
      },
      headers: { 'Idempotency-Key': 'review_' + Date.now() }
    })
    const reportId = task.body.data.result.report_id
    const before = await ctx.request('GET', `/api/v1/posture-reports/${reportId}`, {
      token: stu.sessionToken
    })
    const aiItems = JSON.stringify(before.body.data.items)

    const rev = await ctx.request('POST', `/api/v1/posture-reports/${reportId}/review`, {
      token: coach.sessionToken,
      body: {
        decision: 'reviewed',
        note: '同意方向',
        base_revision: before.body.data.revision
      },
      headers: { 'Idempotency-Key': 'rev_' + reportId }
    })
    assert.equal(rev.status, 200)
    assert.equal(rev.body.data.status, 'reviewed')
    assert.equal(rev.body.data.ai_snapshot_preserved, true)
    assert.equal(JSON.stringify(rev.body.data.items), aiItems)
  })

  it('AC28 三节点仅一失败 → partial，可单节点重试', async () => {
    const src = await upload(stu.sessionToken, 'goal_source')
    const res = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'goal_image',
        mode: 'demo',
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
      headers: { 'Idempotency-Key': 'ac28_' + Date.now() }
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'partial')
    const nodes = res.body.data.nodes
    assert.equal(nodes.filter((n) => n.status === 'succeeded').length, 2)
    assert.equal(nodes.find((n) => n.key === 'm6').status, 'failed')

    const retry = await ctx.request('POST', `/api/v1/ai-tasks/${res.body.data.task_id}/retry`, {
      token: stu.sessionToken,
      body: { node_key: 'm6', base_revision: res.body.data.revision },
      headers: { 'Idempotency-Key': 'retry_m6_' + Date.now() }
    })
    assert.equal(retry.status, 200)
    assert.equal(retry.body.data.status, 'succeeded')
    assert.equal(retry.body.data.nodes.find((n) => n.key === 'm6').status, 'succeeded')
  })

  it('AC29 导出保留水印并提示分享范围', async () => {
    const src = await upload(stu.sessionToken, 'goal_source')
    const res = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'goal_image',
        mode: 'demo',
        input: {
          source_media_id: src,
          nodes: [{ key: 'm2', months: 2 }]
        }
      },
      headers: { 'Idempotency-Key': 'ac29_' + Date.now() }
    })
    const mediaId = res.body.data.nodes[0].result_media_id
    assert.ok(mediaId)
    assert.equal(res.body.data.nodes[0].watermarked, true)

    const exp = await ctx.request('POST', `/api/v1/media/${mediaId}/export-watermark`, {
      token: stu.sessionToken,
      body: {}
    })
    assert.equal(exp.status, 200)
    assert.equal(exp.body.data.watermarked, true)
    assert.ok(String(exp.body.data.watermark_text).indexOf('模拟') >= 0)
    assert.ok(exp.body.data.share_scope_reminder)
  })

  it('AC30 撤权后迟到回调不发布', async () => {
    process.env.AI_PROVIDER = 'mock'
    // 创建真实模式任务后立即撤权，再打回调
    const src = await upload(stu.sessionToken, 'goal_source')
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
      headers: { 'Idempotency-Key': 'ac30_create_' + Date.now() }
    })
    assert.equal(res.status, 200)
    const taskId = res.body.data.task_id

    const rev = await ctx.request('POST', `/api/v1/ai-tasks/${taskId}/revoke-consent`, {
      token: stu.sessionToken,
      body: {}
    })
    assert.equal(rev.status, 200)
    assert.equal(rev.body.data.consent_revoked, true)

    const cb = await ctx.request('POST', `/api/v1/ai-tasks/${taskId}/callbacks`, {
      token: stu.sessionToken,
      body: { callback_id: 'late_cb_1', publish: true }
    })
    assert.equal(cb.status, 200)
    assert.equal(cb.body.data.applied, false)
    assert.equal(cb.body.data.reason, 'consent_revoked')

    const got = await ctx.request('GET', `/api/v1/ai-tasks/${taskId}`, {
      token: stu.sessionToken
    })
    // 若已发布则保持；本用例在成功后撤权——结果不重新开放新资产读取策略由删除测例覆盖
    assert.equal(got.body.data.consent_revoked, true)
  })

  it('AC31 重复回调账本只核销一次', async () => {
    const src = await upload(stu.sessionToken, 'goal_source')
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
      headers: { 'Idempotency-Key': 'ac31_' + Date.now() }
    })
    assert.equal(res.status, 200)
    const taskId = res.body.data.task_id
    assert.ok(res.body.data.ledger)
    assert.ok(['charged', 'partial_charged'].indexOf(res.body.data.ledger.status) >= 0)

    const cb2 = await ctx.request('POST', `/api/v1/ai-tasks/${taskId}/callbacks`, {
      token: stu.sessionToken,
      body: { callback_id: 'dup_cb_same' }
    })
    await ctx.request('POST', `/api/v1/ai-tasks/${taskId}/callbacks`, {
      token: stu.sessionToken,
      body: { callback_id: 'dup_cb_same' }
    })
    const cb3 = await ctx.request('POST', `/api/v1/ai-tasks/${taskId}/callbacks`, {
      token: stu.sessionToken,
      body: { callback_id: 'dup_cb_same' }
    })
    assert.equal(cb3.body.data.applied, false)
    assert.equal(cb3.body.data.reason, 'duplicate_callback')

    const charged = ctx.store.state.entitlements.ledger.filter(
      (l) => l.taskId === taskId && l.action === 'charge'
    )
    assert.equal(charged.length, 1)
    void cb2
  })

  it('AC32 删除后禁止读取，清理任务可查', async () => {
    const mediaId = await upload(stu.sessionToken, 'posture_input')
    const del = await ctx.request('DELETE', `/api/v1/media/${mediaId}`, {
      token: stu.sessionToken
    })
    assert.equal(del.status, 200)
    assert.equal(del.body.data.deleted, true)
    const cleanupId = del.body.data.cleanup_task.cleanup_task_id
    assert.ok(cleanupId)

    const access = await ctx.request('GET', `/api/v1/media/${mediaId}/access`, {
      token: stu.sessionToken
    })
    assert.equal(access.status, 410)
    assert.equal(access.body.error.code, 'MEDIA_DELETED')

    const cleanup = await ctx.request('GET', `/api/v1/media/cleanup-tasks/${cleanupId}`, {
      token: stu.sessionToken
    })
    assert.equal(cleanup.status, 200)
    assert.equal(cleanup.body.data.status, 'completed')
  })

  it('未接入能力真实任务不得成功', async () => {
    const prev = process.env.AI_PROVIDER
    process.env.AI_PROVIDER = 'unavailable'
    try {
      const front = await upload(stu.sessionToken, 'posture_input')
      const side = await upload(stu.sessionToken, 'posture_input')
      const res = await ctx.request('POST', '/api/v1/ai-tasks', {
        token: stu.sessionToken,
        body: {
          type: 'posture_scan',
          mode: 'real',
          input: {
            front_media_id: front,
            side_media_id: side,
            quality_hints: { has_front: true, has_side: true, person_count: 1 }
          }
        },
        headers: { 'Idempotency-Key': 'unavail_' + Date.now() }
      })
      assert.equal(res.status, 200)
      assert.equal(res.body.data.status, 'failed')
      assert.equal(res.body.data.error.code, 'PROVIDER_NOT_CONFIGURED')
    } finally {
      process.env.AI_PROVIDER = prev || 'mock'
    }
  })

  it('演示与真实任务隔离标记', async () => {
    const front = await upload(stu.sessionToken, 'posture_input')
    const side = await upload(stu.sessionToken, 'posture_input')
    const demo = await ctx.request('POST', '/api/v1/ai-tasks', {
      token: stu.sessionToken,
      body: {
        type: 'posture_scan',
        mode: 'demo',
        input: {
          front_media_id: front,
          side_media_id: side,
          quality_hints: { has_front: true, has_side: true, person_count: 1 }
        }
      },
      headers: { 'Idempotency-Key': 'iso_demo_' + Date.now() }
    })
    assert.equal(demo.body.data.is_demo, true)
    assert.equal(demo.body.data.mode, 'demo')
  })

  it('AC40 咨询重复提交同幂等键返回原单且无订单', async () => {
    const key = 'consult_ac40_' + Date.now()
    const body = { note: '想咨询目标可达性' }
    const a = await ctx.request('POST', '/api/v1/consultations', {
      token: stu.sessionToken,
      body,
      headers: { 'Idempotency-Key': key }
    })
    assert.equal(a.status, 200)
    const b = await ctx.request('POST', '/api/v1/consultations', {
      token: stu.sessionToken,
      body,
      headers: { 'Idempotency-Key': key }
    })
    assert.equal(b.status, 200)
    assert.equal(a.body.data.consultation_id, b.body.data.consultation_id)
    assert.equal(a.body.data.order_id, null)
    assert.equal(b.body.data.order_id, null)

    const list = await ctx.request('GET', '/api/v1/consultations', {
      token: stu.sessionToken
    })
    const same = list.body.data.filter((c) => c.consultation_id === a.body.data.consultation_id)
    assert.equal(same.length, 1)
  })
})
