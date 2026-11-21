const { requireLogin } = require('../../utils/guard')
const exerciseApi = require('../../services/exerciseApi')
const trainingApi = require('../../services/trainingApi')
const { visible } = require('../../utils/trainingReport')

Page({
  data: { ex: null, adding: false, recent: null },

  onLoad(q) {
    this.id = q.id
  },

  onShow() {
    if (!requireLogin(this)) return
    const app = getApp()
    const owner = app.globalData.session.user.userId
    const role = app.globalData.role
    const sequence = this._sequence = (this._sequence || 0) + 1
    const current = () => sequence === this._sequence &&
      app.globalData.session?.user?.userId === owner && app.globalData.role === role
    this.setData({ ex: null, recent: null })
    exerciseApi
      .getExercise(app, this.id)
      .then((res) => { if (current()) this.setData({ ex: res.data }) })
      .catch((err) => {
        if (!current()) return
        app.toast((err && err.message) || '无法打开')
        this.setData({ ex: null })
      })
    if (role === 'student') trainingApi.listSessions(app, { studentId: owner, status: ['completed'] })
      .then(({ data }) => {
        if (!current()) return
        const rows = (data || []).filter(row => visible(row, owner))
          .sort((a, b) => (b.ended_at || 0) - (a.ended_at || 0) || String(b.business_date).localeCompare(String(a.business_date)))
        for (const row of rows) {
          const exercise = (row.exercises || []).find(item => item.exerciseId === this.id &&
            (item.sets || []).some(set => set.state === 'done'))
          if (!exercise) continue
          const sets = exercise.sets.filter(set => set.state === 'done' && set.actualWeight != null && set.actualReps != null)
          this.setData({ recent: {
            date: row.business_date,
            basis: exercise.loadBasis || '',
            summary: sets.map(set => set.actualWeight + ' kg × ' + set.actualReps + ' 次').join(' · ')
          } })
          break
        }
      }).catch(() => {})
  },
  onHide() { this._sequence = (this._sequence || 0) + 1 },
  onUnload() { this.onHide() },

  onFav() {
    const app = getApp()
    exerciseApi.toggleFavorite(app, this.id).then((res) => {
      const ex = Object.assign({}, this.data.ex, { favorited: res.data.favorited })
      this.setData({ ex })
      app.toast(res.data.favorited ? '已收藏' : '已取消')
    })
  },

  onAddPlan() {
    if (this.data.adding || !this.data.ex) return
    this.setData({ adding: true })
    if (!this.addKey) this.addKey = 'library_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const app = getApp()
    const user = app.globalData.session.user
    const ex = this.data.ex
    trainingApi
      .addExerciseToPersonalPlan(app, user.userId, ex, this.addKey)
      .then((res) => {
        this.addKey = null
        this.setData({ adding: false })
        wx.showModal({
          title: '已加入计划草稿',
          content: '不会覆盖已发布版本。可在计划页编辑后发布。',
          confirmText: '去编辑',
          success: (r) => {
            if (r.confirm) {
              wx.navigateTo({
                url: '/pages/plan-edit/index?id=' + res.data.plan_id
              })
            }
          }
        })
      })
      .catch((err) => { this.setData({ adding: false }); app.toast((err && err.message) || '加入失败') })
  }
})
