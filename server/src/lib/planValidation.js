const { AppError } = require('./errors')
const { makeId } = require('./ids')

function invalid(message) { throw new AppError('VALIDATION', message) }
function number(value, name, min, max, integer, required) {
  if (value === null || value === undefined || value === '') {
    if (required) invalid('请填写' + name)
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(name + '超出范围或格式不正确')
  return value
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('计划日期格式应为 YYYY-MM-DD')
  const d = new Date(value + 'T12:00:00Z')
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) invalid('计划日期不存在')
  return value
}
function exercises(value, publishing) {
  if (!Array.isArray(value) || value.length > 50 || (publishing && !value.length)) invalid('计划需包含 1–50 个动作，空草稿可暂存')
  const ids = new Set()
  const identify = (id, prefix) => {
    if (id != null && (typeof id !== 'string' || !id || id.length > 100)) invalid('动作或组 ID 不合法')
    const result = id || makeId(prefix)
    if (ids.has(result)) invalid('动作或组 ID 重复')
    ids.add(result); return result
  }
  return value.map((ex, i) => {
    if (!ex || typeof ex !== 'object' || typeof ex.name !== 'string' || !ex.name.trim() || ex.name.trim().length > 60) invalid('请填写不超过 60 字的动作名称')
    if (!['total', 'per_side', 'bodyweight', 'unknown'].includes(ex.loadBasis)) invalid('请选择重量口径')
    if (!Array.isArray(ex.sets) || !ex.sets.length || ex.sets.length > 30) invalid('每个动作需包含 1–30 组')
    const result = { id: identify(ex.id, 'pex'), exerciseId: typeof ex.exerciseId === 'string' ? ex.exerciseId : null, name: ex.name.trim(), icon: typeof ex.icon === 'string' ? ex.icon : '🏋️', order: i + 1, loadBasis: ex.loadBasis }
    result.sets = ex.sets.map((set, n) => {
      if (!set || typeof set !== 'object') invalid('训练组格式不正确')
      return {
        id: identify(set.id, 'pset'), setNo: n + 1,
        targetWeight: number(set.targetWeight, '重量（0–500 kg）', 0, 500, false, publishing && ex.loadBasis !== 'bodyweight'),
        targetReps: number(set.targetReps, '次数（1–200）', 1, 200, true, publishing),
        required: set.required !== false
      }
    })
    if (publishing && result.loadBasis === 'unknown') invalid(ex.name + '的重量口径尚未确认')
    return result
  })
}
module.exports = { exercises, date, invalid }
