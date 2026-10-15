const { requireLogin } = require('../../utils/guard')
const trainingApi = require('../../services/trainingApi')

Page({
  data: {
    plan: null,
    draft: null,
    title: '',
    goal: '',
    plannedDate: '',
    exercises: []
  },

  onLoad(q) {
    this.planId = q.id
  },

  onShow() {
    if (!requireLogin(this)) return
    this.reload()
  },

  reload() {
    const app = getApp()
    trainingApi
      .getPlan(app, this.planId)
      .then((res) => {
        const plan = res.data
        const draft = plan.latest_draft
        this.setData({
          plan,
          draft,
          title: draft ? draft.title : (plan.published && plan.published.title) || '',
          goal: draft ? draft.goal : (plan.published && plan.published.goal) || '',
          plannedDate: draft
            ? draft.planned_date
            : (plan.published && plan.published.planned_date) || '',
          exercises: draft
            ? draft.exercises
            : (plan.published && plan.published.exercises) || []
        })
      })
      .catch(() => this.setData({ plan: null }))
  },

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },
  onGoal(e) {
    this.setData({ goal: e.detail.value })
  },
  onDate(e) {
    this.setData({ plannedDate: e.detail.value })
  },

  onSaveMeta() {
    const app = getApp()
    const draft = this.data.draft
    if (!draft) return
    trainingApi
      .updatePlanDraft(app, this.planId, {
        version: draft.version,
        title: this.data.title,
        goal: this.data.goal,
        plannedDate: this.data.plannedDate
      })
      .then((res) => {
        app.toast('草稿已保存')
        this.applyPlan(res.data)
      })
      .catch((err) => app.toast((err && err.message) || '保存失败'))
  },

  applyPlan(plan) {
    const draft = plan.latest_draft
    this.setData({
      plan,
      draft,
      title: draft ? draft.title : this.data.title,
      goal: draft ? draft.goal : this.data.goal,
      plannedDate: draft ? draft.planned_date : this.data.plannedDate,
      exercises: draft ? draft.exercises : this.data.exercises
    })
  },

  onSet(e) {
    const app = getApp()
    const draft = this.data.draft
    if (!draft) return
    const field = e.currentTarget.dataset.field
    let val = e.detail.value
    if (val === '' || val == null) return
    val = field === 'targetReps' ? parseInt(val, 10) : parseFloat(val)
    if (isNaN(val)) return
    const patch = {}
    patch[field] = val
    trainingApi
      .updateDraftSet(
        app,
        this.planId,
        draft.version,
        e.currentTarget.dataset.eid,
        e.currentTarget.dataset.sid,
        patch
      )
      .then((res) => this.applyPlan(res.data))
      .catch((err) => app.toast((err && err.message) || '更新失败'))
  },

  onPublish() {
    const app = getApp()
    const draft = this.data.draft
    if (!draft) return
    wx.showModal({
      title: '确认发布',
      content: '学员将看到新版本；旧已发布版归档为 superseded。已开始的训练仍用其快照。',
      confirmText: '确认发布',
      success: (res) => {
        if (!res.confirm) return
        // 先保存 meta
        trainingApi
          .updatePlanDraft(app, this.planId, {
            version: draft.version,
            title: this.data.title,
            goal: this.data.goal,
            plannedDate: this.data.plannedDate
          })
          .then(() =>
            trainingApi.publishPlan(app, this.planId, {
              version: draft.version,
              reviewConfirmation: true
            })
          )
          .then((resp) => {
            app.toast('已发布')
            this.applyPlan(resp.data)
          })
          .catch((err) => app.toast((err && err.message) || '发布失败'))
      }
    })
  }
})
