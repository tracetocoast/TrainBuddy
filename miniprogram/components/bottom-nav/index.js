const icons = require('../../assets/navigation-icons')
const NAV = {
  student: [
    { key: 'home', path: '/pages/home/index', icon: '⌂', text: '今天' },
    { key: 'coach', path: '/pages/coach/index', text: '教练' },
    { key: 'workout', path: '/pages/workout/index', icon: '↗', text: '训练' },
    { key: 'ai', path: '/pages/ai/index', icon: '✦', text: 'AI助手' },
    { key: 'growth', path: '/pages/growth/index', icon: '✳', text: '成长' }
  ],
  coach: [
    { key: 'home', path: '/pages/home/index', icon: '⌂', text: '工作台' },
    { key: 'booking', path: '/pages/booking/index', icon: '▦', text: '排课' },
    { key: 'record', path: '/pages/record/index', icon: '✎', text: '记录' },
    { key: 'students', path: '/pages/students/index', icon: '♙', text: '学员' },
    { key: 'ai', path: '/pages/ai/index', icon: '✦', text: 'AI工具' }
  ]
}

Component({
  properties: {
    active: {
      type: String,
      value: 'home'
    }
  },

  data: {
    icons,
    activeIcons: icons.active,
    items: NAV.student
  },

  lifetimes: {
    attached() {
      this.refresh()
    }
  },

  pageLifetimes: {
    show() {
      this.refresh()
    }
  },

  methods: {
    refresh() {
      const app = getApp()
      const role = (app && app.globalData && app.globalData.role) || 'student'
      this.setData({ items: NAV[role] || NAV.student })
    },

    onSwitch(e) {
      const path = e.currentTarget.dataset.path
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      const currentPath = '/' + (current ? current.route : '')
      if (currentPath === path) return
      wx.redirectTo({ url: path })
    }
  }
})
