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
test('set editor opens correct field, retains raw decimal input and closes without completing a set',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');let page,hidden=false
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/workout/index.js'),'utf8'),{Page:p=>page=p,require:()=>({}),wx:{hideKeyboard(){hidden=true}},getApp:()=>({})})
 page.data=JSON.parse(JSON.stringify(page.data));page.setData=patch=>Object.assign(page.data,patch)
 page.data.session={exercises:[{id:'ex',sets:[{id:'s',setNo:2,actualWeight:7.5,state:'pending'}]}]};page.data.lockedExerciseId='ex'
 let input;page.onSetField=e=>input=e
 page.onOpenSetEditor({currentTarget:{dataset:{sid:'s',field:'actualWeight'}}})
 assert.equal(page.data.setEditor.value,'7.5');assert.equal(page.data.setEditor.no,2)
 page.onEditorInput({detail:{value:'8.'}});assert.equal(input.detail.value,'8.');assert.equal(page.data.setEditor.value,'8.')
 page.onCloseSetEditor();assert.equal(page.data.setEditor,null);assert.equal(hidden,true);assert.equal(page.data.session.exercises[0].sets[0].state,'pending')
})
