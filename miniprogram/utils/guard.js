const { isLoggedIn } = require('./permission')

const PUBLIC_ROUTES = {
  'pages/login/index': true
}

/**
 * 页面 onShow 时调用。未登录则跳转登录页。
 * @returns {boolean} 是否已登录可继续渲染
 */
function requireLogin(page) {
  const app = getApp()
  if (isLoggedIn(app)) return true

  const route = page && page.route
  if (route && PUBLIC_ROUTES[route]) return false

  wx.redirectTo({ url: '/pages/login/index' })
  return false
}

/**
 * 教练专属页：无 coach 授予时退回首页
 */
function requireCoachRole(page) {
  if (!requireLogin(page)) return false
  const app = getApp()
  const granted = (app.globalData.session && app.globalData.session.grantedRoles) || []
  if (granted.indexOf('coach') === -1) {
    app.toast('当前账号无教练权限')
    wx.redirectTo({ url: '/pages/home/index' })
    return false
  }
  if (app.globalData.role !== 'coach') {
    // 有授予但展示角色是学员时，提示切换而非越权渲染
    app.toast('请先切换到教练视角')
    wx.redirectTo({ url: '/pages/home/index' })
    return false
  }
  return true
}

module.exports = { requireLogin, requireCoachRole, PUBLIC_ROUTES }
