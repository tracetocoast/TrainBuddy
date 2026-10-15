/**
 * Mock 转写适配器：可重复、无外部依赖，便于 AC11–14
 * 输入 audioHint / demoPhrase 时返回固定文案；否则返回通用示例。
 */

async function transcribe({ audioBase64, demoPhrase, locale }) {
  // 模拟网络延迟
  await sleep(80)

  if (demoPhrase) {
    return {
      provider: 'mock',
      text: String(demoPhrase),
      confidence: 0.92,
      durationMs: 80,
      locale: locale || 'zh-CN'
    }
  }

  // 无真实音频时：根据 payload 长度伪随机选一条（稳定可测）
  const samples = [
    '深蹲 60公斤 10次 4组',
    '50公斤 5次',
    '哑铃卧推 16 10次 3组',
    '硬拉 40kg 8次 3组；臀推 45kg 12次 3组'
  ]
  const idx = audioBase64 ? audioBase64.length % samples.length : 0
  return {
    provider: 'mock',
    text: samples[idx],
    confidence: 0.88,
    durationMs: 80,
    locale: locale || 'zh-CN',
    note: 'mock：未接真实 ASR，可用 demo_phrase 指定文案'
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

module.exports = { name: 'mock', transcribe }
