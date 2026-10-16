/**
 * AI 适配器：演示 mock 与未接入 unavailable 隔离
 * 未接入能力不得返回成功结果。
 */

const config = require('../../config')
const { AppError } = require('../../lib/errors')

const WATERMARK = () => config.media.watermarkText

function resolveProvider(mode) {
  if (mode === 'demo') return 'mock'
  const p = (process.env.AI_PROVIDER || config.aiProvider || 'unavailable').toLowerCase()
  if (p === 'mock' || p === 'demo') return 'mock'
  return 'unavailable'
}

function listProviders() {
  return {
    active: process.env.AI_PROVIDER || config.aiProvider || 'unavailable',
    modes: {
      demo: 'mock（仅演示，结果带 DEMO 标记）',
      real: '需配置 AI_PROVIDER=mock 或真实供应商；默认 unavailable 不得伪造成功'
    }
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
 * @param {{ fail?: boolean }} opts
 */
async function runGoalNode({ mode, nodeKey, months, fail }) {
  const provider = resolveProvider(mode)
  if (provider === 'unavailable') {
    throw new AppError('PROVIDER_NOT_CONFIGURED', '目标图能力尚未接入', {
      retryable: false,
      status: 503
    })
  }
  if (fail) {
    const err = new AppError('NODE_GENERATION_FAILED', '节点 ' + nodeKey + ' 生成失败', {
      retryable: true,
      status: 502
    })
    err.nodeKey = nodeKey
    throw err
  }

  return {
    provider,
    is_demo: mode === 'demo',
    node_key: nodeKey,
    months,
    watermark_text: WATERMARK(),
    watermark_baked: true,
    quality: 'acceptable',
    preview_label: mode === 'demo' ? '示例' : null,
    // 伪媒体引用由上层写入 media 表
    result_payload: {
      description: months + ' 个月目标模拟',
      identity_consistent: true
    }
  }
}

module.exports = {
  resolveProvider,
  listProviders,
  runPostureScan,
  runGoalNode,
  WATERMARK
}
