const api = require('../../services/trainingApi')
const { history, splitHistory } = require('../../utils/trainingReport')

let pending = null

function loadItems(app, owner) {
  if (pending && pending.owner === owner) return pending.promise
  const promise = api
    .listSessions(app, { studentId: owner, status: ['completed'] })
    .then((res) => history(res.data, owner))
  pending = { owner, promise }
  promise.finally(() => {
    if (pending && pending.promise === promise) pending = null
  })
  return promise
}

Component({
  properties: {
    section: { type: String, value: 'all' }
  },
  data: {
    loading: true,
    error: '',
    all: [],
    items: [],
    visible: [],
    latest: null,
    expanded: false,
    hiddenCount: 0,
    canToggle: false
  },
  pageLifetimes: {
    show() {
      this.reload()
    },
    hide() {
      this.seq = (this.seq || 0) + 1
      this.setData({ all: [], items: [], visible: [], latest: null, hiddenCount: 0, canToggle: false })
    }
  },
  lifetimes: {
    attached() {
      this.reload()
    },
    detached() {
      this.seq = (this.seq || 0) + 1
    }
  },
  methods: {
    async reload() {
      const app = getApp()
      const user = app.globalData.session && app.globalData.session.user
      const seq = (this.seq = (this.seq || 0) + 1)
      this.setData({
        all: [],
        items: [],
        visible: [],
        latest: null,
        hiddenCount: 0,
        canToggle: false,
        error: '',
        loading: true
      })
      if (!user) {
        this.setData({ loading: false })
        return
      }
      const owner = user.userId
      const current = () =>
        seq === this.seq && app.globalData.session && app.globalData.session.user.userId === owner
      try {
        const items = await loadItems(app, owner)
        if (!current()) return
        this.setData(Object.assign({ loading: false, error: '' }, splitHistory(items, this.data.expanded)))
      } catch (e) {
        if (current()) this.setData({ loading: false, error: e.message || '训练历史读取失败' })
      }
    },
    onToggle() {
      const expanded = !this.data.expanded
      this.setData(Object.assign({ expanded }, splitHistory(this.data.all, expanded)))
    },
    open(e) {
      wx.navigateTo({ url: '/pages/training-report/index?id=' + encodeURIComponent(e.currentTarget.dataset.id) })
    }
  }
})
