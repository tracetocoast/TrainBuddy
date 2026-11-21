const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const growthApi = require('../../services/growthApi')
const diaryApi = require('../../services/diaryApi')
const trainingApi = require('../../services/trainingApi')
const bodyApi = require('../../services/bodyMeasurementApi')
const insights = require('../../utils/bodyInsights')
const time = require('../../utils/time')
const { visible, trainingAreas, displayTrainingTitle } = require('../../utils/trainingReport')

Page({
  onToggleStatistics() { this.setData({ showStatistics: !this.data.showStatistics }) },
  data: {
    role: 'student',
    monthLabel: '',
    calendarMonth: '',
    calendarCells: [],
    selectedDate: '',
    dayDetail: null,
    historyTab: 'training',
    dayLoading: false,
    dayError: '',
    bodyError: '',
    summary: null,
    weekBars: [],
    fourWeekSummary: null,
    weekGoal: {
      rate: null,
      sessions: 0,
      days: 0,
      streak: 0,
      ringDeg: 0,
      hasRate: false,
      empty: true
    },
    highlights: [],
    records: [],
    loading: false,
    error: '',
    chartReady: false,
    legend: [
      { key: 'workout', label: '训练', cls: 'dot-workout' },
      { key: 'rest', label: '休息（主动标记）', cls: 'dot-rest' },
      { key: 'meal', label: '饮食', cls: 'dot-meal' },
      { key: 'body', label: '日记状态', cls: 'dot-body' },
      { key: 'measure', label: '身体测量', cls: 'dot-measure' },
      { key: 'incomplete', label: '未完成', cls: 'dot-incomplete' }
    ]
  },

  onShow() {
    if (!requireLogin(this)) return
    syncRoleBar(this)
    const today = time.todayKey()
    this.setData({
      calendarMonth: this.data.calendarMonth || today.slice(0, 7),
      selectedDate: this.data.selectedDate || today,
      chartReady: false
    })
    this.reload()
  },

  calendarRange() {
    const month = this.data.calendarMonth || time.todayKey().slice(0, 7)
    return growthApi.monthRange(month + '-01')
  },

  clampSelected(range, today) {
    const selected = this.data.selectedDate
    if (selected && selected >= range.from && selected <= range.to) return selected
    if (today >= range.from && today <= range.to) return today
    return range.from
  },

  onMoveMonth(e) {
    const current = this.data.calendarMonth || time.todayKey().slice(0, 7)
    const month = insights.moveMonth(current, Number(e.currentTarget.dataset.step))
    this.setData({ calendarMonth: month })
    this.reload()
  },

  goBodyData() {
    wx.navigateTo({ url: '/pages/body-data/index' })
  },

  goTool(e) {
    const tool = e.currentTarget.dataset.tool
    if (!['food', 'posture', 'goal'].includes(tool)) return
    wx.navigateTo({ url: '/pages/ai/index?tool=' + tool })
  },

  goRecord() {
    wx.navigateTo({ url: '/pages/record/index' })
  },

  studentId() {
    return getApp().globalData.session?.user?.userId || ''
  },

  reload() {
    this.setData({ loading: true, error: '', dayDetail: null, dayError: '' })
    this._dayGeneration = (this._dayGeneration || 0) + 1
    const app = getApp()
    const studentId = this.studentId()
    const today = time.todayKey()
    const calendarMonth = this.data.calendarMonth || today.slice(0, 7)
    const range = this.calendarRange()
    const generation = this._monthGeneration = (this._monthGeneration || 0) + 1
    const isCurrent = () => this.studentId() === studentId && this.data.calendarMonth === calendarMonth && this._monthGeneration === generation

    return Promise.all([
      growthApi.getSummary(app, studentId),
      diaryApi.getCalendarMarkers(app, studentId, range.from, range.to),
      trainingApi.listSessions(app, {
        studentId,
        status: ['completed']
      }),
      bodyApi.list().catch(() => ({ data: [], failed: true }))
    ])
      .then(([sumRes, markRes, sessRes, bodyRes]) => {
        if (!isCurrent()) return
        const markerMap = {}
        ;(markRes.data || []).forEach((m) => {
          markerMap[m.date] = { ...m, hasWorkout: false }
        })
        const measureDates = {}
        ;(bodyRes.data || []).forEach((row) => {
          if (row.date && row.values && Object.keys(row.values).length) measureDates[row.date] = true
        })
        const seen = new Set()
        const sessions = (sessRes.data || []).filter(row => {
          if (!visible(row, studentId) || !row.session_id || seen.has(row.session_id)) return false
          seen.add(row.session_id)
          return true
        }).sort((a, b) => String(b.business_date).localeCompare(String(a.business_date)) || (b.ended_at || 0) - (a.ended_at || 0))
        const byDate = Object.create(null)
        const recent = sessions.filter(row => row.business_date >= time.addDays(today, -27) && row.business_date <= today)
        const uniqueExercises = new Set()
        const fourWeekBars = [0, 0, 0, 0]
        for (const row of recent) {
          for (const exercise of row.exercises || []) {
            if (exercise.exerciseId && (exercise.sets || []).some(set => set.state === 'done')) uniqueExercises.add(exercise.exerciseId)
          }
          for (let week = 0; week < 4; week++) {
            if (row.business_date <= time.addDays(today, -21 + 7 * week)) {
              fourWeekBars[week]++
              break
            }
          }
        }
        const peak = Math.max(1, ...fourWeekBars)
        for (const row of sessions) {
          const areas = trainingAreas(row)
          const doneSets = (row.exercises || []).reduce((sum, ex) => sum + (ex.sets || []).filter(set => set.state === 'done').length, 0)
          const dateRows = byDate[row.business_date] ||= []
          dateRows.push({ id: row.session_id, title: displayTrainingTitle(row, areas), areas: areas.join(' · '),
            exerciseCount: (row.exercises || []).length, doneSets })
        }
        for (const [date, rows] of Object.entries(byDate)) {
          markerMap[date] = { ...markerMap[date], hasWorkout: true,
            trainingLabel: rows.length > 1 ? rows.length + '次' : rows[0].areas.split(' · ')[0] || '训练' }
        }
        this._history = { studentId, byDate, measures: bodyRes.data || [] }
        const summary = sumRes.data
        const weekBars = insights.presentWeekBars(summary && summary.bars)
        const rate = summary && summary.planCompletionRate != null ? summary.planCompletionRate : null
        const weekGoal = {
          rate,
          sessions: summary ? summary.sessionCount || 0 : 0,
          days: summary ? summary.trainingDays || 0 : 0,
          streak: summary ? summary.diaryStreak || 0 : 0,
          hasRate: rate != null,
          ringDeg: rate != null ? Math.min(100, Math.max(0, rate)) * 3.6 : 0,
          empty: !summary || (!!summary.empty && summary.empty.sessionCount && summary.empty.planCompletionRate)
        }
        const selectedDate = this.clampSelected(range, today)
        const cells = this.buildCalendar(range.from, range.to, markerMap, measureDates, today, selectedDate)
        const p = time.parseDateKey(calendarMonth + '-01')
        this.setData({
          summary,
          bodyError: bodyRes.failed ? '身体数据读取失败' : '',
          weekBars,
          fourWeekSummary: {
            sessions: recent.length, days: new Set(recent.map(row => row.business_date)).size,
            exercises: uniqueExercises.size,
            bars: fourWeekBars.map((count, index) => ({ index, count, height: Math.round(count / peak * 120) }))
          },
          weekGoal,
          calendarMonth,
          selectedDate,
          monthLabel: p.y + '年' + p.m + '月',
          calendarCells: cells,
          highlights: insights.recentLoadHighlights(sessions),
          records: sessions.slice(0, 5).map((s) => ({
            id: s.session_id || s.id,
            text:
              s.business_date +
              ' · ' +
              displayTrainingTitle(s) +
              ' · ' +
              s.done_sets +
              '/' +
              s.total_sets +
              ' 组'
          })),
          chartReady: true
        })
        return this.loadDayDetail(selectedDate)
      })
      .catch((err) => { if (isCurrent()) this.setData({ error: err.message || '训练统计加载失败，请重试' }) })
      .then(() => { if (isCurrent()) this.setData({ loading: false }) })
  },

  buildCalendar(from, to, markerMap, measureDates, today, selectedDate) {
    const firstMs = time.shanghaiLocalToMs(from, '12:00')
    const startWd = time.toShanghaiParts(firstMs).weekday
    const pad = startWd === 0 ? 6 : startWd - 1
    const cells = []
    for (let i = 0; i < pad; i++) {
      cells.push({ empty: true, key: 'pad_' + i })
    }
    let cursor = from
    while (cursor <= to) {
      const m = markerMap[cursor] || {}
      const dots = []
      // 仅展示服务端真实标记；无记录日期不加休息点
      if (m.hasWorkout) dots.push('workout')
      if (m.restDay) dots.push('rest')
      if (m.hasMeal) dots.push('meal')
      if (m.hasBodyState) dots.push('body')
      if (measureDates[cursor]) dots.push('measure')
      if (m.planIncomplete) dots.push('incomplete')
      const d = time.parseDateKey(cursor)
      cells.push({
        empty: false,
        key: cursor,
        date: cursor,
        day: d.day,
        trainingLabel: m.trainingLabel || '',
        isToday: cursor === today,
        isSelected: cursor === selectedDate,
        dots,
        hasAny: dots.length > 0
      })
      cursor = time.addDays(cursor, 1)
    }
    return cells
  },

  onPickDay(e) {
    const date = e.currentTarget.dataset.date
    if (!date || date.slice(0, 7) !== this.data.calendarMonth || this.data.loading) return
    const cells = this.data.calendarCells.map((c) =>
      Object.assign({}, c, { isSelected: !c.empty && c.date === date })
    )
    this.setData({ selectedDate: date, calendarCells: cells })
    this.loadDayDetail(date)
  },

  onHistoryTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!['training', 'body', 'meal'].includes(tab) || tab === this.data.historyTab) return
    this.setData({ historyTab: tab })
    if (this.data.selectedDate && !this.data.loading) this.loadDayDetail(this.data.selectedDate)
  },

  loadDayDetail(date) {
    const app = getApp()
    const studentId = this.studentId()
    const generation = this._dayGeneration = (this._dayGeneration || 0) + 1
    const current = () => this._dayGeneration === generation && this.studentId() === studentId &&
      this.data.selectedDate === date && this.data.historyTab === 'meal'
    const history = this._history?.studentId === studentId ? this._history : null
    const measures = (history?.measures || []).filter(row => row.date === date).map(row => ({
      id: row.id || row.date + '_' + (row.time || ''),
      time: row.time || row.timeLabel || '时间未记录',
      text: bodyApi.METRICS.filter(metric => ['weight', 'bodyFat'].includes(metric.key) || row.values?.[metric.key] != null)
        .map(metric => metric.label + ' ' + (row.values?.[metric.key] == null ? '未记录' : row.values[metric.key] + metric.unit)).join(' · ')
    }))
    this.setData({ dayError: '', dayLoading: this.data.historyTab === 'meal',
      dayDetail: { date, sessions: history?.byDate[date] || [], measures, meals: [] } })
    if (this.data.historyTab !== 'meal') return Promise.resolve()
    return diaryApi.getDailyView(app, studentId, date).then(({ data }) => {
      if (!current()) return
      const labels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
      const rawMeals = data.meals || []
      const meals = rawMeals.map(meal => {
        const macros = meal.macrosG || meal.macros_g || {}
        const nutrition = [['carbs', '碳水'], ['protein', '蛋白质'], ['fat', '脂肪']]
          .filter(([key]) => Number.isFinite(macros[key]))
          .map(([key, label]) => label + ' ' + macros[key] + 'g').join(' · ')
        return { id: meal.id, title: labels[meal.mealType] || '饮食', food: meal.foodText || '食物未记录', portion: meal.portionText || '', nutrition }
      })
      for (const type of ['breakfast', 'lunch', 'dinner']) {
        if (!rawMeals.some(meal => meal.mealType === type)) meals.push({ id: 'missing-' + type, title: labels[type], food: '未记录' })
      }
      const order = Object.values(labels)
      const rank = title => order.includes(title) ? order.indexOf(title) : order.length
      meals.sort((a, b) => rank(a.title) - rank(b.title))
      this.setData({ 'dayDetail.meals': meals, dayLoading: false })
    }).catch(err => {
      if (current()) this.setData({ dayError: err.message || '饮食读取失败', dayLoading: false })
    })
  },

  onRetryDay() { return this.loadDayDetail(this.data.selectedDate) },
  goHistoryReport(e) { wx.navigateTo({ url: '/pages/training-report/index?id=' + encodeURIComponent(e.currentTarget.dataset.id) }) },
  goDiary() {
    const date = this.data.selectedDate || time.todayKey()
    wx.navigateTo({ url: '/pages/diary/index?date=' + encodeURIComponent(date) })
  },

  goPoints() {
    wx.navigateTo({ url: '/pages/points/index' })
  },

  goExercises() {
    wx.navigateTo({ url: '/pages/exercises/index' })
  },

  goWorkout() {
    wx.redirectTo({ url: '/pages/workout/index' })
  }
})
