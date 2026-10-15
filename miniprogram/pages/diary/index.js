const { requireLogin } = require('../../utils/guard')
const diaryApi = require('../../services/diaryApi')
const time = require('../../utils/time')

const MEAL_LABEL = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐'
}

Page({
  data: {
    dateList: [],
    localDate: '',
    view: {
      sessions: [],
      meals: [],
      shares: {},
      waterTotalMl: 0,
      restDay: false,
      canEdit: true
    },
    mealTypes: diaryApi.MEAL_TYPES,
    specialTypes: diaryApi.SPECIAL_TYPES,
    mealType: 'lunch',
    mealText: '',
    waterMl: '250',
    sleepHours: '',
    fatigue: '',
    soreness: '',
    specialType: '',
    specialNote: ''
  },

  onShow() {
    if (!requireLogin(this)) return
    const today = time.todayKey()
    const keys = []
    for (let i = -6; i <= 0; i++) keys.push(time.addDays(today, i))
    this.setData({
      dateList: keys.map((k) => time.formatDateLabel(k)),
      localDate: this.data.localDate || today
    })
    this.reload()
  },

  studentId() {
    return getApp().globalData.session.user.userId
  },

  reload() {
    const app = getApp()
    diaryApi.getDailyView(app, this.studentId(), this.data.localDate).then((res) => {
      const view = res.data
      view.meals = (view.meals || []).map((m) =>
        Object.assign({}, m, { mealTypeLabel: MEAL_LABEL[m.mealType] || m.mealType })
      )
      const body = view.bodyState || {}
      this.setData({
        view,
        sleepHours: body.sleepHours != null ? String(body.sleepHours) : '',
        fatigue: body.fatigue != null ? String(body.fatigue) : '',
        soreness: body.soreness || '',
        specialType: body.specialType || '',
        specialNote: body.specialNote || ''
      })
    })
  },

  onPickDate(e) {
    this.setData({ localDate: e.currentTarget.dataset.key })
    this.reload()
  },

  onToggleRest() {
    const app = getApp()
    const rest = !(this.data.view && this.data.view.restDay)
    diaryApi
      .setRestDay(app, this.studentId(), this.data.localDate, rest)
      .then((res) => {
        this.applyView(res.data)
        app.toast(rest ? '已记为休息日' : '已取消休息标记')
      })
      .catch((err) => app.toast((err && err.message) || '失败'))
  },

  applyView(view) {
    view.meals = (view.meals || []).map((m) =>
      Object.assign({}, m, { mealTypeLabel: MEAL_LABEL[m.mealType] || m.mealType })
    )
    this.setData({ view })
  },

  onMealType(e) {
    this.setData({ mealType: e.currentTarget.dataset.k })
  },
  onMealText(e) {
    this.setData({ mealText: e.detail.value })
  },
  onAddMeal() {
    const app = getApp()
    const text = (this.data.mealText || '').trim()
    if (!text) {
      app.toast('请填写食物')
      return
    }
    diaryApi
      .addMeal(app, {
        studentId: this.studentId(),
        localDate: this.data.localDate,
        mealType: this.data.mealType,
        foodText: text
      })
      .then(() => {
        this.setData({ mealText: '' })
        this.reload()
      })
      .catch((err) => app.toast((err && err.message) || '失败'))
  },
  onDelMeal(e) {
    const app = getApp()
    diaryApi.deleteMeal(app, e.currentTarget.dataset.id, this.studentId()).then(() => this.reload())
  },

  onWaterInput(e) {
    this.setData({ waterMl: e.detail.value })
  },
  onAddWater() {
    const app = getApp()
    diaryApi
      .addWater(app, this.studentId(), this.data.localDate, this.data.waterMl)
      .then((res) => this.applyView(res.data))
      .catch((err) => app.toast((err && err.message) || '失败'))
  },

  onSleep(e) {
    this.setData({ sleepHours: e.detail.value })
  },
  onFatigue(e) {
    this.setData({ fatigue: e.detail.value })
  },
  onSoreness(e) {
    this.setData({ soreness: e.detail.value })
  },
  onSaveBody() {
    const app = getApp()
    diaryApi
      .upsertBodyState(app, this.studentId(), this.data.localDate, {
        sleepHours: this.data.sleepHours === '' ? null : parseFloat(this.data.sleepHours),
        fatigue: this.data.fatigue === '' ? null : parseInt(this.data.fatigue, 10),
        soreness: this.data.soreness
      })
      .then((res) => {
        this.applyView(res.data)
        app.toast('状态已保存')
      })
      .catch((err) => app.toast((err && err.message) || '失败'))
  },

  onSpecialType(e) {
    this.setData({ specialType: e.currentTarget.dataset.k })
  },
  onSpecialNote(e) {
    this.setData({ specialNote: e.detail.value })
  },
  onSaveSpecial() {
    const app = getApp()
    diaryApi
      .upsertBodyState(app, this.studentId(), this.data.localDate, {
        specialType: this.data.specialType,
        specialNote: this.data.specialNote
      })
      .then((res) => {
        this.applyView(res.data)
        app.toast('特殊情况已保存（默认私密）')
      })
      .catch((err) => app.toast((err && err.message) || '失败'))
  },

  onShare(e) {
    const app = getApp()
    const cat = e.currentTarget.dataset.cat
    diaryApi
      .shareDayCategory(app, this.studentId(), this.data.localDate, cat)
      .then((res) => {
        this.applyView(res.data)
        app.toast(res.hint || '已共享给教练（仅该日该类）')
      })
      .catch((err) => app.toast((err && err.message) || '共享失败'))
  },

  onRevoke(e) {
    const app = getApp()
    const cat = e.currentTarget.dataset.cat
    diaryApi
      .revokeDayCategory(app, this.studentId(), this.data.localDate, cat)
      .then((res) => {
        this.applyView(res.data)
        app.toast('已撤回共享')
      })
  }
})
