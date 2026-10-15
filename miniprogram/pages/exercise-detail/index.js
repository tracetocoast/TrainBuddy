const { requireLogin } = require('../../utils/guard')
const exerciseApi = require('../../services/exerciseApi')
const trainingApi = require('../../services/trainingApi')

Page({
  data: { ex: null },

  onLoad(q) {
    this.id = q.id
  },

  onShow() {
    if (!requireLogin(this)) return
    const app = getApp()
    exerciseApi
      .getExercise(app, this.id)
      .then((res) => this.setData({ ex: res.data }))
      .catch((err) => {
        app.toast((err && err.message) || '无法打开')
        this.setData({ ex: null })
      })
  },

  onFav() {
    const app = getApp()
    exerciseApi.toggleFavorite(app, this.id).then((res) => {
      const ex = Object.assign({}, this.data.ex, { favorited: res.data.favorited })
      this.setData({ ex })
      app.toast(res.data.favorited ? '已收藏' : '已取消')
    })
  },

  onAddPlan() {
    const app = getApp()
    const user = app.globalData.session.user
    const ex = this.data.ex
    trainingApi
      .addExerciseToPersonalPlan(app, user.userId, ex)
      .then((res) => {
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
      .catch((err) => app.toast((err && err.message) || '加入失败'))
  }
})
