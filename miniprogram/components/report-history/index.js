const api=require('../../services/trainingApi');const {history}=require('../../utils/trainingReport');
Component({data:{loading:true,error:'',items:[],latest:null},pageLifetimes:{show(){this.reload()},hide(){this.seq=(this.seq||0)+1;this.setData({items:[],latest:null})}},lifetimes:{attached(){this.reload()},detached(){this.seq=(this.seq||0)+1}},methods:{
 async reload(){const app=getApp(),user=app.globalData.session&&app.globalData.session.user,seq=this.seq=(this.seq||0)+1;this.setData({items:[],latest:null,error:'',loading:true});if(!user){this.setData({loading:false});return}const owner=user.userId;const current=()=>seq===this.seq&&app.globalData.session&&app.globalData.session.user.userId===owner;
 try{const res=await api.listSessions(app,{studentId:owner,status:['completed']});if(!current())return;const items=history(res.data,owner);this.setData({items,latest:items.find(s=>s.coachReport)||null,loading:false})}catch(e){if(current())this.setData({loading:false,error:e.message||'训练历史读取失败'})}},
 open(e){wx.navigateTo({url:'/pages/training-report/index?id='+encodeURIComponent(e.currentTarget.dataset.id)})}
}});
