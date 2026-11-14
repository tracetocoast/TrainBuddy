const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
const {report,history,splitHistory}=require('../../miniprogram/utils/trainingReport');
const make=(id='a')=>({session_id:id,student_id:'s',source_type:'coach_post_session',status:'completed',shared_at:1,business_date:'2026-11-09',public_note:'公开',private_note:'secret',exercises:[{id:'e',name:'动作',sets:[{id:'1',actualWeight:null,actualReps:5,state:'pending'},{id:'2',actualWeight:0,actualReps:0,state:'done'},{id:'3',actualWeight:45,actualReps:6,state:'skipped'}]}]});
test('report whitelist preserves null, zero, distinct group states and excludes private data',()=>{const r=report(make(),'s');assert.equal(r.exercises[0].sets[0].weight,'未记录');assert.equal(r.exercises[0].sets[1].weight,'0 kg');assert.equal(r.completedSets,1);assert.equal(r.exercises[0].sets[2].state,'未做');assert.ok(!JSON.stringify(r).includes('secret'));assert.ok(!('volumeKg' in r));});
test('unpublished, draft and other student reports fail closed',()=>{for(const patch of [{shared_at:null},{status:'draft'},{student_id:'other'}])assert.throws(()=>report({...make(),...patch},'s'));});
test('two sessions on one day stay distinct and duplicates are removed',()=>{const rows=history([make('b'),make('a'),make('a'),{...make('old'),business_date:'2026-11-08'}],'s');assert.equal(rows.length,3);assert.equal(rows[2].id,'old');assert.notEqual(rows[0].id,rows[1].id);});
test('late report response after account switch never renders private account data',async()=>{let p,resolve;const app={globalData:{session:{user:{userId:'s'}}}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/training-report/index.js'),'utf8'),{Page:x=>p=x,getApp:()=>app,wx:{},require:id=>id.includes('trainingApi')?{getSession:()=>new Promise(r=>resolve=r)}:id.includes('guard')?{requireLogin:()=>true}:{report}});p.data={};p.setData=v=>Object.assign(p.data,v);p.sessionId='a';const waiting=p.reload();app.globalData.session.user.userId='other';resolve({data:make()});await waiting;assert.equal(p.data.report,null);});
test('idle workout places latest report above plans and collapsible history below',()=>{
 const root=path.resolve(__dirname,'../../miniprogram')
 const wxml=fs.readFileSync(path.join(root,'pages/workout/index.wxml'),'utf8')
 const idle=wxml.split('<block wx:else>')[0]
 const latest=idle.indexOf('section="latest"')
 const plans=idle.indexOf('我的待练计划')
 const hist=idle.indexOf('section="history"')
 assert.ok(latest>0 && latest<plans && plans<hist)
 const histWxml=fs.readFileSync(path.join(root,'components/report-history/index.wxml'),'utf8')
 assert.match(histWxml,/canToggle/)
 assert.match(histWxml,/收起历史/)
})
test('history preview hides the featured coach report and collapses extra rows',()=>{
 const items=[
  {id:'coach',coachReport:true,title:'课后'},
  ...Array.from({length:6},(_,i)=>({id:'self'+i,coachReport:false,title:'自主'}))
 ]
 const collapsed=splitHistory(items,false)
 assert.equal(collapsed.latest.id,'coach')
 assert.equal(collapsed.visible.length,5)
 assert.equal(collapsed.items.length,6)
 assert.equal(collapsed.canToggle,true)
 assert.ok(!collapsed.visible.some((row)=>row.id==='coach'))
 const expanded=splitHistory(items,true)
 assert.equal(expanded.visible.length,6)
 assert.equal(expanded.hiddenCount,0)
 assert.equal(expanded.canToggle,true)
})
test('report history toggle expands from the same loaded list',()=>{
 let definition
 const items=[{id:'coach',coachReport:true},{id:'a',coachReport:false},{id:'b',coachReport:false},{id:'c',coachReport:false},{id:'d',coachReport:false},{id:'e',coachReport:false},{id:'f',coachReport:false}]
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/components/report-history/index.js'),'utf8'),{Component:(c)=>{definition=c},require:(id)=>id.includes('trainingApi')?{listSessions:()=>Promise.resolve({data:[]})}:{history:()=>items,splitHistory}})
 const c=Object.assign({data:Object.assign({},definition.data),properties:{section:'history'},setData(v){Object.assign(this.data,v)}},definition.methods)
 c.setData(Object.assign({expanded:false},splitHistory(items,false)))
 c.onToggle()
 assert.equal(c.data.expanded,true)
 assert.equal(c.data.visible.length,6)
 c.onToggle()
 assert.equal(c.data.expanded,false)
 assert.equal(c.data.visible.length,5)
})
