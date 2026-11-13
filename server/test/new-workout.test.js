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
test('training saves only the requested fields, keeps null distinct from zero, and requires undo before editing a completed set', async () => {
  const ctx = createTestApp()
  try {
    const { sessionToken: token } = await ctx.login('student_only')
    const create = await ctx.request('POST', '/api/v1/sessions', { token, body: { source_type: 'manual' } })
    const path = '/api/v1/sessions/' + create.body.data.session_id
    const add = { token, body: { exerciseId: 'bench', sets: 3, reps: 8, weight: null }, headers: { 'Idempotency-Key': 'training-action' } }
    const responses = await Promise.all([ctx.request('POST', path + '/exercises', add), ctx.request('POST', path + '/exercises', add)])
    for (const res of responses) {
      assert.equal(res.status, 200)
      assert.equal(res.body.data.exercises.length, 1)
    }
    const session = responses[0].body.data
    const group = session.exercises[0].sets[0]
    assert.equal(group.actualWeight, null)
    const update = body => ctx.request('PATCH', path + '/sets/' + group.id, { token, body })
    const saved = await update({ base_revision: session.revision, actualWeight: 0 })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.data.exercises[0].sets[0].actualReps, 8)
    assert.equal((await update({ base_revision: session.revision, actualReps: 9 })).status, 409)
    const complete = await update({ state: 'done' })
    assert.equal(complete.status, 200)
    assert.equal(complete.body.data.exercises[0].sets[0].actualWeight, 0)
    assert.notEqual((await update({ actualWeight: 55 })).status, 200)
    assert.equal((await update({ state: 'pending' })).status, 200)
    const cleared = await update({ actualWeight: null })
    assert.equal(cleared.body.data.exercises[0].sets[0].actualWeight, null)
    assert.equal((await update({ state: 'done' })).status, 422)
  } finally {
    await ctx.cleanup()
  }
})
test('starting a separate workout preserves old work and handles retries without duplicate drafts', async () => {
  const ctx = createTestApp()
  try {
    const { sessionToken: token } = await ctx.login('student_only')
    const url = '/api/v1/sessions'
    const old = await ctx.request('POST', url, { token, body: { source_type: 'manual' } })
    assert.equal(old.status, 200)
    const oldId = old.body.data.session_id
    const add = await ctx.request('POST', url + '/' + oldId + '/exercises', { token, body: { exerciseId: 'bench', sets: 3, reps: 8, weight: 20 } })
    assert.equal(add.status, 200)
    const body = { source_type: 'manual', start_new: true }
    assert.equal((await ctx.request('POST', url, { token, body })).status, 422)
    const request = { token, body, headers: { 'Idempotency-Key': 'new-draft' } }
    const [fresh, replay] = await Promise.all([ctx.request('POST', url, request), ctx.request('POST', url, request)])
    assert.equal(fresh.status, 200)
    assert.equal(replay.status, 200)
    assert.notEqual(fresh.body.data.session_id, oldId)
    assert.equal(replay.body.data.session_id, fresh.body.data.session_id)
    assert.deepEqual(fresh.body.data.exercises, [])
    const list = await ctx.request('GET', url + '?status=in_progress', { token })
    assert.equal(list.status, 200)
    assert.equal(list.body.data.filter(row => row.source_type === 'manual').length, 2)
    assert.equal(list.body.data.find(row => row.session_id === oldId).exercises[0].sets[0].actualWeight, 20)
  } finally {
    await ctx.cleanup()
  }
})
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
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../miniprogram/pages/workout/index.js'),'utf8'),{Page:p=>page=p,require:id=>id.endsWith('/interaction')?require('../../miniprogram/utils/interaction'):id.endsWith('/trainingApi')?api:{},wx:{},getApp:()=>app,setInterval:()=>1,clearInterval(){}})
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

test('manual workout leaves unknown weight blank and prefills only the owner’s completed sets', async () => {
  const app = { globalData: {}, persist() {} }
  const first = (await training.createFreeSession(app, 'owner')).data
  const added = (await training.addExercise(app, first.session_id, { exerciseId: 'bench', weight: null, useHistory: true })).data
  const exercise = added.exercises[0]
  assert.equal(exercise.sets[0].actualWeight, null)
  assert.equal(exercise.loadBasis, 'unknown')
  assert.throws(() => training.updateActualSet(app, first.session_id, exercise.sets[0].id, { state: 'done' }), /重量/)
  await training.updateActualSet(app, first.session_id, exercise.sets[0].id, { actualWeight: 30, actualReps: 8, setType: 'warmup', state: 'done' })
  await training.updateActualSet(app, first.session_id, exercise.sets[1].id, { actualWeight: 52.5, actualReps: 6, state: 'done' })
  app.globalData.training.sessions[0].status = 'completed'
  const next = (await training.createFreeSession(app, 'owner')).data
  const copied = (await training.addExercise(app, next.session_id, { exerciseId: 'bench', weight: null, useHistory: true })).data.exercises[0]
  assert.deepEqual(copied.sets.map(set => [set.actualWeight, set.actualReps, set.setType, set.state]), [[30,8,'warmup','pending'],[52.5,6,'working','pending']])
  const outsider = (await training.createFreeSession(app, 'other')).data
  const untouched = (await training.addExercise(app, outsider.session_id, { exerciseId: 'bench', weight: 0, useHistory: true })).data.exercises[0]
  assert.equal(untouched.referenceDate, undefined)
  assert.equal(untouched.sets[0].actualWeight, 0)
  const inherited = (await training.changeSessionSet(app, next.session_id, copied.id, undefined, 'warmup')).data.exercises[0].sets.at(-1)
  assert.equal(inherited.setType, 'warmup')
  assert.equal(inherited.state, 'pending')
})
