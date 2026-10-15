const store = require('./utils/store')
const { getDefaultSessionState } = require('./utils/session')
const bindingApi = require('./services/bindingApi')

App({
  globalData: Object.assign(
    {
      student: '',
      drafts: {},
      _boundStudentsCache: [],
      _meCache: null
      // schedule / training / diary / bindings 不再本地持久化
    },
    getDefaultSessionState()
  ),

  onLaunch() {
    const cached = store.load()
    if (cached) {
      Object.assign(this.globalData, cached)
    }
  },

  persist() {
    store.save(this.globalData)
  },

  /** 登录后刷新 /me 与学员列表缓存 */
  refreshServerCaches() {
    return bindingApi.refreshMe(this).then((me) => {
      if (me && me.grantedRoles) {
        this.globalData.session.grantedRoles = me.grantedRoles
        this.globalData.grantedRoles = me.grantedRoles
      }
      return bindingApi.listBoundStudentsForCoachAsync(this)
    })
  },

  setRole(role) {
    const { switchDisplayRole } = require('./utils/session')
    const result = switchDisplayRole(this, role)
    if (!result.ok) {
      this.toast(result.message)
    }
    return result
  },

  toast(title) {
    wx.showToast({ title, icon: 'none', duration: 2000 })
  }
})
