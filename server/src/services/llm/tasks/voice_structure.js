/**
 * 课后语音／文字 → 训练草稿结构化 JSON（workout_draft.v1）
 * 规则：缺单位、组数、次数不擅自补全
 */

const SCHEMA = {
  type: 'object',
  required: ['schema_version', 'segments', 'unparsed_text'],
  properties: {
    schema_version: { type: 'string' },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'segment_id',
          'display_name',
          'missing_fields',
          'requires_confirmation',
          'evidence_text'
        ],
        properties: {
          segment_id: { type: 'string' },
          raw_name: { type: 'string' },
          exercise_candidate: { type: ['string', 'null'], nullable: true },
          display_name: { type: 'string' },
          icon: { type: 'string' },
          weight_kg: { type: ['number', 'null'], nullable: true },
          candidate_reps_per_set: { type: ['number', 'null'], nullable: true },
          set_count: { type: ['number', 'null'], nullable: true },
          load_basis: { type: 'string' },
          missing_fields: { type: 'array', items: { type: 'string' } },
          requires_confirmation: { type: 'boolean' },
          evidence_text: { type: 'string' },
          merge_hint: { type: 'string' }
        }
      }
    },
    unparsed_text: { type: 'array', items: { type: 'string' } }
  }
}

const SYSTEM_PROMPT = `你是健身教练课后记录助理。把教练口述或文字拆成训练动作候选段落。

硬性规则（AC11）：
1. 缺失的动作名、组数、次数、重量单位 → 记入 missing_fields，对应字段用 null，禁止擅自补默认值（例如不要把「50×5」补成 3 组）。
2. 「哑铃 16」无 kg／单侧／总重说明时，load_basis=unknown，并把 load_basis 放入 missing_fields。
3. schema_version 固定为 "workout_draft.v1"。
4. segment_id 使用传入的 task 前缀加序号，如 taskId_1。
5. 无法解析的句子放入 unparsed_text，不要丢弃也不要瞎编动作。
6. requires_confirmation = missing_fields 非空。
7. 只输出一个 JSON 对象。`

function buildMessages(input) {
  const taskId = input.taskId || 'seg'
  const text = String(input.text || '')
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        'taskId前缀=' +
        taskId +
        '\n请结构化以下课后口述／文字：\n---\n' +
        text +
        '\n---\n输出 JSON：schema_version, segments[], unparsed_text[]。'
    }
  ]
}

function demoFixture(input) {
  // demo 不走外网；由调用方应优先用规则引擎。此处仅作占位。
  return {
    schema_version: 'workout_draft.v1',
    segments: [],
    unparsed_text: [String((input && input.text) || '')].filter(Boolean)
  }
}

module.exports = {
  key: 'voice_structure',
  schema: SCHEMA,
  systemPrompt: SYSTEM_PROMPT,
  buildMessages,
  demoFixture,
  useVision: false
}
