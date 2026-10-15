const { requireLogin } = require('../../utils/guard')
const trainingApi = require('../../services/trainingApi')

Page({
  data: {
    plans: [],
    isCoach: false,
    isStudent: true,
    studentId: ''
  },

  onShow() {
    if (!requireLogin(this)) return
    const app = getApp()
    const role = app.globalData.role
    const user = app.globalData.session.user
    const studentId =
      role === 'coach' ? app.globalData.activeSubjectId || user.userId : user.userId
    this.setData({
      isCoach: role === 'coach',
      isStudent: role === 'student',
      studentId
    })
    trainingApi.listPlansForStudent(app, studentId).then((res) => {
      this.setData({ plans: res.data || [] })
    })
  },

  onEnsureDefault() {
    const app = getApp()
    const user = app.globalData.session.user
    trainingApi.ensureDefaultPublishedPlan(app, {
      studentId: user.userId,
      authorId: user.userId,
      authorRole: 'student'
    })
    this.onShow()
  },

  goEdit(e) {
    wx.navigateTo({ url: '/pages/plan-edit/index?id=' + e.currentTarget.dataset.id })
  },

  goStart(e) {
    wx.redirectTo({ url: '/pages/workout/index' })
    // workout 页会列出计划；也可直接 start
    const app = getApp()
    trainingApi
      .startSessionFromPlan(app, e.currentTarget.dataset.id, {
        studentId: app.globalData.session.user.userId,
        idempotencyKey:
          app.globalData.session.user.userId +
          ':' +
          e.currentTarget.dataset.id +
          ':today'
      })
      .catch(() => {})
  }
})
