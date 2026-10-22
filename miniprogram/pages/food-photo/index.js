const { requireLogin } = require('../../utils/guard')

Page({
  data: { photo: '', picking: false, error: '', nutrients: [{ key: 'carbs', name: '碳水化合物' }, { key: 'protein', name: '蛋白质' }, { key: 'fat', name: '脂肪' }] },
  onLoad(query) { this.initialSource = query && ['camera', 'album'].includes(query.source) ? query.source : '' },
  onShow() {
    if (!requireLogin(this)) return
    const owner = getApp().globalData.session.user.userId
    if (this.owner && this.owner !== owner) this.setData({ photo: '', error: '' })
    this.owner = owner
    if (this.initialSource) {
      const source = this.initialSource
      this.initialSource = ''
      this.pick(source)
    }
  },
  onUnload() { this.unloaded = true },
  onCamera() { this.pick('camera') },
  onAlbum() { this.pick('album') },
  pick(source) {
    if (this.data.picking) return
    const owner = this.owner
    this.setData({ picking: true, error: '' })
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: [source],
      success: result => {
        if (this.unloaded) return
        const session = getApp().globalData.session
        if (!session || session.user.userId !== owner) return
        const file = result.tempFiles && result.tempFiles[0]
        if (file && file.tempFilePath) this.setData({ photo: file.tempFilePath })
      },
      fail: err => {
        if (!this.unloaded && !/cancel/i.test((err && err.errMsg) || '')) this.setData({ error: '未能选择照片，请重试；也可以选择另一种方式。' })
      },
      complete: () => { if (!this.unloaded) this.setData({ picking: false }) }
    })
  },
  onPreview() { if (this.data.photo) wx.previewImage({ current: this.data.photo, urls: [this.data.photo] }) },
  goDiary() { wx.navigateTo({ url: '/pages/diary/index' }) }
})
