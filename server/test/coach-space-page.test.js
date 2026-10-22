const { it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const time = require('../../miniprogram/utils/time')

function setup() {
  let page
  const app = { globalData: { role: 'student', session: { user: { userId: 'student' } } }, toast() {} }
  const binding = { coachUserId: 'coach', coachName: '林教练', scopes: { meal: true } }
  const diary = {
    getDailyView: async () => ({ data: { meals: [{ id: 'meal', mealType: 'lunch', foodText: '午餐' }], shares: {} } }),
    listFeedback: async () => ({ data: [] }),
    shareDayCategory: async () => {}, revokeDayCategory: async () => {}
  }
  const training = { listSessions: async () => ({ data: [
    { session_id: 'visible', source_type: 'coach_post_session', shared_at: 1, coach_id: 'coach', business_date: '2026-10-22', public_note: '注意稳定', exercises: [{ id: 'ex', name: '卧推', sets: [{ id: 'set', setNo: 1, actualWeight: 0, actualReps: 5, state: 'done' }] }] },
    { session_id: 'draft', source_type: 'coach_post_session', coach_id: 'coach' },
    { session_id: 'old-coach', source_type: 'coach_post_session', shared_at: 1, coach_id: 'previous' },
    { session_id: 'self', source_type: 'self', shared_at: 1 }
  ] }) }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/coach/index.js'), 'utf8'), {
    Page: value => { page = value }, getApp: () => app, wx: {},
    require: id => id.includes('guard') ? { requireLogin: () => true } : id.includes('bindingApi') ? { refreshMe: async () => ({ primaryBinding: binding }) } : id.includes('trainingApi') ? training : id.includes('diaryApi') ? diary : time
  })
  page.setData = patch => Object.assign(page.data, patch)
  page.setData({ localDate: '2026-10-22' })
  return { page, diary, training }
}

it('student coach hub shows only confirmed records from the current coach and retains zero weight', async () => {
  const { page } = setup()
  await page.reload()
  assert.equal(page.data.sessions.length, 1)
  assert.equal(page.data.sessions[0].note, '注意稳定')
  assert.equal(page.data.sessions[0].exercises[0].sets[0].weight, '0 kg')
  assert.equal(page.data.day.meals[0].label, '午餐')
  assert.equal(page.data.binding.initial, '林')
})

it('a slow previous date response cannot overwrite the newly selected date', async () => {
  const { page, diary } = setup()
  let resolveOld
  diary.getDailyView = async (app, owner, date) => date === '2026-10-22'
    ? new Promise(resolve => { resolveOld = resolve })
    : { data: { meals: [{ id: 'new', mealType: 'dinner' }], shares: {} } }
  const old = page.reload()
  await new Promise(resolve => setImmediate(resolve))
  page.setData({ localDate: '2026-10-21' })
  await page.reload()
  resolveOld({ data: { meals: [{ id: 'old' }], shares: {} } })
  await old
  assert.equal(page.data.day.meals[0].id, 'new')
})

it('failed data loads leave an explicit retry state instead of partial stale records', async () => {
  const { page, training } = setup()
  training.listSessions = async () => { throw new Error('连接失败') }
  await page.reload()
  assert.equal(page.data.error, '连接失败')
  assert.equal(page.data.loading, false)
  assert.equal(page.data.sessions.length, 0)
})

it('coach diet review uses the meal type and preserves its retry key and unsent text on failure', async () => {
  let page, failure = true
  const requests = []
  const app = { globalData: { session: { user: { userId: 'coach' } } }, toast() {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/student-profile/index.js'), 'utf8'), {
    Page: value => { page = value }, getApp: () => app,
    require: id => id.includes('diaryApi') ? { addFeedback: async (app, payload) => {
      requests.push(payload)
      if (failure) throw new Error('network')
      return { data: {} }
    } } : {}
  })
  page.setData = patch => Object.assign(page.data, patch)
  page.reload = () => {}
  page.setData({ studentId: 'student', localDate: '2026-10-22', mealFeedbackText: '午餐加入蔬菜', feedbackText: '其他草稿' })
  const event = { currentTarget: { dataset: { type: 'meal' } } }
  await page.onSubmitFeedback(event)
  assert.equal(page.data.mealFeedbackText, '午餐加入蔬菜')
  assert.equal(page.data.sendingFeedback, false)
  failure = false
  await page.onSubmitFeedback(event)
  assert.equal(requests[0].targetType, 'meal')
  assert.equal(requests[0].targetId, 'student|2026-10-22')
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey)
  assert.equal(page.data.mealFeedbackText, '')
  assert.equal(page.data.feedbackText, '其他草稿')
})
