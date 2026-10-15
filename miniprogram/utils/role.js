function syncRoleBar(page) {
  const app = getApp()
  page.setData({
    role: app.globalData.role || 'student'
  })
}

function setRole(page, role) {
  const app = getApp()
  app.setRole(role)
  page.setData({ role })
  // 切角色后回到首页，避免停在对方角色专属页
  if (page.route !== 'pages/home/index') {
    wx.redirectTo({ url: '/pages/home/index' })
  } else if (typeof page.refreshPage === 'function') {
    page.refreshPage()
  }
}

module.exports = { syncRoleBar, setRole }
