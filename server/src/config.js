const path = require('path')

module.exports = {
  port: Number(process.env.PORT || 8787),
  timezone: 'Asia/Shanghai',
  dataDir: path.join(__dirname, '..', 'data'),
  storeFile: path.join(__dirname, '..', 'data', 'store.json'),
  /** mock 会话 token 前缀；正式环境换微信 code 换 session */
  sessionTtlMs: 7 * 24 * 3600 * 1000,
  idempotencyTtlMs: 24 * 3600 * 1000,
  schedule: {
    timezone: 'Asia/Shanghai',
    defaultDurationMin: 60,
    defaultBufferMin: 0,
    openDaysAhead: 14,
    minBookAheadMin: 120,
    cancelOrChangeAheadMin: 12 * 60,
    pendingExpireMin: 120,
    pendingExpireBeforeStartMin: 30,
    rulesVersion: 3,
    courseTypes: [
      {
        id: 'private_strength_60',
        name: '私教力量',
        durationMin: 60,
        location: '私教工作室'
      },
      {
        id: 'private_mobility_50',
        name: '体态与灵活性',
        durationMin: 50,
        location: '私教工作室'
      }
    ]
  }
}
