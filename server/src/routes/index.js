const express = require('express')
const { authRequired } = require('../middleware/auth')
const { idempotency } = require('../middleware/idempotency')
const { ok } = require('../middleware/errors')
const { asApp, unwrap } = require('../lib/asApp')
const { AppError } = require('../lib/errors')
const { assertCoachReadStudent, getActiveBinding, hasRole } = require('../lib/permission')

const authService = require('../services/authService')
const bindingService = require('../services/bindingService')
const bookingService = require('../services/bookingService')
const trainingService = require('../services/trainingService')
const diaryService = require('../services/diaryService')
const growthService = require('../services/growthService')
const exerciseService = require('../services/exerciseService')
const voiceTaskService = require('../services/voice/voiceTaskService')
const { listProviders } = require('../services/voice/adapters')
const { structureText } = require('../services/voice/structure')
const time = require('../lib/time')
const { makeId } = require('../lib/ids')

function buildRouter() {
  const r = express.Router()

  // ---------- API01 auth（可无 mock accountKey）----------
  r.post('/auth/wechat-session', async (req, res, next) => {
    try {
      const store = req.app.locals.store
      const data = await store.tx((state) =>
        authService.wechatSession(state, req.body || {})
      )
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/auth/apply-coach', authRequired, async (req, res, next) => {
    try {
      const data = authService.applyCoachRole(req.app.locals.store.state, req.actor)
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API02 me ----------
  r.get('/me', authRequired, (req, res, next) => {
    try {
      ok(res, authService.getMe(req.app.locals.store.state, req.actor))
    } catch (e) {
      next(e)
    }
  })

  r.patch('/me', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx((state) =>
        authService.patchMe(state, req.actor, req.body || {})
      )
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API03 bindings ----------
  r.post('/coach/invitations', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx((state) =>
        bindingService.createInvitation(state, req.actor)
      )
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/invitations/preview', authRequired, (req, res, next) => {
    try {
      ok(res, bindingService.previewInvitation(req.app.locals.store.state, req.query.token))
    } catch (e) {
      next(e)
    }
  })

  r.post('/bindings/accept', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx((state) =>
        bindingService.acceptBinding(state, {
          token: req.body.token,
          studentUser: req.actor,
          scopes: req.body.scopes
        })
      )
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.delete('/bindings/:id', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx((state) =>
        bindingService.unbind(state, req.params.id, req.actor.userId)
      )
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.patch('/bindings/:id/scopes', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx((state) =>
        bindingService.updateScopes(state, req.params.id, req.body.scopes, req.actor.userId)
      )
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/coach/students', authRequired, (req, res, next) => {
    try {
      ok(res, bindingService.listBoundStudents(req.app.locals.store.state, req.actor.userId))
    } catch (e) {
      next(e)
    }
  })

  r.post('/media/access', authRequired, (req, res, next) => {
    try {
      ok(
        res,
        bindingService.requestMediaAccess(req.app.locals.store.state, {
          assetId: req.body.assetId,
          subjectId: req.body.subjectId,
          viewerId: req.actor.userId,
          purpose: req.body.purpose
        })
      )
    } catch (e) {
      next(e)
    }
  })

  // ---------- API04–05 availability / slots ----------
  r.get('/coaches/:id/availability', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const out = await unwrap(bookingService.getAvailability(app, req.params.id))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.patch('/coaches/:id/availability', authRequired, idempotency(), async (req, res, next) => {
    try {
      const coachId = req.params.id
      const mine =
        req.actor.coachProfile && req.actor.coachProfile.coachId === coachId
      if (!mine || !hasRole(req.actor, 'coach')) {
        throw new AppError('FORBIDDEN', '仅本人教练可写排班')
      }
      const data = await req.app.locals.store.tx(async (state) => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          bookingService.patchAvailability(app, coachId, {
            rules: req.body.rules,
            baseRevision: req.body.base_revision,
            actorUserId: req.actor.userId
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/coaches/:id/exceptions', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          bookingService.addException(app, {
            coachId: req.params.id,
            startAt: req.body.startAt,
            endAt: req.body.endAt,
            type: req.body.type,
            reason: req.body.reason
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/coaches/:id/slots', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const out = await unwrap(
        bookingService.getSlots(app, {
          coachId: req.params.id,
          fromDate: req.query.from,
          toDate: req.query.to,
          courseTypeId: req.query.course_type
        })
      )
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API06–10 bookings ----------
  r.post('/bookings', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          bookingService.createBooking(app, {
            coachId: req.body.coach_id || req.body.coachId,
            studentId: req.actor.userId,
            studentName: req.actor.displayName,
            startAt: req.body.start_at || req.body.startAt,
            courseTypeId: req.body.course_type_id || req.body.courseTypeId,
            acceptedRulesVersion:
              req.body.accepted_rules_version || req.body.acceptedRulesVersion
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/bookings', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const filter = {}
      if (req.query.coach_id) filter.coachId = req.query.coach_id
      if (req.query.student_id) filter.studentId = req.query.student_id
      if (req.query.status) filter.status = String(req.query.status).split(',')
      if (req.query.date) filter.dateKey = req.query.date
      // 默认只看自己相关
      if (!filter.coachId && !filter.studentId) {
        if (hasRole(req.actor, 'coach') && req.actor.coachProfile) {
          filter.coachId = req.actor.coachProfile.coachId
        } else {
          filter.studentId = req.actor.userId
        }
      }
      const out = await unwrap(bookingService.listBookings(app, filter))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/bookings/:id', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const out = await unwrap(bookingService.getBooking(app, req.params.id))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/bookings/:id/accept', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await decideBookingRoute(req, 'accept')
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/bookings/:id/reject', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await decideBookingRoute(req, 'reject')
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/bookings/:id/cancel', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const role = hasRole(req.actor, 'coach') ? 'coach' : 'student'
        const out = await unwrap(
          bookingService.cancelBooking(app, req.params.id, {
            actorId: req.actor.userId,
            role,
            reason: req.body.reason,
            revision: req.body.revision || req.headers['if-match']
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/bookings/:id/changes', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          bookingService.requestChange(app, req.params.id, {
            proposedStart: req.body.proposed_start || req.body.proposedStart,
            courseTypeId: req.body.course_type_id,
            actorId: req.actor.userId
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post(
    '/booking-changes/:id/decision',
    authRequired,
    idempotency(),
    async (req, res, next) => {
      try {
        const data = await req.app.locals.store.tx(async () => {
          const app = asApp(req.app.locals.store)
          const coachId =
            (req.actor.coachProfile && req.actor.coachProfile.coachId) || null
          const out = await unwrap(
            bookingService.decideChange(app, req.params.id, {
              action: req.body.action,
              coachId
            })
          )
          return out.data
        })
        ok(res, data)
      } catch (e) {
        next(e)
      }
    }
  )

  r.get('/booking-changes/pending', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const coachId = req.actor.coachProfile && req.actor.coachProfile.coachId
      const out = await unwrap(bookingService.listPendingChanges(app, coachId))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/bookings/:id/attendance', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const coachId = req.actor.coachProfile && req.actor.coachProfile.coachId
        const out = await unwrap(
          bookingService.setAttendance(app, req.params.id, {
            status: req.body.status,
            note: req.body.note,
            coachId
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API11 timeline（简化：会话+日记标记）----------
  r.get('/students/:id/timeline', authRequired, async (req, res, next) => {
    try {
      const studentId = req.params.id
      assertSelfOrCoach(req, studentId)
      const app = asApp(req.app.locals.store)
      const sessions = await unwrap(
        trainingService.listSessions(app, { studentId, status: ['completed'] })
      )
      ok(res, { sessions: sessions.data || [] })
    } catch (e) {
      next(e)
    }
  })

  // ---------- API12–14 sessions ----------
  r.post('/sessions', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        if (req.body.source_type === 'coach_post_session' || req.body.coachDraft) {
          const out = await unwrap(
            trainingService.createCoachDraftSession(app, {
              studentId: req.body.student_id,
              studentName: req.body.student_name,
              coachId: req.actor.userId,
              title: req.body.title,
              bookingId: req.body.booking_id
            })
          )
          return out.data
        }
        throw new AppError('VALIDATION', '请使用 /plans/{id}/start-session 开练')
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/sessions', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const filter = {
        studentId: req.query.student_id || req.actor.userId,
        status: req.query.status ? String(req.query.status).split(',') : undefined
      }
      if (filter.studentId !== req.actor.userId) {
        assertCoachReadStudent(req.app.locals.store.state, req.actor.userId, filter.studentId)
      }
      const out = await unwrap(trainingService.listSessions(app, filter))
      let list = out.data || []
      if (filter.studentId !== req.actor.userId) {
        // 教练：只能看已同步 / 已完成；私人备注在详情层剥离
        list = list.filter((s) => s.shared_at || s.status === 'completed')
      } else {
        // 学员：看不到教练未同步的课后表草稿（AC15）
        list = list.filter((s) => {
          if (s.source_type === 'coach_post_session' && !s.shared_at) return false
          return true
        })
      }
      ok(res, list)
    } catch (e) {
      next(e)
    }
  })

  r.get('/sessions/:id', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const out = await unwrap(trainingService.getSession(app, req.params.id))
      const s = out.data
      const isOwnerStudent = s.student_id === req.actor.userId
      const isOwnerCoach = s.coach_id === req.actor.userId
      if (!isOwnerStudent && !isOwnerCoach) {
        assertCoachReadStudent(req.app.locals.store.state, req.actor.userId, s.student_id)
        if (!s.shared_at && s.status !== 'completed') {
          throw new AppError('FORBIDDEN', '草稿未同步')
        }
      }
      // 非创建教练读取时剥离私人备注（AC15）
      if (!isOwnerCoach && s.coach_id) {
        s.private_note = undefined
        s.privateNote = undefined
      }
      // 学员不可读未同步教练草稿
      if (isOwnerStudent && s.source_type === 'coach_post_session' && !s.shared_at) {
        throw new AppError('FORBIDDEN', '教练尚未同步该记录')
      }
      ok(res, s)
    } catch (e) {
      next(e)
    }
  })

  r.patch('/sessions/:id', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const cur = await unwrap(trainingService.getSession(app, req.params.id))
        assertSessionEditor(req, cur.data)
        if (req.body.base_revision != null && req.body.base_revision !== cur.data.revision) {
          throw new AppError('REVISION_CONFLICT', '记录已被更新', {
            extra: { latest_revision: cur.data.revision }
          })
        }
        const out = await unwrap(
          trainingService.patchSessionMeta(app, req.params.id, req.body)
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/sessions/:id/exercises', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const cur = await unwrap(trainingService.getSession(app, req.params.id))
        assertSessionEditor(req, cur.data)
        const out = await unwrap(
          trainingService.addExercise(app, req.params.id, req.body)
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.delete('/sessions/:id/exercises/:exerciseId', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const cur = await unwrap(trainingService.getSession(app, req.params.id))
        assertSessionEditor(req, cur.data)
        const out = await unwrap(
          trainingService.removeExercise(app, req.params.id, req.params.exerciseId)
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.patch('/sessions/:id/sets/:setId', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const cur = await unwrap(trainingService.getSession(app, req.params.id))
        assertSessionEditor(req, cur.data)
        let out
        out = await unwrap(
          trainingService.updateActualSet(app, req.params.id, req.params.setId, req.body)
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/sessions/:id/finalize', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const cur = await unwrap(trainingService.getSession(app, req.params.id))
        assertSessionEditor(req, cur.data)
        if (
          req.body.base_revision != null &&
          Number(req.body.base_revision) !== cur.data.revision
        ) {
          throw new AppError('REVISION_CONFLICT', '记录已被更新', {
            extra: { latest_revision: cur.data.revision }
          })
        }
        const out = await unwrap(
          trainingService.finalizeSession(app, req.params.id, {
            share: req.body.share !== false,
            completionKey: req.body.completion_key || req.body.completionKey,
            actorRole: hasRole(req.actor, 'coach') ? 'coach' : 'student'
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/sessions/:id/abandon', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(trainingService.abandonSession(app, req.params.id))
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/sessions/:id/parse-text', authRequired, async (req, res, next) => {
    try {
      const parsed = structureText(req.body.text || '', {
        taskId: 'text_' + Date.now()
      })
      ok(res, parsed)
    } catch (e) {
      next(e)
    }
  })

  // ---------- 语音任务（7.3 / AC11–14）----------
  r.get('/voice/providers', authRequired, (req, res) => {
    ok(res, {
      active: process.env.VOICE_ASR_PROVIDER || 'mock',
      providers: listProviders()
    })
  })

  r.post('/sessions/:id/voice-tasks', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async (state) => {
        const app = asApp(req.app.locals.store)
        const cur = await unwrap(trainingService.getSession(app, req.params.id))
        assertSessionEditor(req, cur.data)
        return voiceTaskService.createTask(state, app, req.params.id, req.actor, req.body || {})
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/sessions/:id/voice-tasks', authRequired, (req, res, next) => {
    try {
      ok(res, voiceTaskService.listTasks(req.app.locals.store.state, req.params.id))
    } catch (e) {
      next(e)
    }
  })

  r.get('/sessions/:id/voice-tasks/:taskId', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const data = await voiceTaskService.getTask(
        req.app.locals.store.state,
        app,
        req.params.taskId
      )
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post(
    '/sessions/:id/voice-tasks/:taskId/merge',
    authRequired,
    idempotency(),
    async (req, res, next) => {
      try {
        const data = await req.app.locals.store.tx(async (state) => {
          const app = asApp(req.app.locals.store)
          const cur = await unwrap(trainingService.getSession(app, req.params.id))
          assertSessionEditor(req, cur.data)
          return voiceTaskService.mergeTask(
            state,
            app,
            req.params.id,
            req.params.taskId,
            req.body || {},
            req.actor
          )
        })
        ok(res, data)
      } catch (e) {
        next(e)
      }
    }
  )

  r.post('/sessions/:id/voice-tasks/undo-merge', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async (state) => {
        const app = asApp(req.app.locals.store)
        const cur = await unwrap(trainingService.getSession(app, req.params.id))
        assertSessionEditor(req, cur.data)
        return voiceTaskService.undoLastMerge(state, app, req.params.id, req.actor)
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API15–17 plans ----------
  r.get('/plans', authRequired, async (req, res, next) => {
    try {
      const studentId = req.query.student_id || req.actor.userId
      if (studentId !== req.actor.userId) {
        assertCoachReadStudent(req.app.locals.store.state, req.actor.userId, studentId)
      }
      const app = asApp(req.app.locals.store)
      const out = await unwrap(trainingService.listPlansForStudent(app, studentId))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/plans/:id', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const out = await unwrap(trainingService.getPlan(app, req.params.id))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/plans/:id/publish', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          trainingService.publishPlan(app, req.params.id, {
            version: req.body.version || req.body.base_revision,
            reviewConfirmation: req.body.review_confirmation !== false
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.patch('/plans/:id/draft', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          trainingService.updatePlanDraft(app, req.params.id, req.body)
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/plans/:id/start-session', authRequired, idempotency(), async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          trainingService.startSessionFromPlan(app, req.params.id, {
            studentId: req.actor.userId,
            idempotencyKey: req.headers['idempotency-key']
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/plans/ensure-default', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        return trainingService.ensureDefaultPublishedPlan(app, {
          studentId: req.actor.userId,
          authorId: req.actor.userId,
          authorRole: 'student'
        })
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API18–21 diary / shares / feedback ----------
  r.get('/daily-logs', authRequired, async (req, res, next) => {
    try {
      const studentId = req.query.student_id || req.actor.userId
      const date = req.query.date || time.todayKey()
      const app = asApp(req.app.locals.store)
      if (studentId === req.actor.userId) {
        const out = await unwrap(diaryService.getDailyView(app, studentId, date))
        return ok(res, out.data)
      }
      assertCoachReadStudent(req.app.locals.store.state, req.actor.userId, studentId)
      const out = await unwrap(
        diaryService.getSharedDailyForCoach(app, req.actor.userId, studentId, date)
      )
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.put('/daily-logs/:date/state', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const date = req.params.date
        if (req.body.restDay != null) {
          const out = await unwrap(
            diaryService.setRestDay(app, req.actor.userId, date, !!req.body.restDay, req.body.note)
          )
          return out.data
        }
        const out = await unwrap(
          diaryService.upsertBodyState(app, req.actor.userId, date, req.body)
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/meals', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          diaryService.addMeal(app, {
            studentId: req.actor.userId,
            localDate: req.body.localDate || req.body.date,
            mealType: req.body.mealType,
            foodText: req.body.foodText,
            portionText: req.body.portionText
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.delete('/meals/:id', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          diaryService.deleteMeal(app, req.params.id, req.actor.userId)
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/waters', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          diaryService.addWater(
            app,
            req.actor.userId,
            req.body.localDate || req.body.date,
            req.body.amountMl
          )
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/shares', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          diaryService.shareDayCategory(
            app,
            req.actor.userId,
            req.body.localDate || req.body.date,
            req.body.category
          )
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.delete('/shares', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          diaryService.revokeDayCategory(
            app,
            req.actor.userId,
            req.query.date || req.body.date,
            req.query.category || req.body.category
          )
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/feedback', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx(async () => {
        const studentId = req.body.student_id
        assertCoachReadStudent(req.app.locals.store.state, req.actor.userId, studentId)
        const app = asApp(req.app.locals.store)
        const out = await unwrap(
          diaryService.addFeedback(app, {
            authorId: req.actor.userId,
            authorName: req.actor.displayName,
            targetType: req.body.target_type || 'daily_log',
            targetId: req.body.target_id,
            studentId,
            text: req.body.text
          })
        )
        return out.data
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/feedback', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const out = await unwrap(
        diaryService.listFeedback(app, {
          studentId: req.query.student_id,
          targetId: req.query.target_id
        })
      )
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/calendar/markers', authRequired, async (req, res, next) => {
    try {
      const studentId = req.query.student_id || req.actor.userId
      if (studentId !== req.actor.userId) {
        assertCoachReadStudent(req.app.locals.store.state, req.actor.userId, studentId)
      }
      const app = asApp(req.app.locals.store)
      const out = await unwrap(
        diaryService.getCalendarMarkers(
          app,
          studentId,
          req.query.from,
          req.query.to
        )
      )
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API22 exercises ----------
  r.get('/exercises', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const out = await unwrap(exerciseService.listExercises(app, req.query))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  r.get('/exercises/:id', authRequired, async (req, res, next) => {
    try {
      const app = asApp(req.app.locals.store)
      const out = await unwrap(exerciseService.getExercise(app, req.params.id))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API29 growth ----------
  r.get('/growth/summary', authRequired, async (req, res, next) => {
    try {
      const studentId = req.query.student_id || req.actor.userId
      if (studentId !== req.actor.userId) {
        assertCoachReadStudent(req.app.locals.store.state, req.actor.userId, studentId)
      }
      const app = asApp(req.app.locals.store)
      const range = {}
      if (req.query.from) range.from = req.query.from
      if (req.query.to) range.to = req.query.to
      const out = await unwrap(growthService.getSummary(app, studentId, range))
      ok(res, out.data)
    } catch (e) {
      next(e)
    }
  })

  // ---------- API31 notifications ----------
  r.get('/notifications', authRequired, (req, res) => {
    const list = (req.app.locals.store.state.notifications || []).filter(
      (n) => n.userId === req.actor.userId
    )
    ok(res, list)
  })

  r.patch('/notifications/:id', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx((state) => {
        const n = (state.notifications || []).find(
          (x) => x.id === req.params.id && x.userId === req.actor.userId
        )
        if (!n) throw new AppError('NOT_FOUND', '通知不存在')
        if (req.body.read) n.readAt = time.nowMs()
        return n
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  r.post('/notifications/demo', authRequired, async (req, res, next) => {
    try {
      const data = await req.app.locals.store.tx((state) => {
        if (!state.notifications) state.notifications = []
        const n = {
          id: makeId('ntf'),
          userId: req.actor.userId,
          title: req.body.title || '系统通知',
          body: req.body.body || '',
          createdAt: time.nowMs(),
          readAt: null
        }
        state.notifications.push(n)
        return n
      })
      ok(res, data)
    } catch (e) {
      next(e)
    }
  })

  return r
}

async function decideBookingRoute(req, action) {
  return req.app.locals.store.tx(async () => {
    const app = asApp(req.app.locals.store)
    const coachId = req.actor.coachProfile && req.actor.coachProfile.coachId
    const out = await unwrap(
      bookingService.decideBooking(app, req.params.id, {
        action,
        reason: req.body.reason,
        revision: req.body.revision || req.headers['if-match'],
        coachUserId: req.actor.userId,
        coachId
      })
    )
    return out.data
  })
}

function assertSelfOrCoach(req, studentId) {
  if (req.actor.userId === studentId) return
  assertCoachReadStudent(req.app.locals.store.state, req.actor.userId, studentId)
}

function assertSessionEditor(req, session) {
  if (session.student_id === req.actor.userId) return
  if (session.coach_id === req.actor.userId) return
  throw new AppError('FORBIDDEN', '无权编辑该训练')
}

module.exports = { buildRouter }
