const { exercises } = require('../../utils/mock')
const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const { saveDraft, loadDraft, draftKey } = require('../../utils/permission')

Page({
  data: {
    role: 'student',
    exercises,
    sets: 0,
    progress: 0,
    progressPercent: 0,
    draftKeyText: ''
  },

  onShow() {
    if (!requireLogin(this)) return
    const app = getApp()
    syncRoleBar(this)
    const key = draftKey(app, 'workout_session', 'current')
    const draft = loadDraft(app, 'workout_session', 'current')
    const sets = draft && draft.payload && typeof draft.payload.sets === 'number'
      ? draft.payload.sets
      : app.globalData.sets || 0
    this.updateProgress(sets)
    this.setData({ draftKeyText: key })
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
    const sets = Math.min(10, (this.data.sets || 0) + 1)
    app.globalData.sets = sets
    // AC38：草稿按 账户+角色+学员 隔离
    saveDraft(app, 'workout_session', 'current', { sets })
    app.persist()
    this.updateProgress(sets)
    app.toast('漂亮！已记录一组')
  },

  finish() {
    const app = getApp()
    const doneSets = this.data.sets || 0
    app.globalData.checkins = (app.globalData.checkins || 0) + 1
    app.globalData.records = app.globalData.records || []
    app.globalData.records.push('下肢力量训练 · 完成 ' + doneSets + ' 组')
    app.globalData.sets = 0
    saveDraft(app, 'workout_session', 'current', { sets: 0 })
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
