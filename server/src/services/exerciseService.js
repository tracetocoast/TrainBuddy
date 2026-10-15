/**
 * 动作库（S06）：仅已审核内容进入学员教学列表
 */

const time = require('../lib/time')

const CATALOG = [
  {
    id: 'squat',
    name: '杠铃深蹲',
    aliases: ['深蹲', 'back squat'],
    muscleGroup: '下肢',
    equipment: '杠铃',
    difficulty: '中级',
    metricType: 'weight_reps',
    icon: '🏋️',
    reviewStatus: 'approved',
    instructions: ['站距约与肩同宽', '髋膝同步下蹲', '膝盖朝脚尖方向'],
    cues: ['胸腔保持打开', '脚跟压实地面'],
    commonErrors: ['膝盖内扣', '腰过度屈曲'],
    defaultSets: 4,
    defaultReps: 10,
    defaultWeight: 60,
    reviewer: '内容审核组',
    updatedAt: '2026-10-01'
  },
  {
    id: 'rdl',
    name: '罗马尼亚硬拉',
    aliases: ['RDL', '硬拉'],
    muscleGroup: '下肢',
    equipment: '杠铃',
    difficulty: '中级',
    metricType: 'weight_reps',
    icon: '🦵',
    reviewStatus: 'approved',
    instructions: ['微屈膝', '髋铰链向后推', '杠铃贴近腿前侧'],
    cues: ['感受腘绳肌拉伸', '背部中立'],
    commonErrors: ['圆背', '膝盖过度弯曲变成深蹲'],
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 40,
    reviewer: '内容审核组',
    updatedAt: '2026-10-01'
  },
  {
    id: 'hip_thrust',
    name: '臀推',
    aliases: ['hip thrust'],
    muscleGroup: '下肢',
    equipment: '杠铃',
    difficulty: '初级',
    metricType: 'weight_reps',
    icon: '🍑',
    reviewStatus: 'approved',
    instructions: ['上背靠凳', '下巴微收', '顶峰挤压臀肌'],
    cues: ['肋骨下压', '避免过度伸腰'],
    commonErrors: ['用腰代偿', '行程过短'],
    defaultSets: 3,
    defaultReps: 12,
    defaultWeight: 45,
    reviewer: '内容审核组',
    updatedAt: '2026-09-20'
  },
  {
    id: 'bench',
    name: '杠铃卧推',
    aliases: ['卧推', 'bench press'],
    muscleGroup: '上肢',
    equipment: '杠铃',
    difficulty: '中级',
    metricType: 'weight_reps',
    icon: '💪',
    reviewStatus: 'approved',
    instructions: ['肩胛骨后收下沉', '肘角约 45–70°', '稳定下放再推起'],
    cues: ['脚踩实', '手腕保持中立'],
    commonErrors: ['弹胸', '肩峰过度前伸'],
    defaultSets: 4,
    defaultReps: 8,
    defaultWeight: 50,
    reviewer: '内容审核组',
    updatedAt: '2026-09-18'
  },
  {
    id: 'core',
    name: '死虫',
    aliases: ['dead bug', '核心'],
    muscleGroup: '核心',
    equipment: '自重',
    difficulty: '初级',
    metricType: 'reps',
    icon: '🧘',
    reviewStatus: 'approved',
    instructions: ['仰卧膝盖 90°', '对侧手脚缓慢伸出', '腰贴地'],
    cues: ['呼气时发力', '骨盆保持中立'],
    commonErrors: ['腰离开地面', '动作过快'],
    defaultSets: 3,
    defaultReps: 12,
    defaultWeight: null,
    reviewer: '内容审核组',
    updatedAt: '2026-09-10'
  },
  {
    id: 'draft_unreviewed',
    name: '未审核实验动作',
    aliases: [],
    muscleGroup: '全身',
    equipment: '其他',
    difficulty: '高级',
    metricType: 'weight_reps',
    icon: '⚠️',
    reviewStatus: 'pending',
    instructions: ['不应出现在学员列表'],
    cues: [],
    commonErrors: [],
    defaultSets: 3,
    defaultReps: 8,
    defaultWeight: 20,
    reviewer: null,
    updatedAt: '2026-10-14'
  }
]

function ensureStore(app) {
  const gd = app.globalData
  if (!gd.exerciseMeta) {
    gd.exerciseMeta = { favorites: {} }
  }
  return gd.exerciseMeta
}

function listExercises(app, query) {
  ensureStore(app)
  const q = (query && query.q) || ''
  const muscle = (query && query.muscleGroup) || ''
  const equipment = (query && query.equipment) || ''
  const list = CATALOG.filter((e) => e.reviewStatus === 'approved')
    .filter((e) => {
      if (muscle && e.muscleGroup !== muscle) return false
      if (equipment && e.equipment !== equipment) return false
      if (!q) return true
      const blob = (e.name + e.aliases.join('') + e.muscleGroup + e.equipment).toLowerCase()
      return blob.indexOf(String(q).toLowerCase()) !== -1
    })
    .map((e) => ({
      id: e.id,
      name: e.name,
      icon: e.icon,
      muscleGroup: e.muscleGroup,
      equipment: e.equipment,
      difficulty: e.difficulty,
      metricType: e.metricType
    }))
  return Promise.resolve({ data: list, request_id: 'ex_' + time.nowMs() })
}

function getExercise(app, id) {
  ensureStore(app)
  const e = CATALOG.find((x) => x.id === id)
  if (!e || e.reviewStatus !== 'approved') {
    return Promise.reject({ code: 'NOT_FOUND', message: '动作不存在或未审核' })
  }
  const meta = ensureStore(app)
  const userId = app.globalData.session && app.globalData.session.user
    ? app.globalData.session.user.userId
    : ''
  const favs = meta.favorites[userId] || []
  return Promise.resolve({
    data: Object.assign({}, e, { favorited: favs.indexOf(id) !== -1 }),
    request_id: 'ex_' + time.nowMs()
  })
}

function toggleFavorite(app, exerciseId) {
  const meta = ensureStore(app)
  const userId = app.globalData.session.user.userId
  if (!meta.favorites[userId]) meta.favorites[userId] = []
  const arr = meta.favorites[userId]
  const i = arr.indexOf(exerciseId)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(exerciseId)
  app.persist()
  return Promise.resolve({ data: { favorited: i < 0 }, request_id: 'ex_' + time.nowMs() })
}

function filters() {
  return {
    muscleGroups: ['下肢', '上肢', '核心'],
    equipments: ['杠铃', '自重', '其他'],
    difficulties: ['初级', '中级', '高级']
  }
}

module.exports = {
  CATALOG,
  listExercises,
  getExercise,
  toggleFavorite,
  filters
}
