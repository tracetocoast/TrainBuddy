const { syncRoleBar, setRole } = require('../../utils/role')

Component({
  properties: {},

  data: {
    role: 'student',
    roleOptions: [],
    canSwitchCoach: false
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
      const page = {
        setData: (data) => this.setData(data),
        route: ''
      }
      syncRoleBar(page)
    },

    onTap(e) {
      const role = e.currentTarget.dataset.role
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current) {
        setRole(current, role)
      }
      this.refresh()
    }
  }
})
