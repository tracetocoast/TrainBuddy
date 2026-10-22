const { requireLogin } = require('../../utils/guard')
const bodyApi = require('../../services/bodyMeasurementApi')

Page({
  data: { loading: true, error: '', rows: [], metrics: bodyApi.METRICS.map(item => item.label), selected: 0 },
  onShow() { if (requireLogin(this)) this.reload() },
  reload() {
    const owner = getApp().globalData.session.user.userId
    this.setData({ loading: true, error: '', rows: [] })
    return bodyApi.list().then(res => {
      const session = getApp().globalData.session
      if (!session || session.user.userId !== owner) return
      this.setData({ rows: (res.data || []).slice().reverse().map(row => ({
        id: row.id || row.date, date: row.date, time: row.time || '时间未记录',
        items: bodyApi.METRICS.filter(metric => row.values[metric.key] != null).map(metric => ({ key: metric.key, label: metric.label, value: row.values[metric.key], unit: metric.unit }))
      })) })
    }).catch(err => this.setData({ error: err.message || '读取失败，请重试' })).then(() => this.setData({ loading: false }))
  },
  onTrend(e) { wx.navigateTo({ url: '/pages/body-metric/index?key=' + bodyApi.METRICS[Number(e.detail.value)].key }) }
})
