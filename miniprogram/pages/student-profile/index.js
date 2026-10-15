const { requireCoachRole } = require('../../utils/guard')
const { canCoachReadStudent } = require('../../utils/permission')
const diaryApi = require('../../services/diaryApi')
const bindingApi = require('../../services/bindingApi')
const time = require('../../utils/time')

const MEAL_LABEL = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐'
}

const SPECIAL_LABEL = {
  travel: '出差',
  overtime: '加班',
  period: '生理期',
  injury: '受伤/不适',
  other: '其他'
}

Page({
  data: {
    studentId: '',
    studentName: '',
    dateList: [],
    localDate: '',
    shared: {
      visible: {},
      hiddenReasons: {},
      canSee: {}
    },
    feedbackText: '',
    feedbacks: []
  },

  onLoad(query) {
    const app = getApp()
    const studentId =
      (query && query.studentId) || app.globalData.activeSubjectId || ''
    const studentName =
      (query && query.name) || app.globalData.student || '学员'
    this.setData({ studentId, studentName })
  },

  onShow() {
    if (!requireCoachRole(this)) return
    const app = getApp()
    const studentId = this.data.studentId || app.globalData.activeSubjectId
    if (!studentId) {
      app.toast('请先选择学员')
      wx.redirectTo({ url: '/pages/students/index' })
      return
    }
    const check = canCoachReadStudent(
      app,
      app.globalData.session.user.userId,
      studentId
    )
    if (!check.ok) {
      app.toast(check.message || '无权访问')
      wx.redirectTo({ url: '/pages/students/index' })
      return
    }

    const today = time.todayKey()
    const keys = []
    for (let i = -6; i <= 0; i++) keys.push(time.addDays(today, i))
    bindingApi.listBoundStudentsForCoachAsync(app).then((bound) => {
      const row = (bound || []).find((b) => b.studentId === studentId)
      this.setData({
        studentId,
        studentName: (row && row.name) || this.data.studentName,
        dateList: keys.map((k) => time.formatDateLabel(k)),
        localDate: this.data.localDate || today
      })
      this.reload()
    })
  },

  reload() {
    const app = getApp()
    const coachId = app.globalData.session.user.userId
    const { studentId, localDate } = this.data
    diaryApi
      .getSharedDailyForCoach(app, coachId, studentId, localDate)
      .then((res) => {
        const shared = res.data
        const vis = shared.visible || {}
        if (vis.meals) {
          vis.meals = vis.meals.map((m) =>
            Object.assign({}, m, {
              mealType: MEAL_LABEL[m.mealType] || m.mealType
            })
          )
        }
        if (vis.special && vis.special.specialType) {
          vis.special = Object.assign({}, vis.special, {
            specialType:
              SPECIAL_LABEL[vis.special.specialType] || vis.special.specialType
          })
        }
        shared.visible = vis
        shared.canSee = {
          workout: Array.isArray(vis.sessions),
          meal: Array.isArray(vis.meals),
          body: !shared.hiddenReasons.body_state && 'bodyState' in vis,
          special: !shared.hiddenReasons.special && 'special' in vis
        }
        this.setData({ shared })
      })
      .catch((err) => app.toast((err && err.message) || '加载失败'))

    diaryApi
      .listFeedback(app, {
        studentId,
        targetId: studentId + '|' + localDate
      })
      .then((res) => this.setData({ feedbacks: res.data || [] }))
  },

  onPickDate(e) {
    this.setData({ localDate: e.currentTarget.dataset.key, feedbackText: '' })
    this.reload()
  },

  onFeedbackInput(e) {
    this.setData({ feedbackText: e.detail.value })
  },

  onSubmitFeedback() {
    const app = getApp()
    const text = (this.data.feedbackText || '').trim()
    if (!text) {
      app.toast('请填写点评')
      return
    }
    const user = app.globalData.session.user
    diaryApi
      .addFeedback(app, {
        authorId: user.userId,
        authorName: user.displayName || '教练',
        targetType: 'daily_log',
        targetId: this.data.studentId + '|' + this.data.localDate,
        studentId: this.data.studentId,
        text
      })
      .then(() => {
        this.setData({ feedbackText: '' })
        app.toast('点评已提交')
        this.reload()
      })
  },

  goRecord() {
    const app = getApp()
    app.globalData.activeSubjectId = this.data.studentId
    app.globalData.student = this.data.studentName
    app.persist()
    wx.redirectTo({ url: '/pages/record/index' })
  },

  goBack() {
    wx.redirectTo({ url: '/pages/students/index' })
  }
})
