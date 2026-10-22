const friendApi = require('../../services/friendApi')

Component({
  data: { friends: [], count: 0, loading: true, error: '' },
  lifetimes: { attached() { this.refresh() }, detached() { this.sequence = (this.sequence || 0) + 1 } },
  pageLifetimes: { show() { this.refresh() }, hide() { this.sequence = (this.sequence || 0) + 1 } },
  methods: {
    async refresh() {
      const app = getApp(), owner = app.globalData.session && app.globalData.session.user.userId
      if (!owner) return
      const sequence = this.sequence = (this.sequence || 0) + 1
      this.setData({ loading: true, error: '', friends: [], count: 0 })
      try {
        const result = await friendApi.list()
        if (sequence !== this.sequence || !app.globalData.session || app.globalData.session.user.userId !== owner) return
        const rows = result.data || []
        this.setData({ loading: false, count: rows.length, friends: rows.slice(0, 3).map(row => Object.assign({}, row, { initial: (row.name || '友').slice(0, 1) })) })
      } catch (err) { if (sequence === this.sequence) this.setData({ loading: false, error: '朋友动态暂未加载' }) }
    },
    goFriends(e) { const id = e.currentTarget.dataset.id; wx.navigateTo({ url: '/pages/friends/index' + (id ? '?id=' + encodeURIComponent(id) : '') }) }
  }
})
