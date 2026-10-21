const { it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const bodyApi = require('../../miniprogram/services/bodyMeasurementApi')

function setup(query = { key: 'waist', date: '2026-10-01' }) {
  let page, request, back = 0, confirm = false
  const api = Object.assign({}, bodyApi, {
    list: async () => ({ data: [{ date: '2026-10-01', values: { weight: 70, waist: 80 }, revision: 3 }] }),
    append: async (date, time, values, key) => { request = { date, time, values: JSON.parse(JSON.stringify(values)), key } }
  })
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/body-record/index.js'), 'utf8'), {
    Page: value => { page = value }, getApp: () => ({ globalData: { session: { user: { userId: 'student' } } }, toast() {} }),
    wx: { navigateBack: () => { back++ }, showModal: opts => opts.success({ confirm }) },
    require: id => id.includes('guard') ? { requireLogin: () => true } : id.includes('time') ? { todayKey: () => '2026-10-21', formatHm: () => '09:30' } : api
  })
  page.setData = values => Object.assign(page.data, values)
  page.onLoad(query)
  return { page, api, request: () => request, back: () => back, confirm: value => { confirm = value } }
}

it('single-metric recording appends only the selected field with an explicit measurement time', async () => {
  const ctx = setup(), page = ctx.page
  await page.reload()
  assert.equal(page.data.value, '')
  assert.ok(page.data.previous.includes('80'))
  page.onInput({ detail: { value: '79.5' } })
  await page.onSave()
  assert.equal(ctx.request().date, '2026-10-21')
  assert.equal(ctx.request().time, '09:30')
  assert.deepEqual(ctx.request().values, { waist: 79.5 })
  assert.ok(ctx.request().key)
  assert.equal(ctx.back(), 1)
})

it('unsaved input and request identity survive cancelled metric switches and a failed retry', async () => {
  const ctx = setup(), page = ctx.page
  await page.reload()
  page.onInput({ detail: { value: '79' } })
  page.onMetric({ detail: { value: 0 } })
  assert.equal(page.data.metric.key, 'waist')
  assert.equal(page.data.value, '79')
  const originalKey = page.intentKey
  ctx.api.append = async () => { throw { code: 'NETWORK' } }
  await page.onSave()
  assert.equal(page.intentKey, originalKey)
  assert.equal(page.data.saving, false)
  assert.equal(page.data.value, '79')
  assert.equal(ctx.back(), 0)
})

it('weight entered in jin is stored in canonical kilograms', async () => {
  const ctx = setup({ key: 'weight', unit: 'jin' }), page = ctx.page
  await page.reload()
  assert.equal(page.data.displayUnit, '斤')
  page.onInput({ detail: { value: '140.5' } })
  await page.onSave()
  assert.deepEqual(ctx.request().values, { weight: 70.25 })
})
