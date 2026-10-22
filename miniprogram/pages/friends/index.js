const { requireLogin } = require('../../utils/guard')
const api = require('../../services/friendApi')
const time = require('../../utils/time')

function displayComments(rows) {
  return (rows || []).map(row => Object.assign({}, row, { time: time.shanghaiDateKey(row.createdAt) + ' ' + time.formatHm(row.createdAt) }))
}

Page({
  data: { loading: true, error: '', friends: [], selectedId: '', selected: null, sessions: [], received: [], manage: false, code: '', preview: null, invite: null, busy: false, drafts: {} },
  onLoad(query) { if (query && query.id) this.setData({ selectedId: query.id }) },
  onShow() { if (requireLogin(this)) this.reload() },
  onHide() { this.sequence = (this.sequence || 0) + 1 },
  async reload() {
    const sequence = this.sequence = (this.sequence || 0) + 1
    const owner = getApp().globalData.session.user.userId
    const current = () => sequence === this.sequence && getApp().globalData.session && getApp().globalData.session.user.userId === owner
    this.setData({ loading: true, error: '', sessions: [], received: [], selected: null })
    try {
      const result = await api.list()
      if (!current()) return
      const friends = (result.data || []).map(row => Object.assign({}, row, { initial: (row.name || '友').slice(0, 1), days: row.days.map(day => Object.assign({}, day, {label:day.date.slice(5).replace('-', '/')})) }))
      const selected = friends.find(row => row.id === this.data.selectedId) || friends[0] || null
      this.setData({ friends, selectedId: selected ? selected.id : '', selected })
      if (selected) {
        const feed = await api.training(selected.id)
        if (!current()) return
        const sessions = (feed.data.sessions || []).map(row => Object.assign({}, row, {
          comments: displayComments(row.comments),
          exercises: row.exercises.map(exercise => ({ name: exercise.name, summary: exercise.sets.map(set => (set.weight == null ? '重量未记录' : set.weight + ' kg') + ' × ' + (set.reps == null ? '次数未记录' : set.reps + ' 次')).join(' / ') || '没有已完成组' }))
        }))
        const received = (feed.data.received || []).map(row => Object.assign({}, row, { comments: displayComments(row.comments) }))
        this.setData({ sessions, received })
      }
      this.setData({ loading: false })
    } catch (err) { if (current()) this.setData({ loading: false, error: err.message || '读取失败，请重试', friends: [], selected: null }) }
  },
  onSelect(e) { if (this.data.busy) return; this.setData({ selectedId: e.currentTarget.dataset.id }); this.reload() },
  onManage() { this.setData({ manage: !this.data.manage }) },
  onCode(e) { this.setData({ code: e.detail.value.toUpperCase().trim(), preview: null }) },
  async onCreateInvite() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { const result = await api.createInvitation(); this.setData({ invite: Object.assign({}, result.data, { expires: time.shanghaiDateKey(result.data.expiresAt) }) }) }
    catch (err) { getApp().toast(err.message || '创建失败') }
    finally { this.setData({ busy: false }) }
  },
  onCopy() { if (this.data.invite) wx.setClipboardData({ data: this.data.invite.code }) },
  async onPreview() {
    if (this.data.busy) return
    const code = this.data.code
    if (!code) { getApp().toast('请输入朋友的邀请码'); return }
    this.setData({ busy: true, preview: null })
    try { const result = await api.preview(code); this.setData({ preview: Object.assign({}, result.data, { code }) }) }
    catch (err) { getApp().toast(err.message || '邀请码无效') }
    finally { this.setData({ busy: false }) }
  },
  async onAccept() {
    if (this.data.busy || !this.data.preview) return
    const code = this.data.preview.code
    this.setData({ busy: true })
    try {
      const result = await api.accept(code)
      this.setData({ selectedId: result.data.id, preview: null, code: '', manage: false })
      getApp().toast('已绑定朋友')
      await this.reload()
    } catch (err) { getApp().toast(err.message || '绑定失败') }
    finally { this.setData({ busy: false }) }
  },
  onDraft(e) { this.setData({ ['drafts.' + e.currentTarget.dataset.id]: e.detail.value }) },
  async onComment(e) {
    if (this.data.busy) return
    const sessionId = e.currentTarget.dataset.id, id = this.data.selectedId
    const text = (this.data.drafts[sessionId] || '').trim()
    if (!text) { getApp().toast('先写一句点评吧'); return }
    const signature = id + '|' + sessionId + '|' + text
    if (!this.intent || this.intent.signature !== signature) this.intent = { signature, key: 'friend_' + Date.now() + '_' + Math.random().toString(36).slice(2) }
    this.setData({ busy: true })
    try {
      await api.comment(id, sessionId, text, this.intent.key)
      this.intent = null
      this.setData({ ['drafts.' + sessionId]: '' })
      getApp().toast('点评已发布')
      await this.reload()
    } catch (err) { getApp().toast(err.message || '发布失败，请重试') }
    finally { this.setData({ busy: false }) }
  },
  onRemove() {
    if (this.data.busy || !this.data.selected) return
    const id = this.data.selectedId
    wx.showModal({ title: '解除朋友关系', content: '解除后，双方将无法继续查看训练和点评。', confirmText: '确认解除', success: async result => {
      if (!result.confirm) return
      this.setData({ busy: true })
      try { await api.remove(id); this.setData({ selectedId: '', drafts: {} }); await this.reload() }
      catch (err) { getApp().toast(err.message || '解除失败') }
      finally { this.setData({ busy: false }) }
    } })
  }
})
