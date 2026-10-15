const KEY = 'lianzida_state_v3'

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
      sets: data.sets,
      checkins: data.checkins,
      records: data.records,
      student: data.student,
      session: data.session,
      grantedRoles: data.grantedRoles,
      bindings: data.bindings,
      inviteCatalog: data.inviteCatalog,
      drafts: data.drafts,
      coachMediaCache: data.coachMediaCache,
      signedMediaUrls: data.signedMediaUrls,
      activeSubjectId: data.activeSubjectId,
      privacyAcceptedAt: data.privacyAcceptedAt,
      schedule: data.schedule
    })
  } catch (e) {
    // ignore
  }
}

module.exports = { load, save }
