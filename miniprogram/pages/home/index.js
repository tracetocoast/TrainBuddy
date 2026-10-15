const { syncRoleBar, goProfile } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const { canActivateRole } = require('../../utils/permission')
const bindingApi = require('../../services/bindingApi')
const bookingApi = require('../../services/bookingApi')
const growthApi = require('../../services/growthApi')

Page({
  data: {
    role: 'student',
    canSwitchCoach: false,
    streak: 0,
    weekCount: 0,
    planRateText: '暂无',
    nextBooking: null,
    pendingCoachCount: 0,
    sessions: [],
    hasBinding: false,
    coachName: '教练',
    boundCount: 0,
    avatarChar: '我',
    hasStats: false
  },

  onShow() {
    if (!requireLogin(this)) return
    this.refreshPage()
  },

  refreshPage() {
    const app = getApp()
    syncRoleBar(this)
    const user = app.globalData.session.user
    this.setData({
      canSwitchCoach: canActivateRole(app, 'coach'),
      avatarChar: (user.displayName || '我').slice(0, 1)
    })

    app
      .refreshServerCaches()
      .then(() => {
        const primary = bindingApi.getActivePrimaryCoach(app, user.userId)
        return bindingApi.listBoundStudentsForCoachAsync(app).then((bound) => {
          this.setData({
            hasBinding: !!primary,
            coachName: primary ? primary.coachName : '教练',
            sessions: bound || [],
            boundCount: (bound || []).length
          })
          return primary
        })
      })
      .then((primary) => {
        growthApi.getSummary(app, user.userId).then((res) => {
          const s = res.data
          this.setData({
            streak: s.diaryStreak || s.trainingDays || 0,
            weekCount: s.sessionCount,
            hasStats: !s.empty.sessionCount,
            planRateText:
              s.planCompletionRate != null ? s.planCompletionRate + '%' : '暂无'
          })
        })

        if (app.globalData.role === 'student' && primary) {
          bookingApi
            .listBookings(app, {
              studentId: user.userId,
              status: ['pending', 'confirmed']
            })
            .then((res) => {
              const list = (res.data || []).slice().sort((a, b) => a.startAt - b.startAt)
              const next = list[0] || null
              this.setData({
                nextBooking: next
                  ? Object.assign({}, next, {
                      statusLabel: bookingApi.statusLabel(next.status)
                    })
                  : null
              })
            })
            .catch(() => this.setData({ nextBooking: null }))
        } else {
          this.setData({ nextBooking: null })
        }

        if (app.globalData.role === 'coach') {
          const coachId =
            (user.coachProfile && user.coachProfile.coachId) || 'coach_001'
          bookingApi
            .listBookings(app, { coachId, status: ['pending'] })
            .then((res) => {
              this.setData({ pendingCoachCount: (res.data || []).length })
            })
        }
      })
      .catch((err) => app.toast((err && err.message) || '同步失败'))
  },

  goProfile,

  goBind() {
    wx.navigateTo({ url: '/pages/bind/index' })
  },

  onMsg() {
    getApp().toast('暂时没有新消息')
  },

  goWorkout() {
    wx.redirectTo({ url: '/pages/workout/index' })
  },

  goGrowth() {
    wx.redirectTo({ url: '/pages/growth/index' })
  },

  goDiary() {
    wx.navigateTo({ url: '/pages/diary/index' })
  },

  goExercises() {
    wx.navigateTo({ url: '/pages/exercises/index' })
  },

  goStudentProfile(e) {
    const studentId = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.student || ''
    wx.navigateTo({
      url:
        '/pages/student-profile/index?studentId=' +
        studentId +
        '&name=' +
        encodeURIComponent(name)
    })
  },

  goBooking() {
    wx.redirectTo({ url: '/pages/booking/index' })
  },

  goNextBooking() {
    const b = this.data.nextBooking
    if (!b) {
      this.goBooking()
      return
    }
    wx.navigateTo({ url: '/pages/booking-detail/index?id=' + b.booking_id })
  },

  goRecord() {
    wx.redirectTo({ url: '/pages/record/index' })
  },

  goRecordFor(e) {
    const app = getApp()
    const studentId = e.currentTarget.dataset.id
    const check = require('../../utils/permission').canCoachReadStudent(
      app,
      app.globalData.session.user.userId,
      studentId
    )
    if (!check.ok) {
      app.toast(check.message || '无权访问')
      return
    }
    app.globalData.student = e.currentTarget.dataset.student
    app.globalData.activeSubjectId = studentId
    app.persist()
    wx.redirectTo({ url: '/pages/record/index' })
  }
})
