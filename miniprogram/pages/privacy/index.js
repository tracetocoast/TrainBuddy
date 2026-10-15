const { requireLogin } = require('../../utils/guard')
const { CONSENT_CATEGORIES } = require('../../utils/constants')
const bindingApi = require('../../services/bindingApi')

Page({
  data: {
    binding: null,
    scopeList: CONSENT_CATEGORIES,
    scopes: {}
  },

  onShow() {
    if (!requireLogin(this)) return
    this.refresh()
  },

  refresh() {
    const app = getApp()
    const user = app.globalData.session.user
    const binding = bindingApi.getActivePrimaryCoach(app, user.userId)
    this.setData({
      binding: binding || null,
      scopes: binding
        ? Object.assign({}, binding.scopes)
        : bindingApi.normalizeScopes()
    })
  },

  onToggle(e) {
    const key = e.currentTarget.dataset.key
    const scopes = Object.assign({}, this.data.scopes)
    scopes[key] = !scopes[key]
    this.setData({ scopes })
  },

  onSave() {
    const app = getApp()
    const binding = this.data.binding
    if (!binding) return
    bindingApi
      .updateScopes(app, binding.id, this.data.scopes, app.globalData.session.user.userId)
      .then(() => {
        // 若关闭 raw_photo，立即清签名 URL
        if (!this.data.scopes.raw_photo) {
          const urls = app.globalData.signedMediaUrls || {}
          Object.keys(urls).forEach((id) => {
            const item = urls[id]
            if (
              item &&
              item.subjectId === binding.studentId &&
              item.viewerId === binding.coachUserId &&
              item.purpose === 'raw_photo'
            ) {
              delete urls[id]
            }
          })
          app.globalData.signedMediaUrls = urls
          app.persist()
        }
        app.toast('授权已更新')
        this.refresh()
      })
      .catch((err) => app.toast((err && err.message) || '保存失败'))
  }
})
