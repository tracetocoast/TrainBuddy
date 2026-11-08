const { requireLogin } = require('../../utils/guard')
const trainingApi = require('../../services/trainingApi')
Page({
  data: { creating:false, error:'' },
  onShow() { requireLogin(this) },
  onUnload() { this._unloaded=true },
  onTemplates() { if(!this.data.creating) wx.navigateTo({url:'/pages/plans/index'}) },
  onCustom() { wx.navigateTo({url:'/pages/workout/index?new=1'}) }
})
