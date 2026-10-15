const { weekDates, slots } = require('../../utils/mock')
const { syncRoleBar, setRole } = require('../../utils/role')

Page({
  data: {
    role: 'student',
    dates: weekDates,
    slots,
    dateIndex: 2,
    booked: ''
  },

  onShow() {
    const app = getApp()
    syncRoleBar(this)
    this.setData({
      dateIndex: app.globalData.date || 2,
      booked: app.globalData.booked || ''
    })
    wx.setNavigationBarTitle({
      title: app.globalData.role === 'coach' ? '排课' : '约课'
    })
  },

  onRole(e) {
    setRole(this, e.currentTarget.dataset.role)
  },

  onPickDate(e) {
    const dateIndex = Number(e.currentTarget.dataset.index)
    const app = getApp()
    app.globalData.date = dateIndex
    app.persist()
    this.setData({ dateIndex })
  },

  onBook(e) {
    const { time, name } = e.currentTarget.dataset
    const app = getApp()
    app.globalData.booked = time
    app.persist()
    this.setData({ booked: time })

    wx.showModal({
      title: '预约确认',
      content: `你选择了 ${time} 的「${name}」。确认后将加入训练日程。`,
      confirmText: '确认预约',
      success(res) {
        if (res.confirm) {
          app.toast('操作已完成')
        }
      }
    })
  }
})
