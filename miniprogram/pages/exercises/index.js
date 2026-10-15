const { requireLogin } = require('../../utils/guard')
const exerciseApi = require('../../services/exerciseApi')

Page({
  data: {
    q: '',
    muscle: '',
    list: [],
    filters: exerciseApi.filters()
  },

  onShow() {
    if (!requireLogin(this)) return
    this.reload()
  },

  reload() {
    const app = getApp()
    exerciseApi
      .listExercises(app, { q: this.data.q, muscleGroup: this.data.muscle })
      .then((res) => this.setData({ list: res.data || [] }))
  },

  onSearch(e) {
    this.setData({ q: e.detail.value })
    this.reload()
  },

  onMuscle(e) {
    this.setData({ muscle: e.currentTarget.dataset.v || '' })
    this.reload()
  },

  goDetail(e) {
    wx.navigateTo({
      url: '/pages/exercise-detail/index?id=' + e.currentTarget.dataset.id
    })
  }
})
