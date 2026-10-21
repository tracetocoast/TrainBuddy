const { requireLogin } = require('../../utils/guard')
const bodyApi = require('../../services/bodyMeasurementApi')
const time = require('../../utils/time')

Page({
  data: { metric: bodyApi.METRICS[0], metricNames: bodyApi.METRICS.map(item => item.label), metricIndex: 0, date: '', time: '', today: '', value: '', previous: '', displayUnit: 'kg', loading: true, saving: false, error: '' },
  onLoad(query) {
    const index = Math.max(0, bodyApi.METRICS.findIndex(item => item.key === query.key))
    this.weightUnit = query.unit === 'jin' ? 'jin' : 'kg'
    this.setData({ metric: bodyApi.METRICS[index], metricIndex: index, date: time.todayKey(), time: time.formatHm(Date.now()), today: time.todayKey() })
    this.setUnit()
    this.newIntent()
  },
  newIntent() { this.intentKey = 'body_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) },
  setUnit() { const unit = this.data.metric.unit; this.setData({ displayUnit: unit === 'kg' ? (this.weightUnit === 'jin' ? '斤' : '公斤') : unit }) },
  onShow() {
    if (!requireLogin(this)) return
    if (!this.ready || this.owner !== getApp().globalData.session.user.userId) this.reload()
  },
  reload() {
    const owner = getApp().globalData.session.user.userId
    if (this.owner !== owner) { this.rows = []; this.ready = false; this.owner = owner; this.setData({ value: '' }) }
    this.setData({ loading: true, error: '' })
    return bodyApi.list().then(res => {
      const session = getApp().globalData.session
      if (!session || session.user.userId !== owner) return
      this.rows = res.data || []; this.ready = true; this.fill()
    }).catch(err => this.setData({ error: err.message || '读取失败，请重试' }))
      .then(() => this.setData({ loading: false }))
  },
  fill() {
    const row = this.rows.slice().reverse().find(item => item.values[this.data.metric.key] != null)
    this.dirty = false
    const factor = this.data.metric.unit === 'kg' && this.weightUnit === 'jin' ? 2 : 1
    this.setUnit()
    this.setData({ value: '', previous: row ? Number((row.values[this.data.metric.key] * factor).toFixed(2)) + ' ' + this.data.displayUnit + ' · ' + row.date + ' ' + (row.time || '时间未记录') : '' })
    this.newIntent()
  },
  onMetric(e) {
    const apply = () => { const index = Number(e.detail.value); this.setData({ metric: bodyApi.METRICS[index], metricIndex: index }); this.fill() }
    if (!this.dirty) return apply()
    wx.showModal({ title: '切换测量项目？', content: '当前输入尚未保存，切换后需要重新填写。', success: result => { if (result.confirm) apply() } })
  },
  onDate(e) { this.setData({ date: e.detail.value }); this.newIntent() },
  onTime(e) { this.setData({ time: e.detail.value }); this.newIntent() },
  onInput(e) { this.dirty = true; this.setData({ value: e.detail.value }); this.newIntent() },
  onHistory() { wx.navigateTo({ url: '/pages/body-metric/index?key=' + this.data.metric.key }) },
  onSave() {
    if (this.data.loading || this.data.saving || this.data.error) return
    const session = getApp().globalData.session
    if (!session || session.user.userId !== this.owner) return
    const raw = this.data.value.trim()
    if (!raw || !Number.isFinite(Number(raw))) return getApp().toast('请填写有效数字')
    this.setData({ saving: true })
    const factor = this.data.metric.unit === 'kg' && this.weightUnit === 'jin' ? 2 : 1
    return bodyApi.append(this.data.date, this.data.time, { [this.data.metric.key]: Number(raw) / factor }, this.intentKey).then(() => {
      this.dirty = false; getApp().toast('已新增记录，历史数据已保留'); wx.navigateBack()
    }).catch(err => getApp().toast(err.message || '保存失败，输入已保留，可重试'))
      .then(() => this.setData({ saving: false }))
  }
})
