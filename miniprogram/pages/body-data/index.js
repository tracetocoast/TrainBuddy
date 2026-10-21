const { requireLogin } = require('../../utils/guard')
const bodyApi = require('../../services/bodyMeasurementApi')

Page({
  data: { loading: true, error: '', common: [], others: [], showAll: false },
  onShow() { if (requireLogin(this)) this.reload() },
  reload() {
    const owner = getApp().globalData.session.user.userId
    this.setData({ loading: true, error: '', common: [], others: [] })
    return bodyApi.list().then(res => {
      const session = getApp().globalData.session
      if (!session || session.user.userId !== owner) return
      const rows = res.data || []
      const metrics = bodyApi.METRICS.map(metric => {
        const chart = bodyApi.trend(rows, metric.key)
        return Object.assign({}, metric, { value: chart.latest, date: chart.latestDate, change: chart.count > 1 ? chart.deltaText : '' })
      })
      const keys = ['weight', 'bodyFat', 'waist']
      this.setData({ common: keys.map(key => metrics.find(metric => metric.key === key)), others: metrics.filter(metric => !keys.includes(metric.key)) })
    }).catch(err => this.setData({ error: err.message || '读取失败，请重试' }))
      .then(() => this.setData({ loading: false }))
  },
  onToggle() { this.setData({ showAll: !this.data.showAll }) },
  onMetric(e) { wx.navigateTo({ url: '/pages/body-metric/index?key=' + e.currentTarget.dataset.key }) },
  onRecord() { wx.navigateTo({ url: '/pages/body-record/index' }) }
})
