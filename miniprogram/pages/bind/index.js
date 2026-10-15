const { requireLogin } = require('../../utils/guard')
const { CONSENT_CATEGORIES } = require('../../utils/constants')
const bindingApi = require('../../services/bindingApi')

Page({
  data: {
    token: '',
    preview: null,
    scopeList: CONSENT_CATEGORIES,
    scopes: {
      workout_self: true,
      meal: false,
      body_state: true,
      special: false,
      posture_report: false,
      raw_photo: false
    }
  },

  onShow() {
    if (!requireLogin(this)) return
  },

  onToken(e) {
    this.setData({ token: e.detail.value, preview: null })
  },

  onPreview() {
    const app = getApp()
    bindingApi
      .previewInvitation(app, this.data.token)
      .then((preview) => {
        this.setData({ preview })
      })
      .catch((err) => {
        app.toast((err && err.message) || '邀请无效')
      })
  },

  onToggleScope(e) {
    const key = e.currentTarget.dataset.key
    const scopes = Object.assign({}, this.data.scopes)
    scopes[key] = !scopes[key]
    this.setData({ scopes })
  },

  onAccept() {
    const app = getApp()
    const user = app.globalData.session && app.globalData.session.user
    if (!user) return

    bindingApi
      .acceptBinding(app, {
        token: this.data.token,
        studentUser: user,
        scopes: this.data.scopes
      })
      .then((binding) => {
        wx.showModal({
          title: '绑定成功',
          content:
            '已与「' +
            binding.coachName +
            '」建立服务关系。可在个人中心管理授权或解绑。',
          showCancel: false,
          success() {
            wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/profile/index' }) })
          }
        })
      })
      .catch((err) => {
        app.toast((err && err.message) || '绑定失败')
      })
  }
})
