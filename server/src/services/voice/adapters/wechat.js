/**
 * 微信同声传译 / 插件转写适配器占位
 * 配置 VOICE_ASR_PROVIDER=wechat 且提供 WECHAT_ASR_ENDPOINT 后启用。
 * 未配置时明确失败，不假装成功（AC14）。
 */

async function transcribe({ audioBase64, mediaUrl, locale }) {
  const endpoint = process.env.WECHAT_ASR_ENDPOINT
  if (!endpoint) {
    const err = new Error('微信转写未配置：请设置 WECHAT_ASR_ENDPOINT 或改用 mock')
    err.code = 'ASR_NOT_CONFIGURED'
    err.retryable = false
    throw err
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.WECHAT_ASR_TOKEN
        ? 'Bearer ' + process.env.WECHAT_ASR_TOKEN
        : undefined
    },
    body: JSON.stringify({
      audio_base64: audioBase64,
      media_url: mediaUrl,
      locale: locale || 'zh-CN'
    })
  })

  if (!res.ok) {
    const err = new Error('转写服务失败 HTTP ' + res.status)
    err.code = 'ASR_FAILED'
    err.retryable = res.status >= 500
    throw err
  }

  const body = await res.json()
  return {
    provider: 'wechat',
    text: body.text || body.result || '',
    confidence: body.confidence != null ? body.confidence : null,
    durationMs: body.duration_ms || null,
    locale: locale || 'zh-CN',
    raw: body
  }
}

module.exports = { name: 'wechat', transcribe }
