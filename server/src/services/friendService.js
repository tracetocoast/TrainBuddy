const crypto = require('crypto')
const time = require('../lib/time')
const { makeId } = require('../lib/ids')
const { AppError } = require('../lib/errors')

function store(state) {
  if (!state.friends) state.friends = { invitations: [], relations: [], comments: [] }
  return state.friends
}
const hash = code => crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex')

function relationship(state, actorId, id) {
  const row = store(state).relations.find(item => item.id === id && item.status === 'active' && item.members.includes(actorId))
  if (!row) throw new AppError('FORBIDDEN', '朋友关系不存在或已解除', { status: 403 })
  return row
}

function recentSessions(state, userId) {
  const today = time.todayKey(), from = time.addDays(today, -6)
  return ((state.training || {}).sessions || []).filter(row => row.studentId === userId && row.status === 'completed' && row.businessDate >= from && row.businessDate <= today && (row.sourceType !== 'coach_post_session' || row.sharedAt))
    .slice().sort((a, b) => b.businessDate.localeCompare(a.businessDate) || (b.endedAt || 0) - (a.endedAt || 0))
}

function overview(state, actor) {
  return store(state).relations.filter(row => row.status === 'active' && row.members.includes(actor.userId)).map(row => {
    const friendId = row.members.find(id => id !== actor.userId)
    const user = state.users.find(item => item.userId === friendId)
    const sessions = recentSessions(state, friendId)
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = time.addDays(time.todayKey(), index - 6)
      return { date, count: sessions.filter(session => session.businessDate === date).length }
    })
    return { id: row.id, name: user ? user.displayName : '朋友', days, sessionCount: sessions.length, trainingDays: days.filter(day => day.count).length }
  })
}

function createInvitation(state, actor) {
  const rows = store(state).invitations
  rows.filter(row => row.ownerId === actor.userId && !row.usedBy).forEach(row => { row.revoked = true })
  const code = crypto.randomBytes(5).toString('hex').toUpperCase()
  const expiresAt = time.nowMs() + 7 * 86400000
  rows.push({ id: makeId('friend_inv'), codeHash: hash(code), ownerId: actor.userId, expiresAt, usedBy: null })
  return { code, expiresAt }
}

function invitation(state, code) {
  const row = store(state).invitations.find(item => item.codeHash === hash(code))
  if (!row || row.revoked || row.expiresAt <= time.nowMs()) throw new AppError('INVALID_STATE', '邀请码无效或已过期')
  return row
}

function preview(state, actor, code) {
  const row = invitation(state, code)
  if (row.ownerId === actor.userId) throw new AppError('VALIDATION', '不能添加自己为朋友')
  if (row.usedBy) throw new AppError('INVALID_STATE', '邀请码已被使用')
  const user = state.users.find(item => item.userId === row.ownerId)
  return { name: user ? user.displayName : '朋友', expiresAt: row.expiresAt }
}

function accept(state, actor, code, consent) {
  if (consent !== true) throw new AppError('VALIDATION', '请确认互相共享最近七天的已完成训练')
  const inv = invitation(state, code)
  if (inv.ownerId === actor.userId) throw new AppError('VALIDATION', '不能添加自己为朋友')
  const friends = store(state)
  const existing = friends.relations.find(row => row.status === 'active' && row.members.includes(inv.ownerId) && row.members.includes(actor.userId))
  if (inv.usedBy) {
    if (inv.usedBy === actor.userId && existing) return { id: existing.id }
    throw new AppError('INVALID_STATE', '邀请码已被使用')
  }
  if (existing) throw new AppError('INVALID_STATE', '你们已经是朋友了')
  const row = { id: makeId('friend'), members: [inv.ownerId, actor.userId], status: 'active', createdAt: time.nowMs() }
  inv.usedBy = actor.userId
  friends.relations.push(row)
  return { id: row.id }
}

function commentView(state, comment) {
  const user = state.users.find(row => row.userId === comment.authorId)
  return { id: comment.id, name: user ? user.displayName : '朋友', text: comment.text, createdAt: comment.createdAt }
}

function feed(state, actor, id) {
  const row = relationship(state, actor.userId, id), friends = store(state)
  const other = row.members.find(member => member !== actor.userId)
  const comments = session => friends.comments.filter(comment => comment.relationId === id && comment.sessionId === session.id).map(comment => commentView(state, comment))
  return {
    sessions: recentSessions(state, other).map(session => ({
      id: session.id, date: session.businessDate, title: session.title,
      exercises: (session.exercises || []).map(exercise => ({
        name: exercise.name, sets: (exercise.sets || []).filter(set => set.state === 'done').map(set => ({ weight: set.actualWeight, reps: set.actualReps }))
      })), comments: comments(session)
    })),
    received: recentSessions(state, actor.userId).map(session => ({ id: session.id, date: session.businessDate, title: session.title, comments: comments(session) })).filter(session => session.comments.length)
  }
}

function addComment(state, actor, id, payload) {
  const row = relationship(state, actor.userId, id)
  const session = row.members.flatMap(member => recentSessions(state, member)).find(item => item.id === payload.sessionId)
  if (!session) throw new AppError('FORBIDDEN', '只能点评朋友关系内最近七天的已完成训练', { status: 403 })
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (!text || text.length > 500) throw new AppError('VALIDATION', '请填写 1–500 字点评')
  if (typeof payload.key !== 'string' || !payload.key || payload.key.length > 120) throw new AppError('VALIDATION', '缺少有效提交标识')
  const friends = store(state)
  const prior = friends.comments.find(comment => comment.relationId === id && comment.authorId === actor.userId && comment.key === payload.key)
  if (prior) {
    if (prior.text !== text || prior.sessionId !== session.id) throw new AppError('IDEMPOTENCY_CONFLICT', '提交内容已变化', { status: 409 })
    return commentView(state, prior)
  }
  const comment = { id: makeId('friend_comment'), relationId: id, sessionId: session.id, authorId: actor.userId, key: payload.key, text, createdAt: time.nowMs() }
  friends.comments.push(comment)
  return commentView(state, comment)
}

function remove(state, actor, id) {
  const row = relationship(state, actor.userId, id)
  row.status = 'ended'
  row.endedAt = time.nowMs()
  return { ok: true }
}

module.exports = { overview, createInvitation, preview, accept, feed, addComment, remove }
