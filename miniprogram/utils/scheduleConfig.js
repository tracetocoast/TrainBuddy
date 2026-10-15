/**
 * 排班预约可配置参数（设计约定起点，待决策 D04/D05）
 * 前后端应读取同一配置，不硬编码在业务判断里。
 */
const SCHEDULE_CONFIG = {
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

module.exports = { SCHEDULE_CONFIG }
