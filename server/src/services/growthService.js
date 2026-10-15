/**
 * 成长指标口径（设计文档 8.4）
 */

const time = require('../lib/time')
const diaryApi = require('./diaryService')
const trainingApi = require('./trainingService')

function startOfWeek(dateKey) {
  const ms = time.shanghaiLocalToMs(dateKey, '12:00')
  const wd = time.toShanghaiParts(ms).weekday // 0 Sun
  // 周一为一周起始
  const offset = wd === 0 ? -6 : 1 - wd
  return time.addDays(dateKey, offset)
}

function monthRange(dateKey) {
  const p = time.parseDateKey(dateKey)
  const from = p.y + '-' + (p.m < 10 ? '0' : '') + p.m + '-01'
  const nextM = p.m === 12 ? 1 : p.m + 1
  const nextY = p.m === 12 ? p.y + 1 : p.y
  const nextFirst =
    nextY + '-' + (nextM < 10 ? '0' : '') + nextM + '-01'
  const to = time.addDays(nextFirst, -1)
  return { from, to }
}

function getSummary(app, studentId, range) {
  const today = time.todayKey()
  let from = range && range.from
  let to = range && range.to
  if (!from || !to) {
    const w = startOfWeek(today)
    from = w
    to = time.addDays(w, 6)
  }

  const store = trainingApi.ensureStore(app)
  const sessions = (store.sessions || []).filter((s) => {
    if (s.studentId !== studentId || s.status !== 'completed') return false
    if (trainingApi.countDoneSets(s) <= 0) return false
    return s.businessDate >= from && s.businessDate <= to
  })

  const sessionCount = sessions.length
  const daySet = {}
  sessions.forEach((s) => {
    daySet[s.businessDate] = true
  })
  const trainingDays = Object.keys(daySet).length

  // 日记连续天数（含休息打卡）
  const diary = diaryApi.ensureStore(app)
  let streak = 0
  let cursor = today
  for (let i = 0; i < 60; i++) {
    const hasLog = diary.dailyLogs.some(
      (d) => d.studentId === studentId && d.localDate === cursor
    )
    const hasMeal = diary.meals.some(
      (m) =>
        m.studentId === studentId && m.localDate === cursor && !m.deletedAt
    )
    const hasBody = diary.bodyStates.some(
      (b) => b.studentId === studentId && b.localDate === cursor
    )
    const hasWorkout = (store.sessions || []).some(
      (s) =>
        s.studentId === studentId &&
        s.businessDate === cursor &&
        s.status === 'completed' &&
        trainingApi.countDoneSets(s) > 0
    )
    if (hasLog || hasMeal || hasBody || hasWorkout) {
      streak += 1
      cursor = time.addDays(cursor, -1)
    } else {
      break
    }
  }

  // 计划完成率：分母为 0 显示暂无
  let planCompletionRate = null
  const plans = (store.plans || []).filter((p) => p.studentId === studentId)
  let due = 0
  let donePlan = 0
  plans.forEach((p) => {
    if (!p.currentPublishedRevision) return
    const rev = store.planRevisions.find(
      (r) => r.planId === p.id && r.version === p.currentPublishedRevision
    )
    if (!rev || !rev.plannedDate) return
    if (rev.plannedDate < from || rev.plannedDate > to) return
    if (rev.plannedDate > today) return
    due += 1
    const finished = sessions.some(
      (s) => s.planId === p.id && s.businessDate === rev.plannedDate
    )
    // 简化：该计划日有任意完成会话且必做组全完成
    const daySessions = sessions.filter(
      (s) => s.planId === p.id && s.businessDate === rev.plannedDate
    )
    const allRequiredDone = daySessions.some((s) => {
      let req = 0
      let ok = 0
      ;(s.exercises || []).forEach((ex) => {
        ;(ex.sets || []).forEach((set) => {
          if (set.required === false) return
          req += 1
          if (set.state === 'done') ok += 1
        })
      })
      return req > 0 && ok === req
    })
    if (finished && allRequiredDone) donePlan += 1
  })
  if (due > 0) planCompletionRate = Math.round((donePlan / due) * 100)

  // 训练量：仅重量动作 Σ weight×reps
  let volume = 0
  sessions.forEach((s) => {
    ;(s.exercises || []).forEach((ex) => {
      ;(ex.sets || []).forEach((set) => {
        if (set.state !== 'done') return
        if (set.actualWeight == null || set.actualReps == null) return
        volume += Number(set.actualWeight) * Number(set.actualReps)
      })
    })
  })

  // 周柱状：按训练天数内每次 session 的 done_sets
  const weekStart = startOfWeek(today)
  const bars = []
  for (let i = 0; i < 7; i++) {
    const d = time.addDays(weekStart, i)
    const daySessions = (store.sessions || []).filter(
      (s) =>
        s.studentId === studentId &&
        s.businessDate === d &&
        s.status === 'completed'
    )
    let sets = 0
    daySessions.forEach((s) => {
      sets += trainingApi.countDoneSets(s)
    })
    bars.push({
      date: d,
      label: '日一二三四五六'[time.toShanghaiParts(time.shanghaiLocalToMs(d, '12:00')).weekday],
      sets,
      height: Math.min(160, sets * 16)
    })
  }

  return Promise.resolve({
    data: {
      from,
      to,
      sessionCount,
      trainingDays,
      diaryStreak: streak,
      planCompletionRate,
      volumeKg: volume,
      bars,
      empty: {
        sessionCount: sessionCount === 0,
        planCompletionRate: planCompletionRate == null,
        volume: volume === 0
      }
    },
    request_id: 'growth_' + time.nowMs()
  })
}

module.exports = {
  getSummary,
  startOfWeek,
  monthRange
}
