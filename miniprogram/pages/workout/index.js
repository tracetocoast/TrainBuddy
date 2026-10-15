const { exercises } = require('../../utils/mock')
const { syncRoleBar, setRole } = require('../../utils/role')

Page({
  data: {
    role: 'student',
    exercises,
    sets: 0,
    progress: 0,
    progressPercent: 0
  },

  onShow() {
    const app = getApp()
    syncRoleBar(this)
    this.updateProgress(app.globalData.sets || 0)
  },

  onRole(e) {
    setRole(this, e.currentTarget.dataset.role)
  },

  updateProgress(sets) {
    const progress = Math.min(sets, 10)
    this.setData({
      sets,
      progress,
      progressPercent: Math.min((sets / 10) * 100, 100)
    })
  },

  completeSet() {
    const app = getApp()
    const sets = Math.min(10, (app.globalData.sets || 0) + 1)
    app.globalData.sets = sets
    app.persist()
    this.updateProgress(sets)
    app.toast('漂亮！已记录一组')
  },

  finish() {
    const app = getApp()
    const doneSets = app.globalData.sets || 0
    app.globalData.checkins = (app.globalData.checkins || 0) + 1
    app.globalData.records = app.globalData.records || []
    app.globalData.records.push('下肢力量训练 · 完成 ' + doneSets + ' 组')
    app.globalData.sets = 0
    app.persist()
    this.updateProgress(0)

    wx.showModal({
      title: '训练完成，今天又进步了。',
      content: `本次约 45 分钟，已记录 ${doneSets} 组。训练记录已更新，可在成长页查看。`,
      confirmText: '保存小结',
      showCancel: false,
      success() {
        app.toast('操作已完成')
      }
    })
  }
})
