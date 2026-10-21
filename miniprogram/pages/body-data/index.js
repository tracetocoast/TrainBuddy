const { requireLogin } = require('../../utils/guard')
const bodyApi = require('../../services/bodyMeasurementApi')
const time = require('../../utils/time')
const illustration = require('../../assets/body-map')
const groups = [
  { label: '脖围', side: 'left', top: 74, reach: 132, keys: ['neck'] },
  { label: '肩宽', side: 'right', top: 104, reach: 102, keys: ['shoulderWidth'] },
  { label: '胸围', side: 'right', top: 230, reach: 140, keys: ['chest'] },
  { label: '臂围', side: 'left', top: 224, reach: 88, keys: ['upperArmLeft', 'upperArmRight'] },
  { label: '小臂', side: 'left', top: 368, reach: 88, keys: ['forearmLeft', 'forearmRight'] },
  { label: '腰围', side: 'right', top: 390, reach: 102, keys: ['waist'] },
  { label: '臀围', side: 'left', top: 490, reach: 98, keys: ['hip'] },
  { label: '腿围', side: 'right', top: 575, reach: 120, keys: ['thighLeft', 'thighRight'] },
  { label: '小腿', side: 'left', top: 792, reach: 124, keys: ['calfLeft', 'calfRight'] }
]

Page({
  data: { loading: true, error: '', illustration, parts: [], summaries: [], activeTab: 'data', unit: 'kg', tabs: [{key:'data',label:'数据'},{key:'chart',label:'图表'},{key:'calendar',label:'日历'}], metricNames: bodyApi.METRICS.map(item=>item.label), metricIndex: 0, chart: bodyApi.trend([], 'weight'), range: '90', ranges: [{key:'30',label:'30天'},{key:'90',label:'90天'},{key:'all',label:'全部'}], month: '', selectedDate: '', days: [], dayRows: [], weekdays: ['一','二','三','四','五','六','日'] },
  onShow() {
    if (!requireLogin(this)) return
    if (!this.data.month) this.setData({ month: time.todayKey().slice(0,7), selectedDate: time.todayKey() })
    this.reload()
  },
  reload() {
    const owner = getApp().globalData.session.user.userId
    this.rows = []
    this.setData({ loading: true, error: '', parts: [], summaries: [] })
    return bodyApi.list().then(res => {
      const session = getApp().globalData.session
      if (!session || session.user.userId !== owner) return
      this.rows = res.data || []; this.render()
    }).catch(err => this.setData({ error: err.message || '读取失败，请重试' }))
      .then(() => this.setData({ loading: false }))
  },
  render() {
    const rows = this.rows || [], unit = this.data.unit
    const latest = key => {
      const metric = bodyApi.METRICS.find(item=>item.key === key)
      const chart = bodyApi.trend(rows,key)
      const factor = metric.unit === 'kg' && unit === 'jin' ? 2 : 1
      return { key, value: chart.count ? Number((Number(chart.latest)*factor).toFixed(2)) : '—', unit: metric.unit === 'kg' ? (unit === 'jin' ? '斤' : '公斤') : metric.unit, date: chart.latestDate, time: chart.latestTime }
    }
    this.setData({
      summaries: [{key:'weight',label:'当前体重'}, {key:'targetWeight',label:'目标体重'}, {key:'bodyFat',label:'体脂率'}].map(item=>Object.assign({},item,latest(item.key))),
      parts: groups.map(group=>Object.assign({},group,{ entries: group.keys.map((key,index)=>Object.assign(latest(key),{sideLabel:group.keys.length>1?(index===0?'左':'右'):''})) }))
    })
    this.renderChart(); this.renderCalendar()
  },
  onUnit(e) { this.setData({unit:e.currentTarget.dataset.unit}); this.render() },
  onTab(e) { this.setData({activeTab:e.currentTarget.dataset.tab}) },
  onChartMetric(e) { this.setData({metricIndex:Number(e.detail.value)}); this.renderChart() },
  onRange(e) { this.setData({range:e.currentTarget.dataset.range}); this.renderChart() },
  renderChart() {
    const metric = bodyApi.METRICS[this.data.metricIndex]
    const from = this.data.range === 'all' ? '' : time.addDays(time.todayKey(),1-Number(this.data.range))
    let rows = this.rows || []
    const convert = metric.unit==='kg' && this.data.unit==='jin'
    if (convert) rows=rows.map(row=>Object.assign({},row,{ values:Object.assign({},row.values,{[metric.key]:row.values[metric.key]==null?null:row.values[metric.key]*2}) }))
    const chart=bodyApi.trend(rows,metric.key,from)
    chart.metric=Object.assign({},metric,{unit:metric.unit==='kg'?(convert?'斤':'公斤'):metric.unit})
    if(metric.unit==='kg') chart.deltaText=chart.deltaText.replace(' kg',' '+chart.metric.unit)
    this.setData({chart})
  },
  onMonth(e) { this.setData({month:e.detail.value.slice(0,7),selectedDate:e.detail.value.slice(0,7)+'-01'}); this.renderCalendar() },
  onDay(e) { this.setData({selectedDate:e.currentTarget.dataset.date}); this.renderCalendar() },
  renderCalendar() {
    const month=this.data.month, first=month+'-01', p=time.parseDateKey(first)
    if(!p) return
    const weekday=time.toShanghaiParts(time.shanghaiLocalToMs(first,'12:00')).weekday
    const days=[]; for(let i=0;i<(weekday===0?6:weekday-1);i++) days.push({key:'pad'+i,empty:true})
    const count=new Date(Date.UTC(p.y,p.m,0)).getUTCDate()
    const rows=this.rows || []
    for(let day=1;day<=count;day++) {const date=month+'-'+String(day).padStart(2,'0');days.push({key:date,date,day,selected:date===this.data.selectedDate,hasData:rows.some(row=>row.date===date)})}
    this.setData({days,dayRows:rows.filter(row=>row.date===this.data.selectedDate).slice().reverse().map(row=>({id:row.id||row.date,time:row.time||'时间未记录',text:bodyApi.METRICS.filter(metric=>row.values[metric.key]!=null).map(metric=>metric.label+' '+Number((row.values[metric.key]*(metric.unit==='kg'&&this.data.unit==='jin'?2:1)).toFixed(2))+(metric.unit==='kg'?(this.data.unit==='jin'?'斤':'公斤'):metric.unit)).join(' · ')}))})
  },
  onMetric(e) { wx.navigateTo({url:'/pages/body-record/index?key='+e.currentTarget.dataset.key+'&unit='+this.data.unit}) },
  onHistory() { wx.navigateTo({url:'/pages/body-history/index'}) }
})
