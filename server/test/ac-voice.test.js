/**
 * AC11–14 语音结构化与合并（第 7.3 节）
 */
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert/strict')
const { createTestApp } = require('./helpers')
const { structureText } = require('../src/services/voice/structure')

describe('AC11–14 voice structure & merge', () => {
  let ctx
  let coach
  let stu
  let sessionId

  before(async () => {
    ctx = createTestApp()
    coach = await ctx.login('coach_approved')
    stu = await ctx.login('student_only')
    await ctx.bindStudent(stu.sessionToken, { workout_self: true })

    const draft = await ctx.request('POST', '/api/v1/sessions', {
      token: coach.sessionToken,
      body: { coachDraft: true, student_id: 'u_stu_001', title: '语音课' },
      headers: { 'Idempotency-Key': 'voice_draft' }
    })
    assert.equal(draft.status, 200)
    sessionId = draft.body.data.session_id
  })

  after(async () => {
    await ctx.cleanup()
  })

  it('AC11 「50公斤 5次」不补默认组数，标记缺失', () => {
    const parsed = structureText('50公斤 5次', { taskId: 't1' })
    assert.equal(parsed.segments.length, 1)
    const seg = parsed.segments[0]
    assert.equal(seg.set_count, null)
    assert.equal(seg.candidate_reps_per_set, 5)
    assert.equal(seg.weight_kg, 50)
    assert.ok(seg.missing_fields.indexOf('set_count') >= 0)
    assert.ok(seg.requires_confirmation)
  })

  it('AC11 哑铃无口径不擅自判单侧/总重', () => {
    const parsed = structureText('哑铃卧推 16 10次 3组', { taskId: 't2' })
    const seg = parsed.segments[0]
    assert.equal(seg.set_count, 3)
    assert.equal(seg.load_basis, 'unknown')
    assert.ok(seg.missing_fields.indexOf('load_basis') >= 0 || seg.load_basis === 'unknown')
  })

  it('AC12 识别等待中人工改重量 → 冲突保留人工', async () => {
    // 先加卧推 50kg
    const withEx = await ctx.request('POST', `/api/v1/sessions/${sessionId}/exercises`, {
      token: coach.sessionToken,
      body: { name: '杠铃卧推', sets: 1, reps: 5, weight: 50 }
    })
    assert.equal(withEx.status, 200)
    const setId = withEx.body.data.exercises[0].sets[0].id
    const baseRev = withEx.body.data.revision

    // 创建识别任务（候选也是 50）
    const taskRes = await ctx.request('POST', `/api/v1/sessions/${sessionId}/voice-tasks`, {
      token: coach.sessionToken,
      body: {
        source: 'text',
        text: '杠铃卧推 50kg 5次 1组',
        base_revision: baseRev
      },
      headers: { 'Idempotency-Key': 'ac12_task' }
    })
    assert.equal(taskRes.status, 200)
    const taskId = taskRes.body.data.task_id

    // 人工改成 45
    await ctx.request('PATCH', `/api/v1/sessions/${sessionId}/sets/${setId}`, {
      token: coach.sessionToken,
      body: { actualWeight: 45 }
    })

    const got = await ctx.request(
      'GET',
      `/api/v1/sessions/${sessionId}/voice-tasks/${taskId}`,
      { token: coach.sessionToken }
    )
    assert.equal(got.status, 200)
    const conflicts = got.body.data.conflicts || []
    assert.ok(
      conflicts.some((c) => c.type === 'field_conflict' || c.type === 'revision_drift')
    )

    // 合并同名 append 应跳过；用 keep_human 不覆盖
    const merge = await ctx.request(
      'POST',
      `/api/v1/sessions/${sessionId}/voice-tasks/${taskId}/merge`,
      {
        token: coach.sessionToken,
        body: {
          mode: 'append',
          segment_ids: [got.body.data.structured.segments[0].segment_id]
        },
        headers: { 'Idempotency-Key': 'ac12_merge' }
      }
    )
    assert.equal(merge.status, 200)
    // 同名 append → skipped
    assert.ok(
      (merge.body.data.skipped || []).some((s) => s.reason === 'same_name_exists')
    )

    const sess = await ctx.request('GET', `/api/v1/sessions/${sessionId}`, {
      token: coach.sessionToken
    })
    const w = sess.body.data.exercises[0].sets[0].actualWeight
    assert.equal(Number(w), 45)
  })

  it('AC13 同一 segment_id 重复合并不重复追加', async () => {
    let sess = await ctx.request('GET', `/api/v1/sessions/${sessionId}`, {
      token: coach.sessionToken
    })
    const taskRes = await ctx.request('POST', `/api/v1/sessions/${sessionId}/voice-tasks`, {
      token: coach.sessionToken,
      body: {
        source: 'text',
        text: '核心训练 12次 3组',
        base_revision: sess.body.data.revision
      },
      headers: { 'Idempotency-Key': 'ac13_task' }
    })
    assert.equal(taskRes.status, 200, JSON.stringify(taskRes.body))
    const taskId = taskRes.body.data.task_id
    const segId = taskRes.body.data.structured.segments[0].segment_id
    const before = sess.body.data.exercises.length

    sess = await ctx.request('GET', `/api/v1/sessions/${sessionId}`, {
      token: coach.sessionToken
    })
    const m1 = await ctx.request(
      'POST',
      `/api/v1/sessions/${sessionId}/voice-tasks/${taskId}/merge`,
      {
        token: coach.sessionToken,
        body: {
          mode: 'append',
          segment_ids: [segId],
          base_revision: sess.body.data.revision
        },
        headers: { 'Idempotency-Key': 'ac13_m_0' }
      }
    )
    assert.equal(m1.status, 200, JSON.stringify(m1.body))

    // 第二次：带上合并后的 revision；应跳过 already_merged
    const m2 = await ctx.request(
      'POST',
      `/api/v1/sessions/${sessionId}/voice-tasks/${taskId}/merge`,
      {
        token: coach.sessionToken,
        body: {
          mode: 'append',
          segment_ids: [segId],
          base_revision: m1.body.data.session.revision
        },
        headers: { 'Idempotency-Key': 'ac13_m_1' }
      }
    )
    assert.equal(m2.status, 200, JSON.stringify(m2.body))
    assert.ok(
      (m2.body.data.skipped || []).some((s) => s.reason === 'already_merged')
    )

    const after = (
      await ctx.request('GET', `/api/v1/sessions/${sessionId}`, {
        token: coach.sessionToken
      })
    ).body.data.exercises.length
    assert.equal(after, before + 1)
  })

  it('AC14 转写失败不丢草稿；文字路径仍可用', async () => {
    const before = await ctx.request('GET', `/api/v1/sessions/${sessionId}`, {
      token: coach.sessionToken
    })
    const exCount = before.body.data.exercises.length

    // 强制 wechat 适配器且未配置 → failed
    const fail = await ctx.request('POST', `/api/v1/sessions/${sessionId}/voice-tasks`, {
      token: coach.sessionToken,
      body: {
        source: 'voice',
        provider: 'wechat',
        audio_base64: 'xxx',
        base_revision: before.body.data.revision
      },
      headers: { 'Idempotency-Key': 'ac14_fail' }
    })
    assert.equal(fail.status, 200)
    assert.equal(fail.body.data.status, 'failed')

    const mid = await ctx.request('GET', `/api/v1/sessions/${sessionId}`, {
      token: coach.sessionToken
    })
    assert.equal(mid.body.data.exercises.length, exCount)

    // 文字仍可用
    const okTask = await ctx.request('POST', `/api/v1/sessions/${sessionId}/voice-tasks`, {
      token: coach.sessionToken,
      body: {
        source: 'text',
        text: '臀推 45kg 12次 3组',
        base_revision: mid.body.data.revision
      },
      headers: { 'Idempotency-Key': 'ac14_text' }
    })
    assert.equal(okTask.status, 200)
    assert.equal(okTask.body.data.status, 'ready')
  })

  it('缺字段合并被拒绝（不擅自写入）', async () => {
    const taskRes = await ctx.request('POST', `/api/v1/sessions/${sessionId}/voice-tasks`, {
      token: coach.sessionToken,
      body: {
        source: 'text',
        text: '50公斤 5次',
        base_revision: (
          await ctx.request('GET', `/api/v1/sessions/${sessionId}`, {
            token: coach.sessionToken
          })
        ).body.data.revision
      },
      headers: { 'Idempotency-Key': 'ac11_merge' }
    })
    const segId = taskRes.body.data.structured.segments[0].segment_id
    const merge = await ctx.request(
      'POST',
      `/api/v1/sessions/${sessionId}/voice-tasks/${taskRes.body.data.task_id}/merge`,
      {
        token: coach.sessionToken,
        body: { mode: 'append', segment_ids: [segId] },
        headers: { 'Idempotency-Key': 'ac11_m' }
      }
    )
    assert.equal(merge.status, 200)
    assert.ok(
      (merge.body.data.skipped || []).some(
        (s) => s.reason === 'missing_fields' || s.reason === 'missing_exercise'
      )
    )
  })
})
