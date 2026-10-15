const { studentList } = require('../../utils/mock')
const { syncRoleBar, setRole } = require('../../utils/role')

function withAvatar(list) {
  return list.map((item) => ({
    ...item,
    avatar: item.name[0]
  }))
}

Page({
  data: {
    role: 'coach',
    keyword: '',
    all: withAvatar(studentList),
    filtered: withAvatar(studentList)
  },

  onShow() {
    syncRoleBar(this)
  },

  onRole(e) {
    setRole(this, e.currentTarget.dataset.role)
  },

  onSearch(e) {
    const keyword = e.detail.value || ''
    const filtered = this.data.all.filter((item) => {
      if (!keyword) return true
      return (item.name + item.desc).indexOf(keyword) !== -1
    })
    this.setData({ keyword, filtered })
  },

  onContact() {
    getApp().toast('已发送模拟消息')
  }
})
