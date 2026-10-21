const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const growthApi = require('../../services/growthApi')
const diaryApi = require('../../services/diaryApi')
const trainingApi = require('../../services/trainingApi')
const time = require('../../utils/time')
const bodyApi = require('../../services/bodyMeasurementApi')

Page({
  data: {
    role: 'student',
    monthLabel: '',
    calendarCells: [],
    selectedDate: '',
    dayDetail: null,
    summary: null,
    records: [],
    bodyMetrics: bodyApi.METRICS,
    bodyKey: 'weight',
    bodyRange: '90',
    bodyTrend: bodyApi.trend([], 'weight'),
    bodyTiles: [],
    bodyHistory: [],
    bodyLoading: false,
    bodyError: '',
    bodyEditor: false,
    bodySaving: false,
    bodyDate: '',
    bodyToday: '',
    bodyFields: [],
    bodyRevision: 0,
    bodyConflict: false,
    legend: [
      { key: 'workout', label: '训练', cls: 'dot-workout' },
      { key: 'rest', label: '休息', cls: 'dot-rest' },
      { key: 'meal', label: '饮食', cls: 'dot-meal' },
      { key: 'body', label: '状态', cls: 'dot-body' },
      { key: 'incomplete', label: '未完成', cls: 'dot-incomplete' }
    ]
  },

  onShow() {
    if (!requireLogin(this)) return
    syncRoleBar(this)
    const today = time.todayKey()
    this.setData({ selectedDate: this.data.selectedDate || today })
    this.reload()
    this.loadMeasurements()
  },

  loadMeasurements() {
    const owner = getApp().globalData.session.user.userId
    if (this.measurementOwner !== owner) {
      this.measurementOwner = owner
      this.measurements = []
      this.setData({ bodyEditor: false, bodyFields: [], bodyConflict: false })
      this.renderMeasurements()
    }
    this.setData({ bodyLoading: true, bodyError: '' })
    return bodyApi.list().then(res => {
      const session = getApp().globalData.session
      if (!session || session.user.userId !== owner) return
      this.measurements = res.data || []
      this.renderMeasurements()
    }).catch(err => this.setData({ bodyError: err.message || '身体数据读取失败，请重试' }))
      .then(() => this.setData({ bodyLoading: false }))
  },

  renderMeasurements() {
    const rows = this.measurements || []
    const from = this.data.bodyRange === 'all' ? '' : time.addDays(time.todayKey(), 1 - Number(this.data.bodyRange))
    const tiles = bodyApi.METRICS.map(metric => {
      const latest = rows.slice().reverse().find(row => row.values[metric.key] != null)
      return Object.assign({}, metric, { value: latest ? latest.values[metric.key] : '—', date: latest ? latest.date : '未记录' })
    })
    this.setData({
      bodyTrend: bodyApi.trend(rows, this.data.bodyKey, from), bodyTiles: tiles,
      bodyHistory: rows.slice(-5).reverse().map(row => ({ date: row.date, text: bodyApi.METRICS.filter(metric => row.values[metric.key] != null).map(metric => metric.label + ' ' + row.values[metric.key] + metric.unit).join(' · ') }))
    })
  },

  onBodyMetric(e) { this.setData({ bodyKey: e.currentTarget.dataset.key }); this.renderMeasurements() },
  onBodyRange(e) { this.setData({ bodyRange: e.currentTarget.dataset.range }); this.renderMeasurements() },
  onBodyOpen(e) {
    this.openBodyDate(e.currentTarget.dataset.date || time.todayKey())
  },
  openBodyDate(date) {
    const row = (this.measurements || []).find(item => item.date === date)
    this.setData({ bodyEditor: true, bodyDate: date, bodyToday: time.todayKey(), bodyRevision: row ? row.revision : 0, bodyConflict: false,
      bodyFields: bodyApi.METRICS.map(metric => Object.assign({}, metric, { value: row && row.values[metric.key] != null ? String(row.values[metric.key]) : '' })) })
  },
  onBodyDate(e) { this.openBodyDate(e.detail.value) },
  onBodyInput(e) {
    const fields = this.data.bodyFields.map(field => Object.assign({}, field))
    fields[Number(e.currentTarget.dataset.index)].value = e.detail.value
    this.setData({ bodyFields: fields })
  },
  onBodyClose() { if (!this.data.bodySaving) this.setData({ bodyEditor: false }) },
  onBodyReload() {
    wx.showModal({ title: '载入最新记录？', content: '当前表单尚未保存的修改将被替换。', success: result => {
      if (result.confirm) bodyApi.list().then(res => { this.measurements = res.data || []; this.renderMeasurements(); this.openBodyDate(this.data.bodyDate) }).catch(err => getApp().toast(err.message || '读取失败'))
    } })
  },
  onBodySave() {
    if (this.data.bodySaving || this.data.bodyConflict) return
    const values = {}
    for (const field of this.data.bodyFields) {
      const raw = String(field.value).trim()
      if (raw && !Number.isFinite(Number(raw))) return getApp().toast('请填写有效数字')
      values[field.key] = raw ? Number(raw) : null
    }
    if (!Object.values(values).some(value => value != null)) return getApp().toast('请至少填写一项身体数据')
    this.setData({ bodySaving: true })
    return bodyApi.save(this.data.bodyDate, values, this.data.bodyRevision).then(res => {
      this.measurements = (this.measurements || []).filter(row => row.date !== res.data.date).concat(res.data).sort((a, b) => a.date.localeCompare(b.date))
      this.renderMeasurements(); this.setData({ bodyEditor: false }); getApp().toast('身体数据已保存')
    }).catch(err => { if (err.code === 'REVISION_CONFLICT') this.setData({ bodyConflict: true }); getApp().toast(err.message || '保存失败，填写内容仍保留') })
      .then(() => this.setData({ bodySaving: false }))
  },

  studentId() {
    return getApp().globalData.session.user.userId
  },

  reload() {
    const app = getApp()
    const studentId = this.studentId()
    const today = time.todayKey()
    const range = growthApi.monthRange(today)

    Promise.all([
      growthApi.getSummary(app, studentId),
      diaryApi.getCalendarMarkers(app, studentId, range.from, range.to),
      trainingApi.listSessions(app, { studentId, status: ['completed'] })
    ]).then(([sumRes, markRes, sessRes]) => {
      const markerMap = {}
      ;(markRes.data || []).forEach((m) => {
        markerMap[m.date] = m
      })
      const cells = this.buildCalendar(range.from, range.to, markerMap, today)
      const p = time.parseDateKey(today)
      this.setData({
        summary: sumRes.data,
        monthLabel: p.y + '年' + p.m + '月',
        calendarCells: cells,
        records: (sessRes.data || []).slice(0, 5).map((s) => ({
          id: s.session_id || s.id,
          text:
            s.business_date +
            ' · ' +
            s.title +
            ' · ' +
            s.done_sets +
            '/' +
            s.total_sets +
            ' 组'
        }))
      })
      this.loadDayDetail(this.data.selectedDate)
    })
  },

  buildCalendar(from, to, markerMap, today) {
    const firstMs = time.shanghaiLocalToMs(from, '12:00')
    const startWd = time.toShanghaiParts(firstMs).weekday // 0 Sun
    // 日历从周一开始
    const pad = startWd === 0 ? 6 : startWd - 1
    const cells = []
    for (let i = 0; i < pad; i++) {
      cells.push({ empty: true, key: 'pad_' + i })
    }
    let cursor = from
    while (cursor <= to) {
      const m = markerMap[cursor] || {}
      const dots = []
      if (m.hasWorkout) dots.push('workout')
      if (m.restDay) dots.push('rest')
      if (m.hasMeal) dots.push('meal')
      if (m.hasBodyState) dots.push('body')
      if (m.planIncomplete) dots.push('incomplete')
      const d = time.parseDateKey(cursor)
      cells.push({
        empty: false,
        key: cursor,
        date: cursor,
        day: d.day,
        isToday: cursor === today,
        isSelected: cursor === this.data.selectedDate,
        dots,
        hasAny: dots.length > 0
      })
      cursor = time.addDays(cursor, 1)
    }
    return cells
  },

  onPickDay(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    const cells = this.data.calendarCells.map((c) =>
      Object.assign({}, c, { isSelected: !c.empty && c.date === date })
    )
    this.setData({ selectedDate: date, calendarCells: cells })
    this.loadDayDetail(date)
  },

  loadDayDetail(date) {
    const app = getApp()
    const studentId = this.studentId()
    diaryApi.getDailyView(app, studentId, date).then((res) => {
      const v = res.data
      const markers = []
      if (v.sessions && v.sessions.length) markers.push('有训练 ' + v.sessions.length + ' 次')
      if (v.restDay) markers.push('休息日')
      if (v.meals && v.meals.length) markers.push('饮食 ' + v.meals.length + ' 条')
      if (v.waterTotalMl) markers.push('饮水 ' + v.waterTotalMl + 'ml')
      if (v.bodyState) markers.push('已记身体状态')
      this.setData({
        dayDetail: {
          date,
          markers,
          sessions: v.sessions || [],
          empty: !markers.length
        }
      })
    })
  },

  goDiary() {
    wx.navigateTo({
      url: '/pages/diary/index'
    })
  },

  goExercises() {
    wx.navigateTo({ url: '/pages/exercises/index' })
  },

  goWorkout() {
    wx.redirectTo({ url: '/pages/workout/index' })
  }
})
