const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const bindingApi = require('../../services/bindingApi')
const bookingApi = require('../../services/bookingApi')
const time = require('../../utils/time')
const { SCHEDULE_CONFIG } = require('../../utils/scheduleConfig')
const interaction = require('../../utils/interaction')

Page({
  data: {
    role: 'student',
    hasBinding: false,
    coachName: '',
    coachId: '',
    dateList: [],
    selectedDate: '',
    monthTitle: '',
    openDays: SCHEDULE_CONFIG.openDaysAhead,
    daySlots: [],
    myBookings: [],
    submitting: false,
    actionState: 'idle', bookingError: '', slotsError: '', slotsLoading: false,
    timeOptions: [], timeIndex: 0, selectedSlot: null, reduced: false,
    coachTab: 'pending',
    pendingList: [],
    changeList: [],
    pendingCount: 0,
    coachDayBookings: [],
    openSlotsPreview: [],
    weekSummary: []
  },

  onShow() {
    if (!requireLogin(this)) return
    syncRoleBar(this)
    this.setData({ reduced: interaction.reducedMotion() })
    const app = getApp()
    wx.setNavigationBarTitle({
      title: app.globalData.role === 'coach' ? '排课' : '约课'
    })
    this.initDates()
    this.refresh()
  },
  onUnload() { this._refreshGeneration = (this._refreshGeneration || 0) + 1 },

  initDates() {
    const today = time.todayKey()
    const keys = time.listDateKeys(today, SCHEDULE_CONFIG.openDaysAhead)
    const dateList = keys.map((k) => time.formatDateLabel(k))
    const selectedDate = this.data.selectedDate || today
    const lab = time.formatDateLabel(selectedDate)
    this.setData({
      dateList,
      selectedDate,
      monthTitle: lab.year + ' 年 ' + lab.month + ' 月',
      openDays: SCHEDULE_CONFIG.openDaysAhead
    })
  },

  refresh() {
    const app = getApp()
    if (app.globalData.role === 'coach') {
      this.refreshCoach()
    } else {
      this.refreshStudent()
    }
  },

  refreshStudent() {
    const generation = this._refreshGeneration = (this._refreshGeneration || 0) + 1
    const selectedDate = this.data.selectedDate
    const owner = this.studentOwner()
    this.setData({ slotsLoading: true, slotsError: '' })
    const app = getApp()
    const user = app.globalData.session.user
    bindingApi.refreshMe(app).then((me) => {
      if (generation !== this._refreshGeneration || getApp().globalData.role !== 'student' || owner !== this.studentOwner()) return
      const primary =
        (me && me.primaryBinding) || bindingApi.getActivePrimaryCoach(app, user.userId)
      if (!primary) {
        this.setData({
          hasBinding: false,
          coachName: '',
          coachId: '',
          daySlots: [],
          myBookings: []
          , slotsLoading: false, selectedSlot: null, timeOptions: []
        })
        return
      }
      this.setData({
        hasBinding: true,
        coachName: primary.coachName,
        coachId: primary.coachId
      })

      return Promise.all([bookingApi
        .getSlots(app, {
          coachId: primary.coachId,
          fromDate: selectedDate,
          toDate: selectedDate
        })
        .then((res) => {
          if (generation !== this._refreshGeneration || owner !== this.studentOwner()) return
          const daySlots = (res.data.slots || []).map(slot => Object.assign({}, slot, {
            available: slot.status === 'open' && Number(slot.startAt) > Date.now()
          }))
          const timeOptions = daySlots.filter(slot => slot.available).map(slot => ({
            label: slot.startLabel + '–' + slot.endLabel + ' · ' + slot.courseName, slot
          }))
          const previous = this.data.selectedSlot
          const timeIndex = Math.max(0, timeOptions.findIndex(item => previous && item.slot.startAt === previous.startAt && item.slot.courseTypeId === previous.courseTypeId))
          this.setData({ daySlots, timeOptions, timeIndex, selectedSlot: timeOptions[timeIndex] ? timeOptions[timeIndex].slot : null, slotsLoading: false })
        }), bookingApi
        .listBookings(app, { studentId: user.userId })
        .then((res) => {
          if (generation !== this._refreshGeneration || owner !== this.studentOwner()) return
          const myBookings = (res.data || []).map((b) =>
            Object.assign({}, b, { statusLabel: bookingApi.statusLabel(b.status) })
          )
          this.setData({ myBookings })
        })])
    }).catch(err => {
      if (generation === this._refreshGeneration) this.setData({ slotsLoading: false, slotsError: err.message || '时段加载失败，请重试' })
    })
  },

  refreshCoach() {
    const generation = this._refreshGeneration = (this._refreshGeneration || 0) + 1
    const owner = this.studentOwner()
    this.setData({ slotsError: '' })
    const app = getApp()
    const coachId =
      (app.globalData.session.user.coachProfile &&
        app.globalData.session.user.coachProfile.coachId) ||
      'coach_001'

    return Promise.all([
      bookingApi.listBookings(app, {
        coachId,
        status: ['pending']
      }),
      bookingApi.listPendingChanges(app, coachId),
      bookingApi.listBookings(app, { coachId, dateKey: this.data.selectedDate }),
      bookingApi.getSlots(app, {
        coachId,
        fromDate: this.data.selectedDate,
        toDate: this.data.selectedDate
      })
    ]).then(([pendingRes, changeRes, dayRes, slotsRes]) => {
      if (generation !== this._refreshGeneration || owner !== this.studentOwner()) return
      const pendingList = (pendingRes.data || []).map((b) =>
        Object.assign({}, b, { statusLabel: bookingApi.statusLabel(b.status) })
      )
      const changeList = changeRes.data || []
      const coachDayBookings = (dayRes.data || []).map((b) =>
        Object.assign({}, b, { statusLabel: bookingApi.statusLabel(b.status) })
      )
      const openSlotsPreview = (slotsRes.data.slots || [])
        .filter((s) => s.status === 'open')
        .slice(0, 8)

      this.setData({
        pendingList,
        changeList,
        pendingCount: pendingList.length + changeList.length,
        coachDayBookings,
        openSlotsPreview
      })
      return this.buildWeekSummary(coachId, generation)
    }).catch(err => {
      if (generation === this._refreshGeneration && owner === this.studentOwner()) this.setData({ slotsError: err.message || '排课加载失败，请重试' })
    })
  },

  buildWeekSummary(coachId, generation) {
    const app = getApp()
    const start = this.data.selectedDate
    // 以选中日所在周：简化为选中日起 7 天
    const keys = time.listDateKeys(start, 7)
    return Promise.all(
      keys.map((k) =>
        bookingApi.listBookings(app, { coachId, dateKey: k }).then((res) => {
          const active = (res.data || []).filter((b) => {
            const s = b.status
            return s === 'pending' || s === 'confirmed' || s === 'in_progress'
          })
          const lab = time.formatDateLabel(k)
          return { dateKey: k, weekday: lab.weekday, day: lab.day, count: active.length }
        })
      )
    ).then((weekSummary) => { if (generation === this._refreshGeneration) this.setData({ weekSummary }) })
  },

  onPickDate(e) {
    if (this._bookingBusy || this._bookingModal || this.data.actionState === 'error') return
    const key = e.detail.value || e.currentTarget.dataset.key
    if (!this.data.dateList.some(item => item.dateKey === key)) return
    const lab = time.formatDateLabel(key)
    this.setData({
      selectedDate: key, selectedSlot: null, timeOptions: [], daySlots: [], actionState: 'idle', bookingError: '',
      monthTitle: lab.year + ' 年 ' + lab.month + ' 月'
    })
    this.refresh()
  },

  onTimePick(e) {
    if (this._bookingBusy || this._bookingModal || this.data.actionState === 'error') return
    const timeIndex = Number(e.detail.value), item = this.data.timeOptions[timeIndex]
    if (item) this.setData({ timeIndex, selectedSlot: item.slot, actionState: 'idle', bookingError: '' })
  },
  onMotion(e) { interaction.setReducedMotion(e.detail.value); this.setData({ reduced: !!e.detail.value }) },
  studentOwner() { const app = getApp(); return app.globalData.session.user.userId + ':' + app.globalData.role },
  onResetBooking() { if (!this._bookingBusy) { this._retryBooking = null; this.setData({ actionState: 'idle', bookingError: '' }); this.refresh() } },
  onSelectSlot(e) {
    const index = this.data.timeOptions.findIndex(item => item.slot.startAt === Number(e.currentTarget.dataset.start) && item.slot.courseTypeId === e.currentTarget.dataset.course)
    if (index >= 0) this.onTimePick({ detail: { value: index } })
  },
  onBookSelected() {
    const slot = this.data.selectedSlot
    if (!slot || this.data.slotsLoading) return
    this.onRequestBook({ currentTarget: { dataset: { start: slot.startAt, course: slot.courseTypeId, name: slot.courseName, label: slot.startLabel } } })
  },

  onCoachTab(e) {
    this.setData({ coachTab: e.currentTarget.dataset.tab })
  },

  goBind() {
    wx.navigateTo({ url: '/pages/bind/index' })
  },

  goRules() {
    wx.navigateTo({ url: '/pages/schedule-rules/index' })
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/booking-detail/index?id=' + id })
  },

  /**
   * 关键：仅打开确认框，确认后才调用 createBooking（修复原型先写 booked）
   */
  onRequestBook(e) {
    if (this._bookingBusy || this._bookingModal || this.data.slotsLoading) return
    const app = getApp()
    const startAt = Number(e.currentTarget.dataset.start)
    const courseTypeId = e.currentTarget.dataset.course
    const name = e.currentTarget.dataset.name
    const label = e.currentTarget.dataset.label
    const dateKey = this.data.selectedDate
    if (this.data.actionState === 'error' && this._retryBooking) return this.submitBooking(this._retryBooking.startAt, this._retryBooking.courseTypeId)
    if (!this.data.daySlots.some(slot => slot.startAt === startAt && slot.courseTypeId === courseTypeId && slot.available && startAt > Date.now())) return
    this._bookingModal = true
    wx.showModal({
      title: '预约确认',
      content:
        '预约 ' +
        dateKey +
        ' ' +
        label +
        '「' +
        name +
        '」。提交后为待确认，教练接受前可撤回。取消弹层不会创建预约。',
      confirmText: '提交预约',
      success: (res) => {
        this._bookingModal = false
        if (!res.confirm) return
        this.submitBooking(startAt, courseTypeId)
      }, fail: () => { this._bookingModal = false }
    })
  },

  submitBooking(startAt, courseTypeId) {
    if (this._bookingBusy) return Promise.resolve()
    this._bookingBusy = true
    const app = getApp()
    const user = app.globalData.session.user
    this.setData({ submitting: true, actionState: 'submitting', bookingError: '' })
    const owner = this.studentOwner()
    this._retryBooking = { startAt, courseTypeId }
    const idem = 'book_' + user.userId + '_' + this.data.coachId + '_' + startAt + '_' + courseTypeId

    return bookingApi
      .createBooking(
        app,
        {
          coachId: this.data.coachId,
          studentId: user.userId,
          studentName: user.displayName,
          startAt,
          courseTypeId,
          acceptedRulesVersion: SCHEDULE_CONFIG.rulesVersion
        },
        idem
      )
      .then((resp) => {
        if (owner !== this.studentOwner()) return
        const actionState = interaction.bookingState(resp.data)
        this.setData({ submitting: false, actionState })
        this._retryBooking = null
        wx.showModal({
          title: actionState === 'confirmed' ? '预约成功' : '已提交，等待教练确认',
          content:
            '状态：' + resp.data.status + '\n' +
            resp.data.start_at +
            '\n超时未确认将自动失效。',
          showCancel: false,
          success: () => {
            wx.navigateTo({
              url: '/pages/booking-detail/index?id=' + resp.data.booking_id
            })
          }
        })
        this.refresh()
      })
      .catch((err) => {
        if (owner !== this.studentOwner()) return
        const msg = (err && err.message) || '预约失败'
        this.setData({ submitting: false, actionState: 'error', bookingError: msg + '。可重试；网络中断时将沿用同一请求编号。' })
        if (err && ['SLOT_CONFLICT', 'BOOKING_WINDOW_CLOSED'].includes(err.code)) {
          this._retryBooking = null
          this.setData({ actionState: 'idle', selectedSlot: null, bookingError: msg + '。请重新选择并确认时段。' })
          wx.showModal({
            title: '时段冲突',
            content: msg + '，已刷新可约时段。',
            showCancel: false,
            success: () => this.refresh()
          })
          return
        }
        app.toast(msg)
      }).then(() => { this._bookingBusy = false })
  },

  onAccept(e) {
    this.decide(e, 'accept')
  },

  onReject(e) {
    const id = e.currentTarget.dataset.id
    const rev = Number(e.currentTarget.dataset.rev)
    wx.showModal({
      title: '拒绝预约',
      content: '确认拒绝？拒绝后时段释放。点取消不会改动预约。',
      confirmText: '确认拒绝',
      success: (res) => {
        if (!res.confirm) return
        this.decide({ currentTarget: { dataset: { id, rev } } }, 'reject', '教练拒绝')
      }
    })
  },

  decide(e, action, reason) {
    const app = getApp()
    const id = e.currentTarget.dataset.id
    const revision = Number(e.currentTarget.dataset.rev)
    const coachId =
      (app.globalData.session.user.coachProfile &&
        app.globalData.session.user.coachProfile.coachId) ||
      'coach_001'
    bookingApi
      .decideBooking(app, id, {
        action,
        reason: reason || '',
        revision,
        coachId
      })
      .then(() => {
        app.toast(action === 'accept' ? '已确认' : '已拒绝')
        this.refresh()
      })
      .catch((err) => app.toast((err && err.message) || '操作失败'))
  },

  onAcceptChange(e) {
    const app = getApp()
    const coachId =
      (app.globalData.session.user.coachProfile &&
        app.globalData.session.user.coachProfile.coachId) ||
      'coach_001'
    bookingApi
      .decideChange(app, e.currentTarget.dataset.id, { action: 'accept', coachId })
      .then(() => {
        app.toast('改期已生效')
        this.refresh()
      })
      .catch((err) => app.toast((err && err.message) || '失败'))
  },

  onRejectChange(e) {
    const app = getApp()
    const coachId =
      (app.globalData.session.user.coachProfile &&
        app.globalData.session.user.coachProfile.coachId) ||
      'coach_001'
    bookingApi
      .decideChange(app, e.currentTarget.dataset.id, { action: 'reject', coachId })
      .then(() => {
        app.toast('已拒绝改期，原课保留')
        this.refresh()
      })
      .catch((err) => app.toast((err && err.message) || '失败'))
  }
})
