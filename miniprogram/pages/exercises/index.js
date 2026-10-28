const { requireLogin } = require('../../utils/guard')
const exerciseApi = require('../../services/exerciseApi')

Page({
  data: {
    q: '',
    muscle: '',
    list: [], loading: false, error: '',
    filters: exerciseApi.filters()
  },

  onShow() {
    if (!requireLogin(this)) return
    this.reload()
  },

  reload() {
    const app = getApp()
    const sequence = this._sequence = (this._sequence || 0) + 1
    this.setData({ loading: true, error: '' })
    return exerciseApi
      .listExercises(app, { q: this.data.q, muscleGroup: this.data.muscle })
      .then((res) => { if (sequence === this._sequence) this.setData({ list: res.data || [] }) })
      .catch(err => { if (sequence === this._sequence) this.setData({ error: err.message || '动作库加载失败，请重试' }) })
      .then(() => { if (sequence === this._sequence) this.setData({ loading: false }) })
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
