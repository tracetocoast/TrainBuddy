const { quickAdds } = require('../../utils/mock')
const { syncRoleBar, setRole } = require('../../utils/role')

Page({
  data: {
    role: 'coach',
    students: ['陈佳宁', '周子墨', '许一诺'],
    student: '陈佳宁',
    quickAdds,
    recordText: '',
    note: ''
  },

  onShow() {
    const app = getApp()
    syncRoleBar(this)
    this.setData({
      student: app.globalData.student || '陈佳宁'
    })
  },

  onRole(e) {
    setRole(this, e.currentTarget.dataset.role)
  },

  onPickStudent(e) {
    const student = e.currentTarget.dataset.name
    const app = getApp()
    app.globalData.student = student
    app.persist()
    this.setData({ student })
  },

  onVoice() {
    this.setData({
      recordText:
        '深蹲 4 组 × 10 次 · 60 kg\n罗马尼亚硬拉 3 组 × 10 次 · 40 kg\n臀推 3 组 × 12 次 · 45 kg\n学员状态：动作整体稳定，最后一组略疲劳。'
    })
    getApp().toast('已生成示例训练表，请教练核对')
  },

  onAppend(e) {
    const text = e.currentTarget.dataset.text
    const recordText = this.data.recordText
      ? this.data.recordText + '\n' + text
      : text
    this.setData({ recordText })
    getApp().toast('已添加训练项')
  },

  onRecordInput(e) {
    this.setData({ recordText: e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  onSave() {
    const app = getApp()
    const t = (this.data.recordText || '').trim()
    if (!t) {
      app.toast('请先填写训练内容')
      return
    }
    const first = t.split('\n')[0]
    app.globalData.records = app.globalData.records || []
    app.globalData.records.push(this.data.student + ' · ' + first)
    app.persist()

    const note = this.data.note
    wx.showModal({
      title: '训练记录已保存',
      content:
        this.data.student +
        '\n' +
        t +
        (note ? '\n教练点评：' + note : '') +
        '\n\n演示版已模拟同步给学员。',
      confirmText: '完成',
      showCancel: false
    })
  }
})
