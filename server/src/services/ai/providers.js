/**
 * AI 适配器：演示 mock 与未接入 unavailable 隔离
 * 饮食／目标图规格／语音结构化可走统一 LLM 模块（见 services/llm）
 */

const config = require('../../config')
const { AppError } = require('../../lib/errors')
const llm = require('../llm')

const WATERMARK = () => config.media.watermarkText

function resolveProvider(mode) {
  if (mode === 'demo') return 'mock'
  const p = (process.env.AI_PROVIDER || config.aiProvider || 'unavailable').toLowerCase()
  if (p === 'mock' || p === 'demo') return 'mock'
  return 'unavailable'
}

function listProviders() {
  const llmStatus = llm.publicStatus()
  return {
    active: process.env.AI_PROVIDER || config.aiProvider || 'unavailable',
    modes: {
      demo: 'mock（仅演示，结果带 DEMO 标记）',
      real: '需配置 AI_PROVIDER=mock 或 LLM_API_KEY；默认 unavailable 不得伪造成功'
    },
    llm: llmStatus
  }
}

/**
 * 体态观察（无总分）
 */
async function runPostureScan({ mode, qualityGate, forcePelvicUnable }) {
  const provider = resolveProvider(mode)
  if (provider === 'unavailable') {
    throw new AppError('PROVIDER_NOT_CONFIGURED', '体态分析能力尚未接入，请稍后再试或使用演示模式', {
      retryable: false,
      status: 503
    })
  }

  if (qualityGate && qualityGate.need_retake) {
    return {
      provider,
      is_demo: mode === 'demo',
      status: 'need_retake',
      overall_score: null,
      quality: qualityGate,
      items: [],
      message: '请按提示补充或重拍，不返回默认正常报告'
    }
  }

  const pelvicConclusion = forcePelvicUnable
    ? 'unable_to_judge'
    : mode === 'demo'
      ? 'needs_attention'
      : 'unable_to_judge'

  return {
    provider,
    is_demo: mode === 'demo',
    status: 'draft',
    overall_score: null,
    model_version: mode === 'demo' ? 'demo-posture-v0' : 'mock-posture-v0',
    items: [
      {
        key: 'round_shoulders',
        label: '圆肩倾向',
        conclusion: mode === 'demo' ? 'needs_attention' : 'no_obvious',
        basis: { views: ['front'], notes: '肩峰相对可见位置' },
        reliability: mode === 'demo' ? 'demo_only' : 'unverified'
      },
      {
        key: 'lateral_trunk',
        label: '侧面躯干姿态',
        conclusion: 'no_obvious',
        basis: { views: ['side'], notes: '躯干相对垂直参考' },
        reliability: mode === 'demo' ? 'demo_only' : 'unverified'
      },
      {
        key: 'uneven_shoulders',
        label: '高低肩倾向',
        conclusion: 'no_obvious',
        basis: { views: ['front'], notes: '双侧肩峰高度差不明显' },
        reliability: mode === 'demo' ? 'demo_only' : 'unverified'
      },
      {
        key: 'pelvic_posture',
        label: '骨盆姿态',
        conclusion: pelvicConclusion,
        basis: {
          views: ['side'],
          notes:
            pelvicConclusion === 'unable_to_judge'
              ? '关键点遮挡或角度不足，无法判断'
              : '演示样本疑似前倾倾向'
        },
        reliability: pelvicConclusion === 'unable_to_judge' ? 'insufficient' : 'demo_only'
      }
    ],
    improvement_hints: [
      { title: '核心稳定', note: '候选方向，待教练复核后个性化' },
      { title: '髋踝活动度', note: '一般性说明，非已确认计划' }
    ]
  }
}

/**
 * 单节点目标图
 * real + LLM：先产出 JSON 规格，像素仍走本地 mock 资产（真生图后续另接）
 * @param {{ fail?: boolean, goalText?: string }} opts
 */
