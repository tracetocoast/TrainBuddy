const { requireLogin } = require('../../utils/guard')
const bodyApi = require('../../services/bodyMeasurementApi')
const time = require('../../utils/time')

Page({
  data: { metric: bodyApi.METRICS[0], metricNames: bodyApi.METRICS.map(item => item.label), metricIndex: 0, date: '', today: '', value: '', loading: true, saving: false, error: '', conflict: false },
  onLoad(query) {
    const index = Math.max(0, bodyApi.METRICS.findIndex(item => item.key === query.key))
    this.setData({ metric: bodyApi.METRICS[index], metricIndex: index, date: query.date || time.todayKey(), today: time.todayKey() })
  },
  onShow() {
    if (!requireLogin(this)) return
    if (!this.ready || this.owner !== getApp().globalData.session.user.userId) this.reload()
  },
  reload() {
    const owner = getApp().globalData.session.user.userId
    if (this.owner !== owner) {
      this.rows = []
      this.ready = false
      this.owner = owner
      this.setData({ value: '', conflict: false })
    }
    this.setData({ loading: true, error: '' })
    return bodyApi.list().then(res => {
      const session = getApp().globalData.session
      if (!session || session.user.userId !== owner) return
      this.rows = res.data || []
      this.ready = true
      this.fill()
    }).catch(err => this.setData({ error: err.message || '读取失败，请重试' }))
      .then(() => this.setData({ loading: false }))
  },
  fill() {
    const row = (this.rows || []).find(item => item.date === this.data.date)
    this.revision = row ? row.revision : 0
    const value = row && row.values[this.data.metric.key]
    this.dirty = false
    this.setData({ value: value == null ? '' : String(value), conflict: false })
  },
  confirmSwitch(apply) {
    if (!this.dirty) return apply()
    wx.showModal({ title: '切换记录？', content: '当前输入尚未保存，切换后将载入对应记录。', success: result => { if (result.confirm) apply() } })
  },
  onMetric(e) {
    this.confirmSwitch(() => { const index = Number(e.detail.value); this.setData({ metric: bodyApi.METRICS[index], metricIndex: index }); this.fill() })
  },
  onDate(e) { this.confirmSwitch(() => { this.setData({ date: e.detail.value }); this.fill() }) },
  onInput(e) { this.dirty = true; this.setData({ value: e.detail.value }) },
  onReload() {
    wx.showModal({ title: '载入最新记录？', content: '当前未保存的输入将被替换。', success: result => { if (result.confirm) this.reload() } })
  },
  onSave() {
    if (this.data.loading || this.data.saving || this.data.error || this.data.conflict) return
    const session = getApp().globalData.session
    if (!session || session.user.userId !== this.owner) return
    const raw = this.data.value.trim()
    if (!raw || !Number.isFinite(Number(raw))) return getApp().toast('请填写有效数字')
    this.setData({ saving: true })
    return bodyApi.save(this.data.date, { [this.data.metric.key]: Number(raw) }, this.revision).then(() => {
      this.dirty = false
      getApp().toast('已保存')
      wx.navigateBack()
    }).catch(err => { if (err.code === 'REVISION_CONFLICT') this.setData({ conflict: true }); getApp().toast(err.message || '保存失败，输入已保留') })
      .then(() => this.setData({ saving: false }))
  }
})
