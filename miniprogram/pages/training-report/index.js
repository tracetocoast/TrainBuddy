const api=require('../../services/trainingApi');
const {requireLogin}=require('../../utils/guard');
const {syncRoleBar}=require('../../utils/role');
const {report}=require('../../utils/trainingReport');
Page({
 data:{visualTheme:'fieldNotes',loading:true,error:'',report:null,showSets:false},
 onLoad(q){this.sessionId=q&&q.id},
 onShow(){if(requireLogin(this)){syncRoleBar(this);this.reload()}},
 onHide(){this.seq=(this.seq||0)+1;this.setData({report:null})},
 onUnload(){this.seq=(this.seq||0)+1},
 async reload(){
  const seq=this.seq=(this.seq||0)+1,app=getApp(),owner=app.globalData.session.user.userId;
  this.setData({loading:true,error:'',report:null});
  if(!this.sessionId){this.setData({loading:false,error:'记录不存在或无法访问'});return}
  const current=()=>this.seq===seq&&app.globalData.session&&app.globalData.session.user.userId===owner;
  try{const res=await api.getSession(app,this.sessionId);if(current())this.setData({report:report(res.data,owner),loading:false})}
  catch(e){if(current())this.setData({loading:false,error:e.message||'记录不存在或无法访问'})}
 },
 onToggleSets(){this.setData({showSets:!this.data.showSets})},
 goHistory(){wx.redirectTo({url:'/pages/workout/index?history=1'})}
});
