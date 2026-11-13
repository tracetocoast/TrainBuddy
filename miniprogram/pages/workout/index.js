const { syncRoleBar } = require('../../utils/role')
const { requireLogin } = require('../../utils/guard')
const trainingApi = require('../../services/trainingApi')
const interaction = require('../../utils/interaction')
const time = require('../../utils/time')
const planSchedule = require('../../utils/planSchedule')

const REST_SECONDS = 90

function formatTarget(set) {
  const weight = set.targetWeight != null ? set.targetWeight + 'kg' : '—'
  const reps = set.targetReps != null ? set.targetReps + '次' : '—'
  return weight + ' × ' + reps
}

function formatWeight(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

function loadBasisLabel(basis) {
  if (basis === 'total') return '总重量'
  if (basis === 'per_side') return '单侧重量'
  if (basis === 'bodyweight') return '自重'
  return '计重口径未标注'
}

function restClock(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}

function exerciseProgress(ex) {
  const sets = ex.sets || []
  const done = sets.filter((s) => s.state === 'done' || s.state === 'skipped').length
  return { done, total: sets.length, complete: sets.length > 0 && done >= sets.length }
}

function firstPendingSet(ex) {
  return (ex.sets || []).find((s) => s.state !== 'done' && s.state !== 'skipped') || null
}

function baselineOf(ex) {
  const set = (ex.sets || [])[0] || {}
  return {
    weight: set.targetWeight,
    reps: set.targetReps,
    label: formatTarget(set)
  }
}

Page({
  data: {
    role: 'student', setEditor:null, showHistory:false, exerciseHistory:[],
    plans: [],
    hasPublishedPlans: false,
    session: null,
    resumableSession: null,
    resumableSessions: [],
    showDrafts: false,
    setSaveErrors: {},
    syncingSet: '',
    addQueue: [],
    phase: 'picker',
    finishing: false,
    savingSet: false,
    activeSid: '',
    activeGroup: null,
    focusView: null,
    nextHint: null,
    pending: {},
    lockedExerciseId: '',
    saveError: '',
    loadError: '',
    loading: false,
    reduced: false,
    justCompleted: false,
    restVisible: false,
    restPaused: false,
    exerciseDone: {},
    restPreference: REST_SECONDS,
    restSeconds: REST_SECONDS,
    restText: restClock(REST_SECONDS),
    imageFailed: {}
  },

  onLoad(query) {
    if (query?.history === '1') this._browsePlans = true
    this._newFree = query?.new === '1'
    this._initialPlan = query?.plan
  },
  onShow() {
    if (!requireLogin(this)) return
    syncRoleBar(this)
    if (this._sessionOwner && this._sessionOwner !== this.studentId() + ':' + getApp().globalData.role) {
      this.closeRest(true)
      this.setData({ session: null, resumableSession: null, resumableSessions: [], showDrafts: false,
        pending: {}, setSaveErrors: {}, syncingSet: '', addQueue: [], savingSet: false, finishing: false, setEditor: null })
    }
    let restPreference = REST_SECONDS
    try {
      const saved = wx.getStorageSync('workout-rest:' + this.studentId())
      if (Number.isInteger(saved) && saved >= 0 && saved <= 900) restPreference = saved
    } catch (_) { /* Keep the default when storage is unavailable. */ }
    this.setData({ reduced: interaction.reducedMotion(), restPreference })
    if (this._newFree) return this.startFreeSession()
    this.resumeRestUpdates()
    return this.reload().then(() => {
      if (!this._initialPlan || this._unloaded || this.data.loadError) return
      const id = this._initialPlan
      this._initialPlan = null
      return this.onStart({ currentTarget: { dataset: { id } } })
    })
  },
  async startFreeSession() {
    if (this._creatingFree || !this.studentId()) return
    this._creatingFree = true
    const app = getApp()
    const owner = this.studentId() + ':' + app.globalData.role
    const current = () => !this._unloaded && owner === this.studentId() + ':' + app.globalData.role
    if (this._freeOwner !== owner) this._freeKey = null
    this._freeOwner = owner
    this._freeKey = this._freeKey || 'free:' + owner + ':' + Date.now() + ':' + Math.random().toString(36).slice(2)
    this.setData({ loading: true, loadError: '' })
    try {
      const res = await trainingApi.createFreeSession(app, this._freeKey, true)
      if (!current()) return
      this._newFree = false
      this._freeKey = null
      this._browsePlans = false
      this.applySession(res.data, true)
      this.setData({ showDrafts: false })
    } catch (err) {
      if (current()) this.setData({ loadError: err.message || '创建训练失败' })
    } finally {
      this._creatingFree = false
      if (current()) this.setData({ loading: false })
    }
  },
  onRetryLoad() { return this._newFree ? this.startFreeSession() : this.reload() },
  onHide() { this.cacheDraft(); this.pauseRestUpdates() },
  onUnload() {
    this.cacheDraft()
    this.closeRest(true)
    this._unloaded = true
    this._reloadGeneration = (this._reloadGeneration || 0) + 1
  },
  noop() {},

  draftKey(session) {
    return [this.studentId(), getApp().globalData.role, 'workout-v2', session.session_id].join(':')
  },
  cacheDraft() {
    if (!this.data.session) return
    if (this._sessionOwner && this._sessionOwner !== this.studentId() + ':' + getApp().globalData.role) return
    const app = getApp()
    const drafts = app.globalData.drafts || {}
    drafts[this.draftKey(this.data.session)] = {
      userId: this.studentId(),
      payload: this.data.pending,
      addQueue: this.data.addQueue,
      draftRevision: this._draftRevision ?? this.data.session.revision,
      lockedExerciseId: this.data.lockedExerciseId || '',
      phase: this.data.phase,
      lastSetType: this._lastSetType || null,
      updatedAt: Date.now()
    }
    app.globalData.drafts = drafts
    try { app.persist() } catch (_) { this.setData({ saveError: '本机暂存失败，请保持页面打开并保存至服务器' }) }
  },

  applySession(session, restore) {
    this._sessionOwner = this.studentId() + ':' + getApp().globalData.role
    const cached = (getApp().globalData.drafts || {})[this.draftKey(session)]
    const pending = restore ? ((cached && cached.payload) || {}) : this.data.pending
    session = JSON.parse(JSON.stringify(session))
    session.exercises.forEach((ex) => ex.sets.forEach((set) => {
      if (pending[set.id] && set.state !== 'done') Object.assign(set, pending[set.id])
    }))

    const previous = restore ? cached?.lockedExerciseId : this.data.lockedExerciseId
    const expanded = session.exercises.find(ex => ex.id === previous) ||
      session.exercises.find(ex => !exerciseProgress(ex).complete) || session.exercises[0]
    const lockedExerciseId = expanded?.id || ''
    if (restore) {
      this._lastSetType = cached?.lastSetType || ''
      this._draftRevision = Object.keys(pending).length ? cached?.draftRevision : undefined
      this.setData({ addQueue: cached?.addQueue || [] })
      if (this.data.session?.session_id !== session.session_id) this.setData({ setSaveErrors: {}, setEditor: null, showHistory: false, exerciseHistory: [] })
    }
    this.setData({ session, pending, lockedExerciseId, phase: expanded ? 'locked' : 'picker',
      exerciseDone: Object.fromEntries(session.exercises.map(ex => [ex.id, ex.sets.filter(set => set.state === 'done').length])) })
    this.selectActive('', lockedExerciseId)
  },

  buildFocusView(session, activeSid, lockedExerciseId) {
    if (!session || !lockedExerciseId) {
      return { activeGroup: null, focusView: null, nextHint: null }
    }
    const exercise = session.exercises.find((ex) => ex.id === lockedExerciseId)
    if (!exercise) return { activeGroup: null, focusView: null, nextHint: null }

    const sets = exercise.sets || []
    const current = sets.find((s) => s.id === activeSid) || firstPendingSet(exercise) || sets[sets.length - 1]
    if (!current) return { activeGroup: null, focusView: null, nextHint: null }

    const progress = exerciseProgress(exercise)
    const baseline = baselineOf(exercise)
    const doneCount = sets.filter((s) => s.state === 'done').length
    const exerciseOrder = session.exercises.findIndex((ex) => ex.id === lockedExerciseId) + 1
    const activeGroup = Object.assign({ exerciseName: exercise.name }, current)
    const focusView = {
      exerciseId: exercise.exerciseId || '',
      exerciseName: exercise.name,
      icon: exercise.icon || '🏋️',
      imageUrl: exercise.imageUrl || '',
      imageFailed: !!(this.data.imageFailed && this.data.imageFailed[exercise.id]),
      muscle: loadBasisLabel(exercise.loadBasis),
      exerciseOrder,
      exerciseTotal: session.exercises.length,
      setId: current.id,
      setNo: current.setNo,
      setTotal: sets.length,
      doneInExercise: doneCount,
      exerciseComplete: progress.complete,
      progressPercent: sets.length ? Math.round((doneCount / sets.length) * 100) : 0,
      state: current.state,
      baselineLabel: baseline.label,
      targetLabel: formatTarget(current),
      actualWeight: current.actualWeight,
      actualReps: current.actualReps,
      weightText: formatWeight(current.actualWeight),
      repsText: current.actualReps == null || current.actualReps === '' ? '—' : String(current.actualReps),
      pendingLocal: !!this.data.pending[current.id]
    }

    const currentIndex = sets.findIndex((s) => s.id === current.id)
    const nextSet = sets.slice(currentIndex + 1).find((s) => s.state !== 'done' && s.state !== 'skipped')
    let nextHint = null
    if (nextSet) {
      nextHint = {
        title: '下一组：' + exercise.name,
        line: '目标 ' + formatTarget(nextSet) + ' · 完成后休息 90 秒'
      }
    } else if (!progress.complete) {
      nextHint = {
        title: '本动作即将完成',
        line: '记录后可继续下一个动作'
      }
    } else {
      nextHint = {
        title: '本动作已完成',
        line: '可返回选择下一个动作'
      }
    }
    return { activeGroup, focusView, nextHint }
  },

  selectActive(sid, lockedExerciseId) {
    const locked = lockedExerciseId != null ? lockedExerciseId : this.data.lockedExerciseId
    const view = this.buildFocusView(this.data.session, sid, locked)
    this.setData({
      activeSid: view.activeGroup ? (sid || view.focusView.setId) : '',
      activeGroup: view.activeGroup,
      focusView: view.focusView,
      nextHint: view.nextHint
    })
  },

  onMotion(e) {
    interaction.setReducedMotion(e.detail.value)
    this.setData({ reduced: !!e.detail.value })
  },

  onToggleExercise(e) {
    if ((this._writeBusy && !this._autoSaving) || this.data.finishing) return
    const id = e.currentTarget.dataset.id
    if (!this.data.session.exercises.some(ex => ex.id === id)) return
    const lockedExerciseId = id === this.data.lockedExerciseId ? '' : id
    this.setData({ lockedExerciseId, phase: lockedExerciseId ? 'locked' : 'picker', setEditor: null, showHistory: false })
    this.selectActive('', lockedExerciseId)
    this.cacheDraft()
  },

  onSessionBack() {
    if (this._writeBusy || this.data.finishing) return
    wx.showModal({
      title: '返回训练首页？',
      content: '本次训练会保留，之后可在未完成训练中继续。',
      confirmText: '返回',
      success: (res) => {
        if (!res.confirm || this._writeBusy || this.data.finishing) return
        this._browsePlans = true
        this.closeRest(true)
        this.cacheDraft()
        this.setData({
          session: null,
          phase: 'picker',
          focusView: null,
          nextHint: null,
          activeSid: '',
          activeGroup: null,
          lockedExerciseId: '',
          justCompleted: false
        })
        this.reload()
      }
    })
  },

  onExerciseImageError(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ ['imageFailed.' + id]: true })
  },

  onCopyPrevious(e) {
    if (this._writeBusy || this.data.finishing || !this.data.focusView) return
    const sid = e?.currentTarget.dataset.sid || this.data.focusView.setId
    const locked = this.data.session.exercises.find((ex) => ex.id === this.data.lockedExerciseId)
    if (!locked) return
    const index = locked.sets.findIndex((set) => set.id === sid)
    if (index < 1) return getApp().toast('这是第一个训练组')
    const previous = locked.sets[index - 1]
    for (const field of ['actualWeight', 'actualReps']) {
      this.onSetField({
        currentTarget: { dataset: { sid, field } },
        detail: { value: previous[field] == null ? '' : previous[field] }
      })
    }
    this.onCloseSetEditor()
    interaction.feedback()
  },

  onStepValue(e) {
    if (this._writeBusy || this.data.finishing || !this.data.focusView) return
    const field = e.currentTarget.dataset.field
    const delta = Number(e.currentTarget.dataset.delta)
    const sid = this.data.focusView.setId
    const current = field === 'actualWeight' ? this.data.focusView.actualWeight : this.data.focusView.actualReps
    const base = current == null || current === ''
      ? (field === 'actualWeight' ? 0 : 1)
      : Number(current)
    if (!Number.isFinite(base)) return
    let next = base + delta
    if (field === 'actualWeight') next = Math.max(0, Math.round(next * 10) / 10)
    else next = Math.max(1, Math.round(next))
    this.onSetField({ currentTarget: { dataset: { sid, field } }, detail: { value: next } })
    getApp().toast('仅临时调整本组')
    interaction.feedback()
  },

  studentId() {
    const session = getApp().globalData.session
    return session && session.user ? session.user.userId : ''
  },

  onRestPreference() {
    const options = [0, 60, 90, 120]
    const owner = this.studentId()
    const save = seconds => {
      if (owner !== this.studentId()) return
      try { wx.setStorageSync('workout-rest:' + owner, seconds) } catch (_) { /* Session preference still applies. */ }
      this.setData({ restPreference: seconds })
      if (!seconds) this.closeRest()
    }
    wx.showActionSheet({ itemList: ['关闭计时', '60 秒', '90 秒', '120 秒', '自定义'], success: result => {
      if (result.tapIndex < options.length) { save(options[result.tapIndex]); return }
      wx.showModal({ title: '自定义休息', editable: true, placeholderText: '输入 1–900 秒', success: input => {
        if (!input.confirm) return
        const seconds = Number(input.content)
        if (Number.isInteger(seconds) && seconds >= 1 && seconds <= 900) save(seconds)
        else getApp().toast('请输入 1–900 的整数')
      } })
    } })
  },

  openRest() {
    const seconds = this.data.restPreference ?? REST_SECONDS
    if (!seconds) return
    this.setData({ restPaused: false })
    this._restEndsAt = Date.now() + seconds * 1000
    this.resumeRestUpdates()
  },

  pauseRestUpdates() {
    if (this._restTimer != null) clearInterval(this._restTimer)
    this._restTimer = null
  },

  resumeRestUpdates() {
    this.pauseRestUpdates()
    if (!this._restEndsAt) return
    const update = () => {
      const seconds = Math.max(0, Math.ceil((this._restEndsAt - Date.now()) / 1000))
      this.setData({ restVisible: true, restSeconds: seconds, restText: restClock(seconds) })
      if (!seconds) this.pauseRestUpdates()
    }
    update()
    if (this.data.restSeconds > 0) this._restTimer = setInterval(update, 1000)
  },

  closeRest(silent) {
    this.pauseRestUpdates()
    this._restEndsAt = null
    if (!this.data.restVisible && silent === true) return
    this.setData({ restVisible: false, restPaused: false, justCompleted: false, restSeconds: REST_SECONDS, restText: restClock(REST_SECONDS) })
  },

  onToggleRest() {
    if (!this.data.restSeconds) return
    if (this.data.restPaused) {
      this._restEndsAt = Date.now() + this.data.restSeconds * 1000
      this.setData({ restPaused: false })
      this.resumeRestUpdates()
      return
    }
    const seconds = Math.max(0, Math.ceil((this._restEndsAt - Date.now()) / 1000))
    this.pauseRestUpdates()
    this._restEndsAt = null
    this.setData({ restPaused: seconds > 0, restSeconds: seconds, restText: restClock(seconds) })
  },

  reload() {
    if (this._writeBusy || this.data.finishing) return Promise.resolve()
    this.setData({ loading: true, loadError: '', justCompleted: false })
    const app = getApp()
    const studentId = this.studentId()
    const generation = this._reloadGeneration = (this._reloadGeneration || 0) + 1
    const owner = studentId + ':' + app.globalData.role
    const current = () => generation === this._reloadGeneration && owner === this.studentId() + ':' + app.globalData.role && !this._unloaded

    return trainingApi.listSessions(app, {
      studentId,
      status: ['in_progress', 'draft']
    }).then((res) => {
      if (!current()) return
      const sessions = (res.data || []).filter(s => s.source_type !== 'coach_post_session')
      const active = sessions.find(s => s.session_id === this.data.session?.session_id) || sessions[0]
      this.setData({ resumableSession: sessions[0] || null, resumableSessions: sessions })
      if (active && this.data.session && active.session_id === this.data.session.session_id && !this._browsePlans) {
        this.applySession(active, true)
        this.setData({ plans: [] })
        return
      }
      return Promise.all([
        trainingApi.listPlansForStudent(app, studentId),
        trainingApi.listSessions(app, { studentId, status: ['completed'] })
      ]).then(([pres, sres]) => {
        if (!current()) return
        const today = time.todayKey()
        const doneIds = {}
        ;(sres.data || []).forEach((row) => {
          if (
            row.status === 'completed' &&
            row.business_date === today &&
            row.source_type === 'from_plan' &&
            row.plan_id
          ) {
            doneIds[row.plan_id] = true
          }
        })
        const published = (pres.data || []).filter((p) => p.published)
        const plans = published.filter(
          (p) => planSchedule.isOpenOnDate(p.published, today) && !doneIds[p.plan_id]
        ).map((p) => Object.assign({}, p, { scheduleText: planSchedule.scheduleLabel(p.published) }))
        this.setData({
          session: null,
          phase: 'picker',
          focusView: null,
          nextHint: null,
          activeSid: '',
          activeGroup: null,
          lockedExerciseId: '',
          plans,
          hasPublishedPlans: published.length > 0
        })
      })
    }).catch((err) => {
      if (current()) this.setData({ loadError: err.message || '训练加载失败，请重试' })
    }).then(() => {
      if (current()) this.setData({ loading: false })
    })
  },

  onNewTraining() {
    if (this.data.loading || this.data.loadError) return
    wx.navigateTo({ url: '/pages/new-workout/index' })
  },
  onResumeTraining(e) {
    if (this.data.loading || this.data.loadError) return
    const id = e?.currentTarget?.dataset?.id
    const active = id ? this.data.resumableSessions.find(row => row.session_id === id) : this.data.resumableSession
    if (!active) return
    this._browsePlans = false
    this.setData({ showDrafts: false })
    this.applySession(active, true)
  },
  onToggleDrafts() {
    if (!this.data.loading && !this.data.loadError) this.setData({ showDrafts: !this.data.showDrafts })
  },
  onOpenSetEditor(e) {
    const sid = e.currentTarget.dataset.sid
    const exercise = this.data.session.exercises.find(row => row.id === this.data.lockedExerciseId)
    const set = exercise && exercise.sets.find(row => row.id === sid)
    if (this._writeBusy || this.data.finishing || !set) return
    this.setData({ setEditor: this.data.setEditor?.sid === sid ? null : { sid, kind: set.setType || 'working' } })
  },
  onCloseSetEditor() { this.setData({ setEditor: null }) },

  workoutScope() {
    return this.studentId() + ':' + getApp().globalData.role + ':' + (this.data.session?.session_id || '')
  },

  async onSetType(e) {
    const scope = this.workoutScope()
    const { sid, kind } = e.currentTarget.dataset
    if (this._autoSaving) await this._autoSaving
    if (!sid || this._writeBusy || this.data.finishing || this._unloaded || scope !== this.workoutScope()) return
    this._writeBusy = true
    this.setData({ savingSet: true, saveError: '' })
    try {
      const set = this.data.session.exercises.flatMap(ex => ex.sets).find(row => row.id === sid)
      if (!set || set.state === 'done') return
      const res = await trainingApi.updateActualSet(getApp(), this.data.session.session_id, sid, {
        setType: kind, base_revision: this.data.session.revision
      })
      if (this._unloaded || scope !== this.workoutScope()) return
      this._lastSetType = kind
      this.applySession(res.data, false)
      this.cacheDraft()
      this.onCloseSetEditor()
    } catch (err) {
      if (scope === this.workoutScope()) this.setData({ saveError: err.message || '切换失败' })
    } finally {
      this._writeBusy = false
      if (!this._unloaded) this.setData({ savingSet: false })
    }
  },
  async onAddActions() {
    if (this._autoSaving) await this._autoSaving
    if (this._writeBusy || this.data.finishing || !this.data.session || this._unloaded) return
    if (this.data.addQueue.length) return this.addLibraryExercises()
    const scope = this.workoutScope()
    wx.navigateTo({ url: '/pages/exercises/index?pick=1&target=workout', events: {
      selectExercises: items => {
        if (scope === this.workoutScope()) this.addLibraryExercises(items)
      }
    } })
  },
  async addLibraryExercises(items) {
    if (this._writeBusy || !this.data.session || this._unloaded) return
    const scope = this.workoutScope()
    const sessionId = this.data.session.session_id
    this._writeBusy = true
    if (items?.length && !this.data.addQueue.length) {
      const batch = Date.now() + ':' + Math.random().toString(36).slice(2)
      this.setData({ addQueue: items.map((item, index) => ({ item, key: 'add:' + batch + ':' + index })) })
      this.cacheDraft()
    }
    try {
      this.setData({ saveError: '' })
      while (this.data.addQueue.length) {
        const { item, key } = this.data.addQueue[0]
        const res = await trainingApi.addExercise(getApp(), sessionId, {
          exerciseId: item.id, name: item.name, weight: item.defaultWeight ?? null, useHistory: true
        }, key)
        if (this._unloaded || scope !== this.workoutScope()) return
        this.applySession(res.data, false)
        this.setData({ addQueue: this.data.addQueue.slice(1) })
        this.cacheDraft()
      }
    } catch (err) {
      if (!this._unloaded && scope === this.workoutScope()) {
        this.setData({ saveError: '还有 ' + this.data.addQueue.length + ' 个动作未确认添加。' + (err.message || '请重试。') })
      }
    } finally {
      this._writeBusy = false
    }
  },
  onChangeGroup(e) {
    const setId = e.currentTarget.dataset.sid
    const exerciseId = this.data.lockedExerciseId
    if (!setId) return this.changeGroup(exerciseId)
    wx.showModal({ title: '删除这组训练？', content: '本次训练中的这组记录会被移除。',
      success: result => { if (result.confirm) this.changeGroup(exerciseId, setId) } })
  },
  async changeGroup(exerciseId, setId) {
    const scope = this.workoutScope()
    if (this._autoSaving) await this._autoSaving
    if (!exerciseId || this._writeBusy || this.data.finishing || !this.data.session || this._unloaded || scope !== this.workoutScope()) return
    this._writeBusy=true;this.setData({savingSet:true,saveError:''})
    try{
      const pending = Object.keys(this.data.pending).filter(id => id !== setId)
      for (const id of pending) await this.saveSet(id)
      const res=await trainingApi.changeSessionSet(getApp(),this.data.session.session_id,exerciseId,setId, 'group:' + Date.now() + ':' + Math.random(), this._lastSetType)
      if (this._unloaded || scope !== this.workoutScope()) return
      if (setId) {
        const nextPending = { ...this.data.pending }
        delete nextPending[setId]
        this.setData({ pending: nextPending, setEditor: null })
      }
      this.applySession(res.data,false)
    }catch(err){this.setData({saveError:err.message||'修改失败，输入已保留'})}
    finally{this._writeBusy=false;this.setData({savingSet:false})}
  },
  onRemoveAction() {
    if(this._writeBusy || this.data.finishing)return
    const id=this.data.lockedExerciseId
    wx.showModal({title:'移除这个动作？',content:'本次训练中该动作的训练组也会删除。',success:async result=>{
      if(!result.confirm || this._writeBusy)return
      this._writeBusy=true
      try{
        const res=await trainingApi.removeExercise(getApp(),this.data.session.session_id,id)
        const pending=Object.assign({},this.data.pending)
        const ex=this.data.session.exercises.find(row=>row.id===id)
        ;(ex.sets||[]).forEach(set=>delete pending[set.id])
        this.setData({pending,lockedExerciseId:'',phase:'picker',showHistory:false})
        this.applySession(res.data,false)
      }catch(err){this.setData({saveError:err.message||'删除失败'})}
      finally{this._writeBusy=false}
    }})
  },
  onExerciseHistory() {
    if (this.data.showHistory) { this.setData({ showHistory: false }); return }
    const current=this.data.session.exercises.find(ex=>ex.id===this.data.lockedExerciseId)
    if(!current)return
    const owner=this.studentId(), sessionId=this.data.session.session_id
    return trainingApi.listSessions(getApp(),{studentId:owner,status:['completed']}).then(res=>{
      if (this._unloaded || owner !== this.studentId() || this.data.session?.session_id !== sessionId || this.data.lockedExerciseId !== current.id) return
      const rows=(res.data||[]).filter(row=>row.session_id!==this.data.session.session_id).map(row=>{
        const ex=(row.exercises||[]).find(ex=>current.exerciseId ? ex.exerciseId===current.exerciseId : ex.name===current.name)
        if(!ex)return null
        const sets=(ex.sets||[]).filter(set=>set.state==='done')
        return sets.length?{sessionId:row.session_id,date:row.business_date,summary:sets.map((set,i)=>(i+1)+'. '+set.actualWeight+' kg × '+set.actualReps+' 次').join('；')}:null
      }).filter(Boolean).sort((a,b)=>String(b.date).localeCompare(String(a.date)))
      this.setData({exerciseHistory:rows,showHistory:true})
    }).catch(err=>getApp().toast(err.message||'历史加载失败'))
  },
  goPlans() { wx.navigateTo({ url: '/pages/plans/index' }) },
  goExercises() { wx.navigateTo({ url: '/pages/exercises/index' }) },
  goDiary() { wx.navigateTo({ url: '/pages/diary/index' }) },
  goEditPlan() {
    const planId = this.data.session && this.data.session.plan_id
    if (!planId) {
      getApp().toast('当前训练没有关联计划')
      return
    }
    wx.navigateTo({ url: '/pages/plan-edit/index?id=' + planId })
  },
  goExerciseDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      getApp().toast('该动作暂无详情')
      return
    }
    wx.navigateTo({ url: '/pages/exercise-detail/index?id=' + id })
  },

  onEnsureDefault() {
    if (this._starting) return
    this._starting = true
    const app = getApp()
    const user = app.globalData.session.user
    return trainingApi.ensureDefaultPublishedPlan(app, {
      studentId: user.userId,
      authorId: user.userId,
      authorRole: 'student'
    }).then(() => this.reload()).catch((err) => app.toast(err.message || '模板创建失败')).then(() => { this._starting = false })
  },

  onStart(e) {
    if (this._starting || this.data.loading || this.data.loadError) return
    const planId = e.currentTarget.dataset.id
    this._browsePlans = false
    this._starting = true
    const app = getApp()
    const studentId = this.studentId()
    const owner = studentId + ':' + app.globalData.role
    this._startKeys = this._startKeys || {}
    const keyName = studentId + ':' + planId
    return trainingApi
      .startSessionFromPlan(app, planId, {
        studentId,
        idempotencyKey: this._startKeys[keyName] || (this._startKeys[keyName] = keyName + ':' + Date.now())
      })
      .then((res) => {
        if (owner !== this.studentId() + ':' + app.globalData.role || this._unloaded) return
        this.applySession(res.data, true)
        delete this._startKeys[keyName]
        if (res.resumed) app.toast('已恢复未完成训练')
        else app.toast('先选一个动作开始')
      })
      .catch((err) => app.toast((err && err.message) || '无法开始'))
      .then(() => { this._starting = false })
  },

  onSetField(e) {
    if ((this._writeBusy && !this._autoSaving) || this.data.finishing || !this.data.session || this.data.phase !== 'locked') return
    const setId = e.currentTarget.dataset.sid
    const field = e.currentTarget.dataset.field
    if (!['actualWeight', 'actualReps'].includes(field)) return
    const pending = Object.assign({}, this.data.pending)
    pending[setId] = Object.assign({}, pending[setId], { [field]: e.detail.value })
    const session = JSON.parse(JSON.stringify(this.data.session))
    const hit = session.exercises.reduce((all, ex) => all.concat(ex.sets), []).find((set) => set.id === setId)
    if (!hit || hit.state === 'done') return
    if (!Object.keys(this.data.pending).length) this._draftRevision = this.data.session.revision
    hit[field] = e.detail.value
    this.setData({ session, pending, saveError: '', justCompleted: false })
    this.selectActive(this.data.activeSid, this.data.lockedExerciseId)
    this.cacheDraft()
  },

  onSetEditEnd(e) {
    const setId = e.currentTarget.dataset.sid
    if (!this.data.pending[setId] || this.data.finishing) return
    if (!this._saveQueue) this._saveQueue = new Set()
    this._saveQueue.add(setId)
    return this.drainSetEdits()
  },

  async onRetrySet(e) {
    const { sid } = e.currentTarget.dataset
    if (this.data.setSaveErrors[sid]?.includes('重新核对')) {
      if (this._writeBusy || this.data.finishing) return
      const scope = this.workoutScope()
      this._writeBusy = true
      try {
        const res = await trainingApi.getSession(getApp(), this.data.session.session_id)
        if (this._unloaded || scope !== this.workoutScope()) return
        this.applySession(res.data, false)
        this._draftRevision = res.data.revision
        this.cacheDraft()
        this.setData({ ['setSaveErrors.' + sid]: '已载入最新版本，请核对本机输入后重试保存' })
      } catch (err) {
        if (scope === this.workoutScope()) this.setData({ saveError: err.message || '读取最新训练失败' })
      } finally {
        this._writeBusy = false
      }
      return
    }
    return this.onSetEditEnd(e)
  },

  drainSetEdits() {
    if (this._autoSaving || this._writeBusy || this._unloaded || !this._saveQueue?.size) return this._autoSaving
    const sessionId = this.data.session?.session_id
    const owner = this._sessionOwner
    const current = () => !this._unloaded && this.data.session?.session_id === sessionId &&
      owner === this._sessionOwner && (!owner || owner === this.studentId() + ':' + getApp().globalData.role)
    this._writeBusy = true
    this._autoSaving = Promise.resolve().then(async () => {
      while (current() && this._saveQueue.size) {
        const [setId] = this._saveQueue
        this._saveQueue.delete(setId)
        if (!this.data.pending[setId]) continue
        this.setData({ syncingSet: setId })
        try {
          await this.saveSet(setId)
          if (current()) this.setData({ ['setSaveErrors.' + setId]: '' })
        } catch (err) {
          if (current()) this.setData({ ['setSaveErrors.' + setId]: err.message || '保存失败' })
        }
      }
    }).finally(() => {
      this._writeBusy = false
      this._autoSaving = null
      if (!current()) this._saveQueue.clear()
      if (current()) this.setData({ syncingSet: '' })
    })
    return this._autoSaving
  },

  async saveSet(setId, state) {
    const session = this.data.session
    const owner = this.studentId() + ':' + getApp().globalData.role
    const hit = session.exercises.reduce((all, ex) => all.concat(ex.sets), []).find((set) => set.id === setId)
    if (!hit) throw Error('训练组不存在，请重新载入')
    const undoing = hit.state === 'done' && state === 'pending'
    const sentDraft = undoing ? {} : { ...this.data.pending[setId] }
    const patch = { base_revision: this._draftRevision ?? session.revision }
    for (const field of ['actualWeight', 'actualReps']) {
      const value = interaction.numberValue(hit[field], field === 'actualReps' ? 1 : 0, field === 'actualReps' ? 1000 : 2000, field === 'actualReps')
      if (value == null && state === 'done') throw Error('请填写本组实际重量与次数；自重训练重量可填 0')
      if (!Object.prototype.hasOwnProperty.call(sentDraft, field)) continue
      if (value == null && sentDraft[field] !== '') throw Error('请输入范围内的完整数值')
      patch[field] = value
    }
    if (state) patch.state = state
    const res = await trainingApi.updateActualSet(getApp(), session.session_id, setId, patch)
    if (this._unloaded || this.data.session?.session_id !== session.session_id || owner !== this.studentId() + ':' + getApp().globalData.role) {
      throw Error('训练已切换，请返回原训练查看')
    }
    const pending = Object.assign({}, this.data.pending)
    const latest = pending[setId]
    if (!undoing && latest && Object.keys(latest).every(field => latest[field] === sentDraft[field])) delete pending[setId]
    const nextSession = JSON.parse(JSON.stringify(res.data))
    this._draftRevision = Object.keys(pending).length ? nextSession.revision : undefined
    nextSession.exercises.forEach((ex) => ex.sets.forEach((set) => {
      if (pending[set.id] && set.state !== 'done') Object.assign(set, pending[set.id])
    }))
    this.setData({ session: nextSession, pending, ['setSaveErrors.' + setId]: '',
      exerciseDone: Object.fromEntries(nextSession.exercises.map(ex => [ex.id, ex.sets.filter(set => set.state === 'done').length])) })
    this.selectActive(this.data.activeSid, this.data.lockedExerciseId)
    this.cacheDraft()
    return nextSession
  },

  onSetState(e) {
    if (this._autoSaving) return this._autoSaving.then(() => this.onSetState(e))
    if (this._writeBusy || this.data.finishing || this._finishModal || this._abandonModal) return Promise.resolve()
    if (this.data.phase !== 'locked') return Promise.resolve()
    const scope = this.workoutScope()
    const sessionId = this.data.session.session_id
    const setId = e.currentTarget.dataset.sid
    const exercise = this.data.session.exercises.find(ex => ex.id === this.data.lockedExerciseId)
    if (!exercise?.sets.some(set => set.id === setId && set.state !== e.currentTarget.dataset.state)) return Promise.resolve()
    this.closeRest(true)
    this._writeBusy = true
    this.setData({ savingSet: true, saveError: '' })
    const state = e.currentTarget.dataset.state
    const lockedId = this.data.lockedExerciseId
    return this.saveSet(setId, state)
      .then((session) => {
        interaction.feedback()
        const exercise = session.exercises.find((ex) => ex.id === lockedId)
        if (!exercise) return
        if (state === 'done' || state === 'skipped') {
          if (exerciseProgress(exercise).complete) {
            this.setData({ lockedExerciseId: lockedId, phase: 'locked' })
            this.selectActive(setId, lockedId)
            getApp().toast('本组已记录')
            if (state === 'done' && !this._unloaded) this.openRest()
            return
          }
          const next = firstPendingSet(exercise)
          this.setData({ lockedExerciseId: lockedId, phase: 'locked' })
          this.selectActive(next ? next.id : setId, lockedId)
          if (state === 'done') {
            this.setData({ justCompleted: true })
            getApp().toast('本组已记录')
            if (next && !this._unloaded) this.openRest()
          }
        } else {
          this.selectActive(setId, lockedId)
        }
      })
      .catch((err) => {
        if (this._unloaded || this.data.session?.session_id !== sessionId || scope !== this.workoutScope()) return
        this.setData({ ['setSaveErrors.' + setId]: err.message || '保存失败，请重试' })
      })
      .then(() => {
        this._writeBusy = false
        if (!this._unloaded && scope === this.workoutScope()) {
          this.setData({ savingSet: false })
          this.drainSetEdits()
        }
      })
  },

  onFinish() {
    if (this._autoSaving) return this._autoSaving.then(() => this.onFinish())
    if (this.data.finishing || this._writeBusy || this._finishModal || !this.data.session) return
    if (this.data.addQueue.length) return getApp().toast('请先重试添加未同步的动作')
    this.closeRest(true)
    const app = getApp()
    const session = this.data.session
    const scope = this.workoutScope()
    const unfinished = session.exercises.flatMap(ex => {
      const groups = ex.sets.filter(set => set.state === 'pending' && set.required !== false)
      return groups.length ? [ex.name + ' 第 ' + groups.map(set => set.setNo).join('、') + ' 组'] : []
    })
    this._finishModal = true
    wx.showModal({
      title: '结束训练',
      content: '已完成 ' + session.done_sets + ' 组。' + (unfinished.length
        ? '以下未完成组将标为跳过：' + unfinished.slice(0, 3).join('；') + (unfinished.length > 3 ? '等' : '')
        : '确认保存本次训练记录。'),
      confirmText: '确认结束',
      success: (res) => {
        this._finishModal = false
        if (!res.confirm || this._writeBusy || this.data.finishing || scope !== this.workoutScope()) return
        this.setData({ finishing: true })
        const completionKey = session.session_id + ':complete'
        this._writeBusy = true
        let flush = Promise.resolve()
        Object.keys(this.data.pending).forEach((sid) => {
          flush = flush.then(() => this.saveSet(sid).catch(err => {
            if (!this._unloaded && scope === this.workoutScope()) {
              this.setData({ ['setSaveErrors.' + sid]: err.message || '保存失败' })
            }
            throw err
          }))
        })
        flush.then(() => {
          if (this._unloaded || scope !== this.workoutScope()) throw Error('训练已切换')
          return trainingApi.finalizeSession(app, session.session_id, {
          completionKey,
          baseRevision: this.data.session.revision,
          share: false,
          actorRole: 'student'
          })
        })
          .then((resp) => {
            this._writeBusy = false
            if (this._unloaded || scope !== this.workoutScope()) return
            const drafts = app.globalData.drafts || {}
            delete drafts[this.draftKey(session)]
            app.persist()
            this.setData({
              finishing: false,
              session: null,
              pending: {},
              focusView: null,
              nextHint: null,
              activeSid: '',
              activeGroup: null,
              lockedExerciseId: '',
              phase: 'picker',
              justCompleted: false
            })
            const idem = resp.data.idempotent ? '\n（幂等：未重复计数）' : ''
            const reward = resp.data.reward
            let rewardLine = ''
            if (reward && reward.awarded) rewardLine = '\n本次获得 ' + reward.points + ' 积分。'
            else if (reward && reward.already) rewardLine = '\n这笔训练的积分已领取。'
            if (reward && reward.achievements && reward.achievements.length) {
              rewardLine += '\n新成就：' + reward.achievements.map((item) => item.title).join('、')
            }
            wx.showModal({
              title: '训练已保存',
              content:
                '完成 ' +
                resp.data.session.done_sets +
                ' 组。' +
                idem +
                rewardLine +
                (resp.data.next_plan ? '\n已生成下次计划草稿（规则复制，未自动加量）。' : ''),
              showCancel: false,
              success: () => {
                this.reload()
                if (typeof wx.navigateTo === 'function') {
                  wx.navigateTo({ url: '/pages/training-report/index?id=' + encodeURIComponent(session.session_id) })
                }
              }
            })
          })
          .catch((err) => {
            this._writeBusy = false
            if (this._unloaded || scope !== this.workoutScope()) return
            this.setData({ finishing: false })
            app.toast((err && err.message) || '结束失败')
          })
      },
      fail: () => { this._finishModal = false }
    })
  },

  onAbandon() {
    if (this._writeBusy || this.data.finishing || this._abandonModal) return
    this.closeRest(true)
    this._abandonModal = true
    const app = getApp()
    wx.showModal({
      title: '放弃本次',
      content: '不计训练次数，可重新从计划开始。',
      confirmText: '放弃',
      success: (res) => {
        this._abandonModal = false
        if (!res.confirm || this._writeBusy || this.data.finishing) return
        this._writeBusy = true
        this.setData({ savingSet: true })
        trainingApi
          .abandonSession(app, this.data.session.session_id)
          .then(() => {
            const drafts = app.globalData.drafts || {}
            delete drafts[this.draftKey(this.data.session)]
            app.persist()
            this._writeBusy = false
            this.setData({
              session: null,
              pending: {},
              savingSet: false,
              focusView: null,
              nextHint: null,
              activeSid: '',
              activeGroup: null,
              lockedExerciseId: '',
              phase: 'picker',
              justCompleted: false
            })
            this.reload()
          })
          .catch((err) => {
            this._writeBusy = false
            this.setData({ savingSet: false, saveError: err.message || '放弃失败' })
          })
      },
      fail: () => { this._abandonModal = false }
    })
  }
})
