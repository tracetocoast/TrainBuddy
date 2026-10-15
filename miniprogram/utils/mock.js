const weekDates = [
  ['周一', '13'],
  ['周二', '14'],
  ['周三', '15'],
  ['周四', '16'],
  ['周五', '17'],
  ['周六', '18'],
  ['周日', '19']
]

const slots = [
  { time: '09:00', name: '力量基础', desc: '45 分钟 · 入门友好', status: '已约', disabled: true },
  { time: '11:00', name: '体态与灵活性', desc: '50 分钟 · 体态改善', status: '可预约', disabled: false },
  { time: '14:30', name: '上肢力量', desc: '45 分钟 · 力量进阶', status: '可预约', disabled: false },
  { time: '18:30', name: '臀腿力量', desc: '60 分钟 · 热门时段', status: '可预约', disabled: false }
]

const exercises = [
  { icon: '🏋️', name: '杠铃深蹲', plan: '4 组 × 10 次', weight: '60 kg', sets: 4, reps: 10 },
  { icon: '🦵', name: '罗马尼亚硬拉', plan: '3 组 × 10 次', weight: '40 kg', sets: 3, reps: 10 },
  { icon: '🍑', name: '臀推', plan: '3 组 × 12 次', weight: '45 kg', sets: 3, reps: 12 }
]

const coachSessions = [
  { time: '09:00', student: '陈佳宁', desc: '上肢力量 · 第 8 次', status: '已完成' },
  { time: '11:30', student: '周子墨', desc: '体态改善 · 第 3 次', status: '待记录' },
  { time: '18:30', student: '许一诺', desc: '臀腿力量 · 第 12 次', status: '即将开始' }
]

const studentList = [
  { name: '陈佳宁', desc: '上肢力量 · 本周训练 3 次', progress: 84 },
  { name: '周子墨', desc: '体态改善 · 本周训练 1 次', progress: 42 },
  { name: '许一诺', desc: '臀腿力量 · 本周训练 4 次', progress: 91 }
]

const quickAdds = ['深蹲 4×10', '硬拉 3×10', '臀推 3×12', '核心训练 3 组']

const weekBars = [42, 72, 52, 88, 35, 8, 8]

module.exports = {
  weekDates,
  slots,
  exercises,
  coachSessions,
  studentList,
  quickAdds,
  weekBars
}
