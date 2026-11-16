Component({
  properties:{options:{type:Array,value:[]},value:{type:String,value:''},label:{type:String,value:'选项'},reduced:{type:Boolean,value:false},disabled:{type:Boolean,value:false}},
  data:{activeIndex:0,gliderWidth:100},
  observers:{'options,value':function(options,value){const list=Array.isArray(options)?options:[];const i=list.findIndex(x=>x&&x.value===value);this.setData({activeIndex:Math.max(0,i),gliderWidth:100/Math.max(1,list.length)})}},
  methods:{onSelect(e){if(this.properties.disabled)return;const i=Number(e.currentTarget.dataset.i),item=this.properties.options[i];if(item&&item.value!==this.properties.value)this.triggerEvent('change',{value:item.value,index:i})}}
})