const store = require('./utils/store')
const { getDefaultSessionState } = require('./utils/session')

App({
  globalData: Object.assign(
    {
      sets: 0,
      checkins: 0,
      records: [],
      student: '陈佳宁',
      schedule: null
    },
    getDefaultSessionState()
  ),

  onLaunch() {
    const cached = store.load()
    if (cached) {
      Object.assign(this.globalData, cached)
    }
    // 启动时若无有效会话，首页会经 guard 跳登录
  },

  persist() {
    store.save(this.globalData)
  },

  /** @deprecated 请使用 utils/session.switchDisplayRole，保留兼容 */
  setRole(role) {
    const { switchDisplayRole } = require('./utils/session')
    const result = switchDisplayRole(this, role)
    if (!result.ok) {
      this.toast(result.message)
    }
    return result
  },

  toast(title) {
    wx.showToast({ title, icon: 'none', duration: 2000 })
  }
})
