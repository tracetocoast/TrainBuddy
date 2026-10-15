const authApi = require('../services/authApi')
const { clearUserDrafts, canActivateRole } = require('./permission')

function getDefaultSessionState() {
  return {
    session: null,
    role: 'student',
    grantedRoles: [],
    bindings: [],
    inviteCatalog: null,
    drafts: {},
    coachMediaCache: {},
    signedMediaUrls: {},
    activeSubjectId: null,
    privacyAcceptedAt: null
  }
}

function applyLoginResult(app, result) {
  const granted = result.grantedRoles || []
  let role = app.globalData.role
  if (granted.indexOf(role) === -1) {
    role = granted.indexOf('student') !== -1 ? 'student' : granted[0]
  }
  app.globalData.session = {
    sessionToken: result.sessionToken,
    user: result.user,
    grantedRoles: granted,
    mockAccountKey: result.mockAccountKey || null,
    loggedInAt: Date.now()
  }
  app.globalData.grantedRoles = granted
  app.globalData.role = role
  app.globalData.activeSubjectId = result.user.userId
  app.persist()
  return app.globalData.session
}

function loginMock(app, accountKey, claimRole) {
  return authApi.mockLogin({ accountKey, claimRole }).then((result) => {
    return applyLoginResult(app, result)
  })
}

/**
 * 预留微信登录入口
 */
function loginWithWeChat(app) {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) {
          reject({ code: 'NO_CODE', message: '未获取到微信登录 code' })
          return
        }
        authApi
          .wechatLogin(res.code)
          .then((result) => resolve(applyLoginResult(app, result)))
          .catch(reject)
      },
      fail(err) {
        reject({ code: 'WX_LOGIN_FAIL', message: '微信登录失败', detail: err })
      }
    })
  })
}

function logout(app) {
  const userId = app.globalData.session && app.globalData.session.user
    ? app.globalData.session.user.userId
    : null
  if (userId) clearUserDrafts(app, userId)
  app.globalData.session = null
  app.globalData.grantedRoles = []
  app.globalData.role = 'student'
  app.globalData.activeSubjectId = null
  app.persist()
}

function switchDisplayRole(app, role) {
  if (!canActivateRole(app, role)) {
    return {
      ok: false,
      code: 'ROLE_NOT_GRANTED',
      message: '当前账号未授予该角色，无法切换'
    }
  }
  app.globalData.role = role
  const userId =
    (app.globalData.session &&
      app.globalData.session.user &&
      app.globalData.session.user.userId) ||
    null
  // 切换角色时隔离 activeSubject：学员视角回到自己
  if (role === 'student' && userId) {
    app.globalData.activeSubjectId = userId
  }
  app.persist()
  return { ok: true, role }
}

module.exports = {
  getDefaultSessionState,
  applyLoginResult,
  loginMock,
  loginWithWeChat,
  logout,
  switchDisplayRole
}