async function runGoalNode({ mode, nodeKey, months, fail, goalText }) {
  if (fail) {
    const err = new AppError('NODE_GENERATION_FAILED', '节点 ' + nodeKey + ' 生成失败', {
      retryable: true,
      status: 502
    })
    err.nodeKey = nodeKey
    throw err
  }

  let spec = null
  let provider = resolveProvider(mode)

  if (mode === 'demo') {
    spec = llm.REGISTRY.goal_image_spec.demoFixture({ nodeKey, months, goalText })
    provider = 'mock'
  } else if (llm.isTaskEnabled('goal_image_spec')) {
    const out = await llm.runTask(
      'goal_image_spec',
      {
        nodeKey,
        months,
        goalText: goalText || '',
        watermarkText: WATERMARK()
      },
      { mode: 'real' }
    )
    spec = out.data
    provider = out.provider || 'openai_compatible'
  } else if (provider === 'unavailable') {
    throw new AppError('PROVIDER_NOT_CONFIGURED', '目标图能力尚未接入', {
      retryable: false,
      status: 503
    })
  }

  const watermark =
    (spec && spec.watermark_text) || WATERMARK()

  return {
    provider,
    is_demo: mode === 'demo',
    node_key: nodeKey,
    months,
    watermark_text: watermark,
    watermark_baked: true,
    quality: 'acceptable',
    preview_label:
      mode === 'demo' ? '示例' : (spec && spec.preview_label) || null,
    result_payload: {
      description: months + ' 个月目标模拟',
      identity_consistent:
        !!(spec && spec.safety_flags && spec.safety_flags.identity_consistent !== false),
      goal_image_spec: spec
    }
  }
}

/**
 * 饮食营养识别（三大营养素单位：克）
 * real + LLM_API_KEY 时走统一视觉任务；否则 mock / unavailable
 */
async function runNutritionScan({ mode, qualityHints, imageUrl, imageBase64, mime }) {
  const hints = qualityHints || {}
  const reasons = []
  if (hints.no_food || hints.empty_plate) reasons.push('no_food')
  if (hints.blurry || hints.clarity === 'poor') reasons.push('blurry')
  if (hints.multiple_meals === 'ambiguous') reasons.push('ambiguous_meals')
  if (reasons.length) {
    return {
      provider: mode === 'demo' ? 'mock' : resolveProvider(mode),
      is_demo: mode === 'demo',
      status: 'need_retake',
      quality: { need_retake: true, reasons },
      items: [],
      total_macros_g: { carbs: null, protein: null, fat: null },
      message: '请重拍更清晰、完整的单餐照片，不返回默认营养数值'
    }
  }

  if (mode === 'demo') {
    const data = llm.REGISTRY.nutrition.demoFixture()
    return Object.assign({ provider: 'mock', is_demo: true }, data)
  }

  if (llm.isTaskEnabled('nutrition')) {
    const out = await llm.runTask(
      'nutrition',
      { qualityHints: hints, imageUrl, imageBase64, mime },
      { mode: 'real' }
    )
    const data = out.data || {}
    return {
      provider: out.provider || 'openai_compatible',
      is_demo: false,
      status: data.status || 'needs_confirmation',
      model_version: data.model_version || out.model || 'llm-nutrition',
      is_estimate: data.is_estimate !== false,
      items: data.items || [],
      total_macros_g: data.total_macros_g || { carbs: null, protein: null, fat: null },
      quality: data.quality || null,
      message: data.message || null
    }
  }

  const provider = resolveProvider(mode)
  if (provider === 'unavailable') {
    throw new AppError('PROVIDER_NOT_CONFIGURED', '饮食营养识别尚未接入，请稍后再试或使用演示模式', {
      retryable: false,
      status: 503
    })
  }

  return {
    provider,
    is_demo: false,
    status: 'needs_confirmation',
    model_version: 'mock-nutrition-v0',
    is_estimate: true,
    items: [
      {
        food_name: '待确认食物',
        portion: { amount: null, unit: 'g', is_estimated: true },
        macros_g: { carbs: null, protein: null, fat: null },
        basis: 'unverified',
        uncertainties: ['份量与营养素均需人工确认']
      }
    ],
    total_macros_g: { carbs: null, protein: null, fat: null }
  }
}

module.exports = {
  resolveProvider,
  listProviders,
  runPostureScan,
  runGoalNode,
  runNutritionScan,
  WATERMARK
}
