/**
 * 前端权限判断（演示层）。正式环境必须以服务端校验为准。
 */

function getSession(app) {
  return app.globalData.session || null
}

function isLoggedIn(app) {
  const s = getSession(app)
  return !!(s && s.sessionToken && s.user)
}

function hasGrantedRole(app, role) {
  const s = getSession(app)
  if (!s) return false
  return (s.grantedRoles || []).indexOf(role) !== -1
}

/**
 * AC01：展示角色必须来自 grantedRoles，不能前端自授 coach
 */
function canActivateRole(app, role) {
  return hasGrantedRole(app, role)
}

/**
 * AC02：教练读取学员资源（前端预检；最终以服务端 403 为准）
 */
function canCoachReadStudent(app, coachUserId, studentId, category) {
  const bound = app.globalData._boundStudentsCache || []
  const row = bound.find((x) => x.studentId === studentId)
  if (row) {
    if (category && row.scopes && !row.scopes[category]) {
      return { ok: false, code: 'CONSENT_REQUIRED', message: '学员未授权该类内容' }
    }
    return {
      ok: true,
      binding: {
        coachUserId,
        studentId,
        status: 'active',
        scopes: row.scopes || {}
      }
    }
  }
  // 无缓存时不假装有权；页面应先 refreshServerCaches
  return { ok: false, code: 'FORBIDDEN', message: '无权访问该学员' }
}

/**
 * AC33：解绑后媒体不可读
 */
function canAccessStudentMedia(app, viewerId, subjectId, purpose) {
  if (viewerId === subjectId) return { ok: true }
  const check = canCoachReadStudent(
    app,
    viewerId,
    subjectId,
    purpose === 'raw_photo' ? 'raw_photo' : purpose === 'posture_report' ? 'posture_report' : null
  )
  if (!check.ok) return check
  if (check.binding.mediaAccessRevoked) {
    return { ok: false, code: 'CONSENT_REVOKED', message: '授权已撤回' }
  }
  return check
}

/**
 * AC38：草稿键 = 账户 + 角色 + 学员对象，防止串档
 */
function draftKey(app, recordType, recordId) {
  const s = getSession(app)
  const userId = (s && s.user && s.user.userId) || 'anon'
  const role = app.globalData.role || 'student'
  const subjectId = app.globalData.activeSubjectId || userId
  return [userId, role, subjectId, recordType, recordId || 'new'].join(':')
}

function saveDraft(app, recordType, recordId, payload) {
  const drafts = app.globalData.drafts || {}
  const key = draftKey(app, recordType, recordId)
  drafts[key] = {
    payload,
    updatedAt: Date.now(),
    userId: (getSession(app) && getSession(app).user.userId) || null,
    role: app.globalData.role,
    subjectId: app.globalData.activeSubjectId || null
  }
  app.globalData.drafts = drafts
  app.persist()
  return key
}

function loadDraft(app, recordType, recordId) {
  const drafts = app.globalData.drafts || {}
  return drafts[draftKey(app, recordType, recordId)] || null
}

function clearUserDrafts(app, userId) {
  const drafts = app.globalData.drafts || {}
  Object.keys(drafts).forEach((k) => {
    if (drafts[k].userId === userId) delete drafts[k]
  })
  app.globalData.drafts = drafts
}

module.exports = {
  getSession,
  isLoggedIn,
  hasGrantedRole,
  canActivateRole,
  canCoachReadStudent,
  canAccessStudentMedia,
  draftKey,
  saveDraft,
  loadDraft,
  clearUserDrafts
}
