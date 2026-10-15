const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const bindingApi = require('../../services/bindingApi')
const bookingApi = require('../../services/bookingApi')
const time = require('../../utils/time')
const { SCHEDULE_CONFIG } = require('../../utils/scheduleConfig')

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
    const app = getApp()
    wx.setNavigationBarTitle({
      title: app.globalData.role === 'coach' ? '排课' : '约课'
    })
    this.initDates()
    this.refresh()
  },

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
    const app = getApp()
    const user = app.globalData.session.user
    const primary = bindingApi.getActivePrimaryCoach(app, user.userId)
    if (!primary) {
      this.setData({
        hasBinding: false,
        coachName: '',
        coachId: '',
        daySlots: [],
        myBookings: []
      })
      return
    }
    this.setData({
      hasBinding: true,
      coachName: primary.coachName,
      coachId: primary.coachId
    })

    bookingApi
      .getSlots(app, {
        coachId: primary.coachId,
        fromDate: this.data.selectedDate,
        toDate: this.data.selectedDate
      })
      .then((res) => {
        this.setData({ daySlots: res.data.slots || [] })
      })

    bookingApi
      .listBookings(app, { studentId: user.userId })
      .then((res) => {
        const myBookings = (res.data || []).map((b) =>
          Object.assign({}, b, { statusLabel: bookingApi.statusLabel(b.status) })
        )
        this.setData({ myBookings })
      })
  },

  refreshCoach() {
    const app = getApp()
    const coachId =
      (app.globalData.session.user.coachProfile &&
        app.globalData.session.user.coachProfile.coachId) ||
      'coach_001'

    Promise.all([
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
      this.buildWeekSummary(coachId)
    })
  },

  buildWeekSummary(coachId) {
    const app = getApp()
    const start = this.data.selectedDate
    // 以选中日所在周：简化为选中日起 7 天
    const keys = time.listDateKeys(start, 7)
    Promise.all(
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
    ).then((weekSummary) => this.setData({ weekSummary }))
  },

  onPickDate(e) {
    const key = e.currentTarget.dataset.key
    const lab = time.formatDateLabel(key)
    this.setData({
      selectedDate: key,
      monthTitle: lab.year + ' 年 ' + lab.month + ' 月'
    })
    this.refresh()
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
    if (this.data.submitting) return
    const app = getApp()
    const startAt = Number(e.currentTarget.dataset.start)
    const courseTypeId = e.currentTarget.dataset.course
    const name = e.currentTarget.dataset.name
    const label = e.currentTarget.dataset.label
    const dateKey = this.data.selectedDate

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
        if (!res.confirm) return
        this.submitBooking(startAt, courseTypeId)
      }
    })
  },

  submitBooking(startAt, courseTypeId) {
    const app = getApp()
    const user = app.globalData.session.user
    this.setData({ submitting: true })
    const idem = 'book_' + user.userId + '_' + startAt + '_' + courseTypeId

    bookingApi
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
        this.setData({ submitting: false })
        wx.showModal({
          title: '已提交，等待教练确认',
          content:
            '状态：pending\n' +
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
        this.setData({ submitting: false })
        const msg = (err && err.message) || '预约失败'
        if (err && err.code === 'SLOT_CONFLICT') {
          wx.showModal({
            title: '时段冲突',
            content: msg + '，已刷新可约时段。',
            showCancel: false,
            success: () => this.refresh()
          })
          return
        }
        app.toast(msg)
        this.refresh()
      })
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
