const { weekBars } = require('../../utils/mock')
const { syncRoleBar, setRole } = require('../../utils/role')

Page({
  data: {
    role: 'student',
    sessions: 12,
    bars: weekBars.map((h) => h * 2),
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    records: []
  },

  onShow() {
    const app = getApp()
    syncRoleBar(this)
    const records = (app.globalData.records || []).slice(-3).reverse()
    this.setData({
      sessions: 12 + (app.globalData.checkins || 0),
      records
    })
  },

  onRole(e) {
    setRole(this, e.currentTarget.dataset.role)
  },

  goWorkout() {
    wx.redirectTo({ url: '/pages/workout/index' })
  }
})
