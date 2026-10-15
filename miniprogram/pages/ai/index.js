const { syncRoleBar, setRole } = require('../../utils/role')

Page({
  data: {
    role: 'student'
  },

  onShow() {
    syncRoleBar(this)
    wx.setNavigationBarTitle({
      title: getApp().globalData.role === 'coach' ? 'AI工具' : 'AI体态'
    })
  },

  onRole(e) {
    setRole(this, e.currentTarget.dataset.role)
  },

  onFront() {
    wx.showModal({
      title: '拍摄正面照片',
      content: '请自然站立，穿着便于观察轮廓的运动服，完整拍摄全身。光线均匀，完整入镜。',
      confirmText: '模拟拍摄',
      success(res) {
        if (res.confirm) getApp().toast('操作已完成')
      }
    })
  },

  onSide() {
    wx.showModal({
      title: '拍摄侧面照片',
      content: '侧身自然站立，双脚与髋同宽，避免刻意挺胸或收腹。全身入镜，背景简洁。',
      confirmText: '模拟拍摄',
      success(res) {
        if (res.confirm) getApp().toast('操作已完成')
      }
    })
  },

  onScan() {
    const app = getApp()
    app.toast('正在扫描姿态特征…')
    setTimeout(() => {
      wx.showModal({
        title: '分析已完成 · 示例报告',
        content: '参考分 82/100，建议关注 3 项。结果仅用于演示交互，请由教练结合动作表现复核。',
        confirmText: '查看建议',
        showCancel: false
      })
    }, 800)
  },

  onReport() {
    getApp().toast('已打开示例阶段报告')
  }
})
