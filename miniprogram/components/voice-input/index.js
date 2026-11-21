const ACTIVE = ['recording','paused','interrupted']
Component({
  properties: {
    text:String, label:String, placeholder:String, variant:String,
    state:{type:String,value:'idle'}, seconds:{type:Number,value:0},
    canPause:Boolean, micDenied:Boolean, disabled:Boolean, busy:Boolean,
    reduced:Boolean, mock:Boolean, showParse:Boolean
  },
  data:{
    time:'00:00', active:false, waiting:false, status:'点击开始录音',
    waveHeights: [20, 32, 61, 35, 46, 82, 53, 40, 65, 99, 78, 35, 54, 69, 113, 70, 49, 84, 101, 55, 30, 50, 79, 89, 54, 33, 65, 38, 26, 16]
  },
  observers:{
    'state, seconds, busy':function(state,seconds,busy) {
      const labels={requesting:'正在启动录音',recording:'正在录音',paused:'已暂停',interrupted:'录音已中断',stopping:'正在结束录音',processing:'正在上传并识别',reviewing:'录入已结束，请核对内容',error:'录入未完成，可重试或手填'}
      this.setData({active:ACTIVE.includes(state),waiting:['requesting','stopping','processing'].includes(state)||busy,status:busy&&!ACTIVE.includes(state)?'正在整理内容':labels[state]||'点击开始录音',time:String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')})
    }
  },
  methods:{
    onVoiceTab() { this.setData({ showText: false }) },
    onManualTab() { this.setData({ showText: true }) },
    onTextToggle() { this.setData({showText: !this.data.showText}) },
    onText(e) { this.triggerEvent('textinput',{value:e.detail.value}) },
    onStart() { if(this.data.active||this.data.waiting||this.properties.disabled||this.properties.micDenied)return;this.triggerEvent('toggle') },
    onStop() { if(!this.data.active||this.data.waiting)return;this.triggerEvent('stop') },
    onPause() { if(!this.data.active||this.data.waiting||!this.properties.canPause)return;this.triggerEvent('pause') },
    onAuthorize() { this.triggerEvent('authorize') },
    onParse() { if(this.properties.disabled||this.data.active||this.data.waiting)return;this.triggerEvent('parse') }
  }
})
