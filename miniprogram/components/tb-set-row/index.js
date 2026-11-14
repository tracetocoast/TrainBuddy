Component({
  properties:{set:{type:Object,value:{}},disabled:{type:Boolean,value:false},pending:{type:Boolean,value:false},weightHint:{type:String,value:''},showHint:{type:Boolean,value:false},saveState:{type:String,value:''}},
  methods:{
    onTypeTap(){if(this.properties.disabled||this.properties.pending)return;const s=this.properties.set;this.triggerEvent('typechange',{setId:s.id,setType:s.setType==='warmup'?'working':'warmup'})},
    onInput(e){this.triggerEvent('input',{setId:this.properties.set.id,field:e.currentTarget.dataset.field,value:e.detail.value})},
    onCommit(e){this.triggerEvent('commit',{setId:this.properties.set.id,field:e.currentTarget.dataset.field,value:e.detail.value})},
    onComplete(){if(this.properties.disabled||this.properties.pending)return;const s=this.properties.set;this.triggerEvent('complete',{setId:s.id,nextState:s.state==='done'?'pending':'done'})}
  }
})