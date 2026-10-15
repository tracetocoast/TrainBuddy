/**
 * 本地仅保留会话与草稿（业务数据走服务端）
 */
const KEY = 'lianzida_state_v6'

function load() {
  try {
    return wx.getStorageSync(KEY) || null
  } catch (e) {
    return null
  }
}

function save(data) {
  try {
    wx.setStorageSync(KEY, {
      role: data.role,
      student: data.student,
      session: data.session,
      grantedRoles: data.grantedRoles,
      drafts: data.drafts,
      activeSubjectId: data.activeSubjectId,
      privacyAcceptedAt: data.privacyAcceptedAt,
      _boundStudentsCache: data._boundStudentsCache,
      _meCache: data._meCache
    })
  } catch (e) {
    // ignore
  }
}

module.exports = { load, save }
