const { it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const bodyApi = require('../../miniprogram/services/bodyMeasurementApi')

function setup() {
  let page, request, back = 0, confirm = false
  const api = Object.assign({}, bodyApi, {
    list: async () => ({ data: [{ date: '2026-10-01', values: { weight: 70, waist: 80 }, revision: 3 }] }),
    save: async (date, values, revision) => { request = { date, values: JSON.parse(JSON.stringify(values)), revision } }
  })
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/body-record/index.js'), 'utf8'), {
    Page: value => { page = value }, getApp: () => ({ globalData: { session: { user: { userId: 'student' } } }, toast() {} }),
    wx: { navigateBack: () => { back++ }, showModal: opts => opts.success({ confirm }) },
    require: id => id.includes('guard') ? { requireLogin: () => true } : id.includes('time') ? { todayKey: () => '2026-10-21' } : api
  })
  page.setData = values => Object.assign(page.data, values)
  page.onLoad({ key: 'waist', date: '2026-10-01' })
  return { page, api, request: () => request, back: () => back, confirm: value => { confirm = value } }
}

it('single-metric recording submits only the selected field with the loaded day revision', async () => {
  const ctx = setup(), page = ctx.page
  await page.reload()
  assert.equal(page.data.value, '80')
  page.onInput({ detail: { value: '79.5' } })
  await page.onSave()
  assert.deepEqual(ctx.request(), { date: '2026-10-01', values: { waist: 79.5 }, revision: 3 })
  assert.equal(ctx.back(), 1)
})

it('unsaved input survives cancelled metric switches and revision conflicts', async () => {
  const ctx = setup(), page = ctx.page
  await page.reload()
  page.onInput({ detail: { value: '79' } })
  page.onMetric({ detail: { value: 0 } })
  assert.equal(page.data.metric.key, 'waist')
  assert.equal(page.data.value, '79')
  ctx.api.save = async () => { throw { code: 'REVISION_CONFLICT' } }
  await page.onSave()
  assert.equal(page.data.conflict, true)
  assert.equal(page.data.value, '79')
  assert.equal(ctx.back(), 0)
})
