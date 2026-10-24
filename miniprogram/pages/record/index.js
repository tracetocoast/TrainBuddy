const { syncRoleBar } = require('../../utils/role')
const { requireCoachRole } = require('../../utils/guard')
const { canCoachReadStudent } = require('../../utils/permission')
const bindingApi = require('../../services/bindingApi')
const trainingApi = require('../../services/trainingApi')
const voiceApi = require('../../services/voiceApi')

const MAX_REC_SEC = 60

Page({
  data: {
    role: 'coach',
    students: [],
    student: '',
    studentId: '',
    session: null,
    library: trainingApi.EXERCISE_LIBRARY,
    textInput: '',
    publicNote: '',
    privateNote: '',
    syncing: false,
    nextPlanId: '',
    asrProvider: 'mock',
    micDenied: false,
    recording: false,
    remainSec: MAX_REC_SEC,
    voiceBusy: false,
    voiceTask: null,
    segments: [],
    segmentPatches: {},
    mergeMode: 'append'
  },

  recorder: null,
  recTimer: null,
  recTempPath: '',

  onLoad() {
    this.initRecorder()
  },

  onUnload() {
    this.clearRecTimer()
    if (this.recorder && this.data.recording) {
      try {
        this.recorder.stop()
      } catch (e) {}
    }
  },

  onShow() {
    if (!requireCoachRole(this)) return
    const app = getApp()
    syncRoleBar(this)
    voiceApi.listProviders().then((p) => {
      this.setData({ asrProvider: (p && p.active) || 'mock' })
    }).catch(() => {})

    bindingApi.listBoundStudentsForCoachAsync(app).then((bound) => {
      let studentId = app.globalData.activeSubjectId
      let student = app.globalData.student
      if (bound.length && !bound.find((b) => b.studentId === studentId)) {
        studentId = bound[0].studentId
        student = bound[0].name
      }
      this.setData({
        students: bound || [],
        studentId: studentId || '',
        student: student || ''
      })
      if (studentId) this.loadDraftSession(studentId, student)
    })
  },

  initRecorder() {
    try {
      this.recorder = wx.getRecorderManager()
      this.recorder.onStop((res) => {
        this.clearRecTimer()
        this.setData({ recording: false, remainSec: MAX_REC_SEC })
        if (!res.tempFilePath) {
          getApp().toast('未拿到录音文件')
          return
        }
        this.recTempPath = res.tempFilePath
        this.uploadAndCreateTask(res.tempFilePath)
      })
      this.recorder.onError(() => {
        this.clearRecTimer()
        this.setData({ recording: false, micDenied: true, voiceBusy: false })
        getApp().toast('录音失败，请用手填或点击添加')
      })
    } catch (e) {
      this.setData({ micDenied: true })
    }
  },

  clearRecTimer() {
    if (this.recTimer) {
      clearInterval(this.recTimer)
      this.recTimer = null
    }
  },

  onRequestMic() {
    wx.authorize({
      scope: 'scope.record',
      success: () => this.setData({ micDenied: false }),
      fail: () => {
        this.setData({ micDenied: true })
        getApp().toast('仍无麦克风权限，可继续文字录入')
      }
    })
  },

  onRecStart() {
    if (this.data.session.status === 'completed' || this.data.voiceBusy) return
    const app = getApp()
    wx.getSetting({
      success: (set) => {
        if (set.authSetting['scope.record'] === false) {
          this.setData({ micDenied: true })
          app.toast('无麦克风权限，请用手填（AC14）')
          return
        }
        this.startRecording()
      },
      fail: () => this.startRecording()
    })
  },

  startRecording() {
    if (!this.recorder) {
      this.setData({ micDenied: true })
      return
    }
    this.setData({ recording: true, remainSec: MAX_REC_SEC })
    this.recorder.start({
      duration: MAX_REC_SEC * 1000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'mp3'
    })
    this.clearRecTimer()
    this.recTimer = setInterval(() => {
      const left = this.data.remainSec - 1
      if (left <= 0) {
        this.onRecEnd()
        return
      }
      this.setData({ remainSec: left })
    }, 1000)
  },

  onRecEnd() {
    if (!this.data.recording) return
    this.clearRecTimer()
    try {
      this.recorder.stop()
    } catch (e) {
      this.setData({ recording: false })
    }
  },

  /** 读本地临时文件为 base64（演示）；正式可改为 upload-intent */
  uploadAndCreateTask(tempPath) {
    const app = getApp()
    const session = this.data.session
    this.setData({ voiceBusy: true })
    const fs = wx.getFileSystemManager()
    fs.readFile({
      filePath: tempPath,
      encoding: 'base64',
      success: (file) => {
        // mock 才带 demo_phrase；qwen/wechat 走真实音频转写
        const payload = {
          source: 'voice',
          base_revision: session.revision,
          audio_base64: file.data,
          name_hint: this.data.student
        }
        if ((this.data.asrProvider || 'mock') === 'mock') {
          payload.demo_phrase = '深蹲 60公斤 10次 4组'
        }
        voiceApi
          .createTask(
            session.session_id,
            payload,
            'voice_' + session.session_id + '_' + Date.now()
          )
          .then((res) => this.applyVoiceTask(res.data))
          .catch((err) => {
            this.setData({ voiceBusy: false })
            app.toast((err && err.message) || '转写失败，可手填重试')
          })
      },
      fail: () => {
        // 读文件失败仍可走文字
        this.setData({ voiceBusy: false })
        app.toast('读取录音失败，请改用文字录入')
      }
    })
  },

  applyVoiceTask(task) {
    const merged = task.merged_segment_ids || []
    const segments = ((task.structured && task.structured.segments) || []).map((s) =>
      Object.assign({}, s, {
        merged: merged.indexOf(s.segment_id) !== -1,
        missing_fields_label: (s.missing_fields || []).join('、')
      })
    )
    this.setData({
      voiceBusy: false,
      voiceTask: task,
      segments,
      segmentPatches: {}
    })
    if (task.status === 'failed') {
      getApp().toast((task.error && task.error.message) || '识别失败')
    }
  },

  coachId() {
    const u = getApp().globalData.session.user
    return (u.coachProfile && u.coachProfile.coachId) || u.userId
  },

  onPickStudent(e) {
    const app = getApp()
    const studentId = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    const check = canCoachReadStudent(app, app.globalData.session.user.userId, studentId)
    if (!check.ok) {
      app.toast(check.message || '无权访问')
      return
    }
    app.globalData.activeSubjectId = studentId
    app.globalData.student = name
    app.persist()
    this.setData({
      studentId,
      student: name,
      textInput: '',
      voiceTask: null,
      segments: [],
      nextPlanId: ''
    })
    this.loadDraftSession(studentId, name)
  },

  loadDraftSession(studentId, studentName) {
    const app = getApp()
    trainingApi
      .createCoachDraftSession(app, {
        studentId,
        studentName,
        coachId: this.coachId(),
        title: '课后训练表'
      })
      .then((res) => {
        this.setData({
          session: res.data,
          publicNote: res.data.public_note || '',
          privateNote: res.data.private_note || ''
        })
        if (res.data.status === 'completed') {
          this.findNextPlan(studentId, res.data.session_id)
        }
      })
      .catch((err) => app.toast((err && err.message) || '加载草稿失败'))
  },

  findNextPlan(studentId) {
    trainingApi.listPlansForStudent(getApp(), studentId).then((res) => {
      const hit = (res.data || []).find(
        (p) =>
          (p.source_type === 'next_from_session' || p.source_type === 'rule_copy') &&
          p.latest_draft
      )
      this.setData({ nextPlanId: (hit && hit.plan_id) || '' })
    })
  },

  onAddLib(e) {
    const app = getApp()
    trainingApi
      .addExercise(app, this.data.session.session_id, {
        exerciseId: e.currentTarget.dataset.id
      })
      .then((res) => this.setData({ session: res.data }))
      .catch((err) => app.toast((err && err.message) || '添加失败'))
  },

  onRemoveEx(e) {
    trainingApi
      .removeExercise(getApp(), this.data.session.session_id, e.currentTarget.dataset.id)
      .then((res) => this.setData({ session: res.data }))
  },

  onTextInput(e) {
    this.setData({ textInput: e.detail.value })
  },

  onParseText() {
    const app = getApp()
    const text = (this.data.textInput || '').trim()
    if (!text) {
      app.toast('请输入文字')
      return
    }
    this.setData({ voiceBusy: true })
    voiceApi
      .createTask(
        this.data.session.session_id,
        {
          source: 'text',
          text,
          base_revision: this.data.session.revision,
          name_hint: this.data.student
        },
        'text_' + Date.now()
      )
      .then((res) => this.applyVoiceTask(res.data))
      .catch((err) => {
        this.setData({ voiceBusy: false })
        app.toast((err && err.message) || '解析失败')
      })
  },

  onMergeMode(e) {
    this.setData({ mergeMode: e.currentTarget.dataset.m })
  },

  onSegPatch(e) {
    const sid = e.currentTarget.dataset.sid
    const f = e.currentTarget.dataset.f
    let val = e.detail.value
    if (f === 'set_count' || f === 'candidate_reps_per_set') {
      val = val === '' ? null : parseInt(val, 10)
    }
    const patches = Object.assign({}, this.data.segmentPatches)
    patches[sid] = Object.assign({}, patches[sid] || {}, { [f]: val })
    // 同步到展示
    const segments = this.data.segments.map((s) => {
      if (s.segment_id !== sid) return s
      const next = Object.assign({}, s, patches[sid])
      const missing = []
      if (next.set_count == null) missing.push('set_count')
      if (next.candidate_reps_per_set == null) missing.push('reps')
      if (!next.display_name || next.display_name === '（待确认动作）') {
        missing.push('exercise_name')
      }
      next.requires_confirmation = missing.length > 0
      next.missing_fields = missing
      next.missing_fields_label = missing.join('、')
      return next
    })
    this.setData({ segmentPatches: patches, segments })
  },

  onMergeOne(e) {
    this.doMerge([e.currentTarget.dataset.sid])
  },

  onMergeAllReady() {
    const ids = this.data.segments
      .filter((s) => !s.merged && !s.requires_confirmation)
      .map((s) => s.segment_id)
    if (!ids.length) {
      getApp().toast('没有可合并项，请先补齐缺失字段')
      return
    }
    this.doMerge(ids)
  },

  doMerge(segmentIds) {
    const app = getApp()
    const task = this.data.voiceTask
    if (!task) {
      app.toast('请先解析或录音')
      return
    }
    this.setData({ voiceBusy: true })
    voiceApi
      .mergeTask(
        this.data.session.session_id,
        task.task_id,
        {
          base_revision: this.data.session.revision,
          mode: this.data.mergeMode,
          segment_ids: segmentIds,
          segment_patches: this.data.segmentPatches,
          resolutions: {} // 默认 keep_human
        },
        'merge_' + task.task_id + '_' + segmentIds.join('_')
      )
      .then((res) => {
        const skipped = res.data.skipped || []
        if (skipped.length) {
          const msg = skipped
            .map((s) => s.segment_id + ':' + (s.message || s.reason))
            .join('；')
          app.toast(msg.slice(0, 40))
        }
        this.setData({
          session: res.data.session,
          voiceBusy: false
        })
        this.applyVoiceTask(res.data.task)
      })
      .catch((err) => {
        this.setData({ voiceBusy: false })
        app.toast((err && err.message) || '合并失败')
      })
  },

  onUndoMerge() {
    const app = getApp()
    voiceApi
      .undoMerge(this.data.session.session_id)
      .then((res) => {
        this.setData({ session: res.data.session })
        if (this.data.voiceTask) {
          voiceApi
            .getTask(this.data.session.session_id, this.data.voiceTask.task_id)
            .then((t) => this.applyVoiceTask(t.data))
        }
        app.toast('已撤销上次合并')
      })
      .catch((err) => app.toast((err && err.message) || '无法撤销'))
  },

  onSetField(e) {
    const app = getApp()
    const setId = e.currentTarget.dataset.sid
    const field = e.currentTarget.dataset.field
    let val = e.detail.value
    if (val === '' || val == null) return
    val = field === 'actualReps' ? parseInt(val, 10) : parseFloat(val)
    if (isNaN(val)) return
    const patch = {}
    patch[field] = val
    trainingApi
      .updateActualSet(app, this.data.session.session_id, setId, patch)
      .then((res) => this.setData({ session: res.data }))
  },

  onMarkDone(e) {
    trainingApi
      .updateActualSet(getApp(), this.data.session.session_id, e.currentTarget.dataset.sid, {
        state: 'done'
      })
      .then((res) => this.setData({ session: res.data }))
  },

  onPublicNote(e) {
    this.setData({ publicNote: e.detail.value })
    this.saveNotes()
  },

  onPrivateNote(e) {
    this.setData({ privateNote: e.detail.value })
    this.saveNotes()
  },

  saveNotes() {
    const app = getApp()
    if (!this.data.session || this.data.session.status === 'completed') return
    trainingApi
      .patchSessionMeta(app, this.data.session.session_id, {
        publicNote: this.data.publicNote,
        privateNote: this.data.privateNote
      })
      .then((res) => this.setData({ session: res.data }))
  },

  onFinalize() {
    if (this.data.syncing) return
    const app = getApp()
    const session = this.data.session
    if (!session.exercises.length) {
      app.toast('请先添加训练动作')
      return
    }
    wx.showModal({
      title: '确认并同步',
      content:
        '将生成正式版本并同步给学员（私人备注不同步）。同时按规则生成下次计划草稿，不会自动加 5kg。',
      confirmText: '确认同步',
      success: (res) => {
        if (!res.confirm) return
        this.setData({ syncing: true })
        const marks = []
        session.exercises.forEach((ex) => {
          ;(ex.sets || []).forEach((set) => {
            if (set.state === 'pending') {
              marks.push(
                trainingApi.updateActualSet(app, session.session_id, set.id, {
                  state: 'done'
                })
              )
            }
          })
        })
        Promise.all(marks)
          .then(() =>
            trainingApi.finalizeSession(app, session.session_id, {
              completionKey: session.session_id + ':coach_sync',
              share: true,
              actorRole: 'coach',
              baseRevision: this.data.session.revision
            })
          )
          .then((resp) => {
            this.setData({
              syncing: false,
              session: resp.data.session,
              nextPlanId: (resp.data.next_plan && resp.data.next_plan.plan_id) || ''
            })
            const tip = resp.data.next_plan_error
              ? resp.data.next_plan_error
              : resp.data.next_plan
                ? '训练表已同步，下次计划草稿已生成。'
                : '训练表已同步。'
            wx.showModal({
              title: resp.data.idempotent ? '已同步（幂等）' : '同步成功',
              content: tip,
              confirmText: resp.data.next_plan ? '编辑下次计划' : '完成',
              showCancel: !!resp.data.next_plan,
              cancelText: '稍后',
              success: (r) => {
                if (r.confirm && resp.data.next_plan) {
                  wx.navigateTo({
                    url: '/pages/plan-edit/index?id=' + resp.data.next_plan.plan_id
                  })
                }
              }
            })
          })
          .catch((err) => {
            this.setData({ syncing: false })
            app.toast((err && err.message) || '同步失败')
          })
      }
    })
  },

  goNextPlan() {
    if (!this.data.nextPlanId) return
    wx.navigateTo({ url: '/pages/plan-edit/index?id=' + this.data.nextPlanId })
  }
})
