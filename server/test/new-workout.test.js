const {test}=require('node:test'),assert=require('node:assert/strict')
const training=require('../src/services/trainingService')
test('free session resumes unfinished work, adds/removes groups and persists group types',async()=>{
 const app={globalData:{},persist(){}}
 const first=(await training.createFreeSession(app,'u')).data
 assert.equal(first.exercises.length,0);assert.equal(first.source_type,'manual')
 assert.equal((await training.createFreeSession(app,'u')).data.session_id,first.session_id)
 const added=(await training.addExercise(app,first.session_id,{exerciseId:'bench',sets:3,reps:8,weight:20})).data
 const ex=added.exercises[0]
 const four=(await training.changeSessionSet(app,first.session_id,ex.id)).data
 assert.equal(four.exercises[0].sets.length,4)
 const sid=four.exercises[0].sets[0].id
 await training.updateActualSet(app,first.session_id,sid,{setType:'warmup'})
 assert.equal((await training.getSession(app,first.session_id)).data.exercises[0].sets[0].setType,'warmup')
 assert.throws(()=>training.updateActualSet(app,first.session_id,sid,{setType:'invalid'}))
 const three=(await training.changeSessionSet(app,first.session_id,ex.id,sid)).data
 assert.equal(three.exercises[0].sets.length,3)
 assert.deepEqual(three.exercises[0].sets.map(s=>s.setNo),[1,2,3])
 app.globalData.training.sessions[0].status='completed'
 assert.throws(()=>training.changeSessionSet(app,first.session_id,ex.id))
 assert.notEqual((await training.createFreeSession(app,'u')).data.session_id,first.session_id)
})
test('new workout custom entry directly opens blank execution route',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');let page,url
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/new-workout/index.js'),'utf8'),{Page:p=>page=p,require:()=>({}),wx:{navigateTo:opts=>url=opts.url}})
 page.onCustom();assert.equal(url,'/pages/workout/index?new=1')
})
const { createTestApp } = require('./helpers')
test('HTTP free training, group mutation, type persistence and unauthenticated denial',async()=>{
 const ctx=createTestApp()
 try{
  const login=await ctx.login('student_only'),token=login.sessionToken
  const created=await ctx.request('POST','/api/v1/sessions',{token,body:{source_type:'manual'},headers:{'Idempotency-Key':'free-test'}})
  assert.equal(created.status,200)
  const id=created.body.data.session_id
  const add=await ctx.request('POST','/api/v1/sessions/'+id+'/exercises',{token,body:{exerciseId:'bench',sets:3,reps:8,weight:20}})
  assert.equal(add.status,200)
  const ex=add.body.data.exercises[0],url='/api/v1/sessions/'+id+'/exercises/'+ex.id+'/sets'
  const group=await ctx.request('POST',url,{token,body:{},headers:{'Idempotency-Key':'group-test'}})
  assert.equal(group.status,200);assert.equal(group.body.data.exercises[0].sets.length,4)
  const duplicate=await ctx.request('POST',url,{token,body:{},headers:{'Idempotency-Key':'group-test'}})
  assert.equal(duplicate.body.data.exercises[0].sets.length,4)
  const set=group.body.data.exercises[0].sets[0]
  const patched=await ctx.request('PATCH','/api/v1/sessions/'+id+'/sets/'+set.id,{token,body:{setType:'warmup',state:'done'}})
  assert.equal(patched.status,200);assert.equal(patched.body.data.exercises[0].sets[0].setType,'warmup')
  const unauthorized=await ctx.request('POST',url,{body:{}});assert.equal(unauthorized.status,401)
 }finally{await ctx.cleanup()}
})
test('four inline groups save individually, keep the last row visible and allow reopening', async () => {
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');let page,release
 const app={globalData:{role:'student',session:{user:{userId:'student'}},drafts:{}},persist(){},toast(){}}
 const saved={session_id:'w',exercises:[{id:'ex',name:'卧推',sets:[1,2,3,4].map(n=>({id:'s'+n,setNo:n,actualWeight:7.5,actualReps:5,state:'pending'}))}]}
 const clone=v=>JSON.parse(JSON.stringify(v))
 const api={updateActualSet:(_app,_id,id,patch)=>new Promise((resolve,reject)=>{release=(ok=true)=>{if(!ok){reject(new Error('断网'));return} Object.assign(saved.exercises[0].sets.find(s=>s.id===id),patch);resolve({data:clone(saved)})}})}
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/workout/index.js'),'utf8'),{Page:p=>page=p,require:id=>id.endsWith('/interaction')?require('../../miniprogram/utils/interaction'):id.endsWith('/trainingApi')?api:{},wx:{},getApp:()=>app,clearInterval})
 page.setData=patch=>Object.assign(page.data,patch)
 page.setData({session:clone(saved),lockedExerciseId:'ex',phase:'locked',activeSid:'s1',reduced:true})
 const event=(sid,extra,value)=>({currentTarget:{dataset:{sid,...extra}},detail:{value}})
 page.onSetField(event('s2',{field:'actualWeight'},'8.25'))
 page.onSetField(event('s2',{field:'actualReps'},'9'))
 let write=page.onSetState(event('s2',{state:'done'}));release(false);await write
 assert.equal(page.data.session.exercises[0].sets[1].state,'pending');assert.equal(page.data.pending.s2.actualWeight,'8.25')
 for(const id of ['s1','s2','s3','s4']){
  write=page.onSetState(event(id,{state:'done'}));assert.equal(page.data.session.exercises[0].sets.find(s=>s.id===id).state,'pending');release();await write
 }
 assert.equal(saved.exercises[0].sets[1].actualWeight,8.25);assert.equal(saved.exercises[0].sets[1].actualReps,9)
 assert.equal(page.data.phase,'locked');assert.equal(page.data.focusView.exerciseComplete,true)
 write=page.onSetState(event('s2',{state:'pending'}));release();await write
 assert.equal(page.data.focusView.exerciseComplete,false);assert.equal(saved.exercises[0].sets[1].state,'pending')
 page.onOpenSetEditor(event('s2',{}));assert.equal(page.data.setEditor.kind,'working');page.onCloseSetEditor();assert.equal(page.data.setEditor,null)
})
