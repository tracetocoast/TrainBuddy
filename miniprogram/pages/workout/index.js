const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const trainingApi = require('../../services/trainingApi')

Page({
  data: {
    role: 'student',
    plans: [],
    session: null,
    finishing: false
  },

  onShow() {
    if (!requireLogin(this)) return
    syncRoleBar(this)
    this.reload()
  },

  studentId() {
    return getApp().globalData.session.user.userId
  },

  reload() {
    const app = getApp()
    const studentId = this.studentId()

    trainingApi.listSessions(app, {
      studentId,
      status: ['in_progress', 'draft']
    }).then((res) => {
      const active = (res.data || []).find((s) => s.source_type === 'from_plan') || (res.data || [])[0]
      if (active) {
        this.setData({ session: active, plans: [] })
        return
      }
      return trainingApi.listPlansForStudent(app, studentId).then((pres) => {
        const plans = (pres.data || []).filter((p) => p.published)
        this.setData({ session: null, plans })
      })
    })
  },

  goPlans() {
    wx.navigateTo({ url: '/pages/plans/index' })
  },

  goExercises() {
    wx.navigateTo({ url: '/pages/exercises/index' })
  },

  goDiary() {
    wx.navigateTo({ url: '/pages/diary/index' })
  },

  onEnsureDefault() {
    const app = getApp()
    const user = app.globalData.session.user
    trainingApi.ensureDefaultPublishedPlan(app, {
      studentId: user.userId,
      authorId: user.userId,
      authorRole: 'student'
    })
    this.reload()
  },

  onStart(e) {
    const app = getApp()
    const planId = e.currentTarget.dataset.id
    const studentId = this.studentId()
    trainingApi
      .startSessionFromPlan(app, planId, {
        studentId,
        idempotencyKey: studentId + ':' + planId + ':today'
      })
      .then((res) => {
        this.setData({ session: res.data })
        if (res.resumed) app.toast('已恢复未完成训练')
      })
      .catch((err) => app.toast((err && err.message) || '无法开始'))
  },

  onSetField(e) {
    const app = getApp()
    const setId = e.currentTarget.dataset.sid
    const field = e.currentTarget.dataset.field
    let val = e.detail.value
    if (val === '' || val == null) return
    val = field === 'actualReps' ? parseInt(val, 10) : parseFloat(val)
    if (isNaN(val)) return
    const patch = {}
    patch[field] = val
    trainingApi
      .updateActualSet(app, this.data.session.session_id, setId, patch)
      .then((res) => this.setData({ session: res.data }))
      .catch((err) => app.toast((err && err.message) || '更新失败'))
  },

  onSetState(e) {
    const app = getApp()
    const setId = e.currentTarget.dataset.sid
    const state = e.currentTarget.dataset.state
    trainingApi
      .updateActualSet(app, this.data.session.session_id, setId, { state })
      .then((res) => {
        this.setData({ session: res.data })
        if (state === 'done') app.toast('已记录本组')
      })
      .catch((err) => app.toast((err && err.message) || '更新失败'))
  },

  onFinish() {
    if (this.data.finishing) return
    const app = getApp()
    const session = this.data.session
    wx.showModal({
      title: '结束训练',
      content:
        '已完成 ' +
        session.done_sets +
        ' 组。未完成组将标为跳过。重复点击不会重复累计次数。',
      confirmText: '确认结束',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ finishing: true })
        const completionKey = session.session_id + ':complete'
        trainingApi
          .finalizeSession(app, session.session_id, {
            completionKey,
            share: false,
            actorRole: 'student'
          })
          .then((resp) => {
            this.setData({ finishing: false, session: null })
            const idem = resp.data.idempotent ? '\n（幂等：未重复计数）' : ''
            wx.showModal({
              title: '训练已保存',
              content:
                '完成 ' +
                resp.data.session.done_sets +
                ' 组。' +
                idem +
                (resp.data.next_plan ? '\n已生成下次计划草稿（规则复制，未自动加量）。' : ''),
              showCancel: false,
              success: () => this.reload()
            })
          })
          .catch((err) => {
            this.setData({ finishing: false })
            app.toast((err && err.message) || '结束失败')
          })
      }
    })
  },

  onAbandon() {
    const app = getApp()
    wx.showModal({
      title: '放弃本次',
      content: '不计训练次数，可重新从计划开始。',
      confirmText: '放弃',
      success: (res) => {
        if (!res.confirm) return
        trainingApi
          .abandonSession(app, this.data.session.session_id)
          .then(() => {
            this.setData({ session: null })
            this.reload()
          })
      }
    })
  }
})
