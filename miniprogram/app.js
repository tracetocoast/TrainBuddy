const store = require('./utils/store')

App({
  globalData: {
    role: 'student',
    booked: '',
    sets: 0,
    checkins: 0,
    records: [],
    date: 2,
    student: '陈佳宁'
  },

  onLaunch() {
    const cached = store.load()
    if (cached) {
      Object.assign(this.globalData, cached)
    }
  },

  persist() {
    store.save(this.globalData)
  },

  setRole(role) {
    this.globalData.role = role
    this.persist()
  },

  toast(title) {
    wx.showToast({ title, icon: 'none', duration: 2000 })
  }
})
