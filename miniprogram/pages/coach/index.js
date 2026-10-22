const { requireLogin } = require('../../utils/guard')
const bindingApi = require('../../services/bindingApi')
const trainingApi = require('../../services/trainingApi')
const diaryApi = require('../../services/diaryApi')
const time = require('../../utils/time')

const mealLabel = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }

Page({
  data: {
    loading: true, error: '', binding: null, tab: 'training',
    tabs: [{ key: 'training', label: '课后反馈' }, { key: 'meal', label: '饮食点评' }, { key: 'booking', label: '约课' }],
    sessions: [], expandedId: '', localDate: '', today: '', day: { meals: [], shares: {} }, feedbacks: [], busy: false
  },
  onShow() {
    if (!requireLogin(this)) return
    if (getApp().globalData.role === 'coach') { wx.redirectTo({ url: '/pages/booking/index' }); return }
    if (!this.data.localDate) this.setData({ localDate: time.todayKey(), today: time.todayKey() })
    this.reload()
  },
  onHide() { this.requestSequence = (this.requestSequence || 0) + 1 },
  async reload() {
    const sequence = this.requestSequence = (this.requestSequence || 0) + 1
    const app = getApp(), owner = app.globalData.session.user.userId, date = this.data.localDate
    const current = () => sequence === this.requestSequence && getApp().globalData.session && getApp().globalData.session.user.userId === owner
    this.setData({ loading: true, error: '', binding: null, sessions: [], day: { meals: [], shares: {} }, feedbacks: [] })
    try {
      const me = await bindingApi.refreshMe(app)
      if (!current()) return
      const binding = me.primaryBinding
      if (binding) binding.initial = (binding.coachName || '教练').slice(0,1)
      if (!binding) { this.setData({ loading: false }); return }
      const [training, daily, feedback] = await Promise.all([
        trainingApi.listSessions(app, { studentId: owner, status: 'completed' }),
        diaryApi.getDailyView(app, owner, date),
        diaryApi.listFeedback(app, { studentId: owner, targetId: owner + '|' + date })
      ])
      if (!current()) return
      const sessions = (training.data || []).filter(row => row.source_type === 'coach_post_session' && row.shared_at && row.coach_id === binding.coachUserId).map(row => ({
        id: row.session_id, title: row.title, date: row.business_date, note: row.public_note || '', doneSets: row.done_sets,
        exercises: (row.exercises || []).map(exercise => ({
          id: exercise.id, name: exercise.name,
          sets: (exercise.sets || []).map(set => ({
            id: set.id, number: set.setNo, weight: set.actualWeight == null ? '未记录' : set.actualWeight + ' kg',
            reps: set.actualReps == null ? '未记录' : set.actualReps + ' 次', done: set.state === 'done'
          }))
        }))
      })).sort((a, b) => b.date.localeCompare(a.date))
      const day = daily.data
      day.meals = (day.meals || []).map(row => Object.assign({}, row, { label: mealLabel[row.mealType] || row.mealType }))
      this.setData({ binding, sessions, expandedId: this.data.expandedId || (sessions[0] && sessions[0].id) || '', day,
        feedbacks: (feedback.data || []).map(row => Object.assign({}, row, {
          typeLabel: row.targetType === 'meal' ? '饮食建议' : '当日反馈',
          timeLabel: row.createdAt ? time.shanghaiDateKey(row.createdAt) + ' ' + time.formatHm(row.createdAt) : ''
        })), loading: false })
    } catch (err) { if (current()) this.setData({ loading: false, error: err.message || '读取失败，请重试' }) }
  },
  onTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }) },
  onExpand(e) { const id = e.currentTarget.dataset.id; this.setData({ expandedId: this.data.expandedId === id ? '' : id }) },
  onDate(e) { this.setData({ localDate: e.detail.value }); this.reload() },
  goBind() { wx.navigateTo({ url: '/pages/bind/index' }) },
  goPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }) },
  goDiary() { wx.navigateTo({ url: '/pages/diary/index?date=' + this.data.localDate }) },
  goBooking() { wx.navigateTo({ url: '/pages/booking/index' }) },
  async onShareMeal() {
    if (this.data.busy) return
    const app = getApp(), owner = app.globalData.session.user.userId, date = this.data.localDate
    const shared = !!this.data.day.shares.meal
    this.setData({ busy: true })
    try {
      if (shared) await diaryApi.revokeDayCategory(app, owner, date, 'meal')
      else await diaryApi.shareDayCategory(app, owner, date, 'meal')
      app.toast(shared ? '已撤回当日饮食共享' : '已共享当日饮食')
      await this.reload()
    } catch (err) { app.toast(err.message || '操作失败，请重试') }
    finally { this.setData({ busy: false }) }
  }
})
