const { coachSessions } = require('../../utils/mock')
const { syncRoleBar, setRole } = require('../../utils/role')

Page({
  data: {
    role: 'student',
    streak: 3,
    weekCount: 4,
    nextBook: '周五 18:30',
    sessions: coachSessions
  },

  onShow() {
    this.refreshPage()
  },

  refreshPage() {
    const app = getApp()
    syncRoleBar(this)
    this.setData({
      streak: 3 + (app.globalData.checkins || 0),
      weekCount: 4 + (app.globalData.checkins || 0),
      nextBook: app.globalData.booked ? app.globalData.booked : '周五 18:30'
    })
  },

  onRole(e) {
    setRole(this, e.currentTarget.dataset.role)
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

  goBooking() {
    wx.redirectTo({ url: '/pages/booking/index' })
  },

  goRecord() {
    wx.redirectTo({ url: '/pages/record/index' })
  },

  goRecordFor(e) {
    const app = getApp()
    app.globalData.student = e.currentTarget.dataset.student
    app.persist()
    wx.redirectTo({ url: '/pages/record/index' })
  },

  onRemind() {
    getApp().toast('已发送模拟提醒')
  }
})
