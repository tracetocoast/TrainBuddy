const { weekBars } = require('../../utils/mock')
const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')

Page({
  data: {
    role: 'student',
    sessions: 12,
    bars: weekBars.map((h) => h * 2),
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    records: []
  },

  onShow() {
    if (!requireLogin(this)) return
    const app = getApp()
    syncRoleBar(this)
    const records = (app.globalData.records || []).slice(-3).reverse()
    this.setData({
      sessions: 12 + (app.globalData.checkins || 0),
      records
    })
  },

  goWorkout() {
    wx.redirectTo({ url: '/pages/workout/index' })
  }
})
