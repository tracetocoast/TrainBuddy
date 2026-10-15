const { quickAdds } = require('../../utils/mock')
const { syncRoleBar } = require('../../utils/role')
const { requireLogin, requireCoachRole } = require('../../utils/guard')
const { saveDraft, loadDraft, canCoachReadStudent } = require('../../utils/permission')
const bindingApi = require('../../services/bindingApi')

Page({
  data: {
    role: 'coach',
    students: [],
    student: '',
    studentId: '',
    quickAdds,
    recordText: '',
    note: ''
  },

  onShow() {
    if (!requireCoachRole(this)) return
    const app = getApp()
    syncRoleBar(this)
    const bound = bindingApi.listBoundStudentsForCoach(
      app,
      app.globalData.session.user.userId
    )
    const names = bound.map((b) => b.name)
    let student = app.globalData.student
    let studentId = app.globalData.activeSubjectId
    if (names.length && names.indexOf(student) === -1) {
      student = names[0]
      studentId = bound[0].studentId
    }
    if (studentId) {
      app.globalData.activeSubjectId = studentId
      app.globalData.student = student
    }
    const draft = loadDraft(app, 'coach_record', studentId || 'none')
    this.setData({
      students: names,
      student: student || '',
      studentId: studentId || '',
      recordText: (draft && draft.payload && draft.payload.recordText) || '',
      note: (draft && draft.payload && draft.payload.note) || ''
    })
  },

  onPickStudent(e) {
    const app = getApp()
    const name = e.currentTarget.dataset.name
    const bound = bindingApi.listBoundStudentsForCoach(
      app,
      app.globalData.session.user.userId
    )
    const hit = bound.find((b) => b.name === name)
    if (!hit) {
      app.toast('无权访问该学员')
      return
    }
    // 切换学员前提示草稿隔离（AC38）
    app.globalData.student = name
    app.globalData.activeSubjectId = hit.studentId
    app.persist()
    const draft = loadDraft(app, 'coach_record', hit.studentId)
    this.setData({
      student: name,
      studentId: hit.studentId,
      recordText: (draft && draft.payload && draft.payload.recordText) || '',
      note: (draft && draft.payload && draft.payload.note) || ''
    })
  },

  persistDraft() {
    const app = getApp()
    if (!this.data.studentId) return
    saveDraft(app, 'coach_record', this.data.studentId, {
      recordText: this.data.recordText,
      note: this.data.note
    })
  },

  onVoice() {
    this.setData({
      recordText:
        '深蹲 4 组 × 10 次 · 60 kg\n罗马尼亚硬拉 3 组 × 10 次 · 40 kg\n臀推 3 组 × 12 次 · 45 kg\n学员状态：动作整体稳定，最后一组略疲劳。'
    })
    this.persistDraft()
    getApp().toast('已生成示例训练表，请教练核对')
  },

  onAppend(e) {
    const text = e.currentTarget.dataset.text
    const recordText = this.data.recordText
      ? this.data.recordText + '\n' + text
      : text
    this.setData({ recordText })
    this.persistDraft()
    getApp().toast('已添加训练项')
  },

  onRecordInput(e) {
    this.setData({ recordText: e.detail.value })
    this.persistDraft()
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
    this.persistDraft()
  },

  onSave() {
    const app = getApp()
    const check = canCoachReadStudent(
      app,
      app.globalData.session.user.userId,
      this.data.studentId
    )
    if (!check.ok) {
      app.toast(check.message || '无权保存')
      return
    }
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
