/**
 * 登录 API 适配层。
 * 当前为 mock；接入微信后只需实现 wechatLogin，业务页无需改动。
 */

const MOCK_USERS = {
  student_only: {
    userId: 'u_stu_001',
    displayName: '陈佳宁',
    wechatSubject: 'mock_openid_stu_001',
    grantedRoles: ['student'],
    coachProfile: null
  },
  coach_approved: {
    userId: 'u_coach_001',
    displayName: '林野',
    wechatSubject: 'mock_openid_coach_001',
    grantedRoles: ['student', 'coach'],
    coachProfile: {
      coachId: 'coach_001',
      intro: '力量进阶 · 私教工作室',
      approvalStatus: 'approved'
    }
  },
  /** 仅用于演示 AC01：客户端声称 coach 会被拒绝 */
  student_claim_coach: {
    userId: 'u_stu_002',
    displayName: '周子墨',
    wechatSubject: 'mock_openid_stu_002',
    grantedRoles: ['student'],
    coachProfile: null
  }
}

/**
 * 预留：微信登录
 * @param {string} code wx.login 拿到的临时 code
 * @returns {Promise<{sessionToken, user, grantedRoles}>}
 */
function wechatLogin(code) {
  // TODO: POST /auth/wechat-session { code }
  return Promise.reject(new Error('WECHAT_LOGIN_NOT_CONFIGURED:' + (code || '')))
}

/**
 * Mock 登录：按预设账号发放「服务端授予」的角色，不接受客户端自选角色。
 * @param {{accountKey: string, claimRole?: string}} payload
 */
function mockLogin(payload) {
  const accountKey = (payload && payload.accountKey) || 'student_only'
  const claimRole = payload && payload.claimRole
  const profile = MOCK_USERS[accountKey]

  if (!profile) {
    return Promise.reject({ code: 'USER_NOT_FOUND', message: '账号不存在' })
  }

  // AC01：即便客户端声称要 coach，也只返回服务端已授予角色
  if (claimRole && profile.grantedRoles.indexOf(claimRole) === -1) {
    return Promise.reject({
      code: 'ROLE_NOT_GRANTED',
      message: '无法获取该角色权限，请联系平台审核',
      grantedRoles: profile.grantedRoles.slice()
    })
  }

  const sessionToken = 'mock_sess_' + profile.userId + '_' + Date.now()
  return Promise.resolve({
    sessionToken,
    user: {
      userId: profile.userId,
      displayName: profile.displayName,
      wechatSubject: profile.wechatSubject,
      coachProfile: profile.coachProfile
    },
    grantedRoles: profile.grantedRoles.slice(),
    mockAccountKey: accountKey
  })
}

/**
 * 申请教练资格（仅提交，不立即授予）
 */
function applyCoachRole() {
  return Promise.resolve({
    status: 'pending_review',
    message: '已提交教练申请，审核通过前无法使用教练工作台'
  })
}

module.exports = {
  MOCK_USERS,
  wechatLogin,
  mockLogin,
  applyCoachRole
}
