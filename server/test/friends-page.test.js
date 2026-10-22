const { it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const time = require('../../miniprogram/utils/time')

function setup() {
  let page
  const api = {
    list: async () => ({ data: [{ id: 'a', name: '朋友甲', days: [] }, { id: 'b', name: '朋友乙', days: [] }] }),
    training: async () => ({ data: { sessions: [], received: [] } })
  }
  const app = { globalData: { session: { user: { userId: 'me' } } }, toast() {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/friends/index.js'), 'utf8'), {
    Page: value => { page = value }, getApp: () => app,
    require: id => id.includes('guard') ? { requireLogin: () => true } : id.includes('friendApi') ? api : time
  })
  page.setData = patch => {
    for (const [key, value] of Object.entries(patch)) {
      if (key.startsWith('drafts.')) page.data.drafts[key.slice(7)] = value
      else page.data[key] = value
    }
  }
  return { page, api }
}

it('friend comment failure retains the draft and retry identity; repeated taps are single-flight', async () => {
  const { page, api } = setup()
  let reject, failure = true
  const keys = []
  api.comment = (id, session, text, key) => {
    keys.push(key)
    return failure ? new Promise((resolve, no) => { reject = no }) : Promise.resolve({ data: {} })
  }
  page.setData({ selectedId: 'a', drafts: { workout: '稳步进步，加油！' } })
  const event = { currentTarget: { dataset: { id: 'workout' } } }
  const first = page.onComment(event)
  await page.onComment(event)
  assert.equal(keys.length, 1)
  reject(new Error('network'))
  await first
  assert.equal(page.data.drafts.workout, '稳步进步，加油！')
  failure = false
  await page.onComment(event)
  assert.equal(keys[0], keys[1])
  assert.equal(page.data.drafts.workout, '')
  assert.equal(page.data.busy, false)
})

it('a slow previous friend feed cannot replace the selected friend', async () => {
  const { page, api } = setup()
  let resolveA
  api.training = async id => id === 'a' ? new Promise(resolve => { resolveA = resolve }) : { data: { sessions: [{ id: 'b-workout', exercises: [], comments: [] }], received: [] } }
  const first = page.reload()
  await new Promise(resolve => setImmediate(resolve))
  page.setData({ selectedId: 'b' })
  await page.reload()
  resolveA({ data: { sessions: [{ id: 'a-workout' }], received: [] } })
  await first
  assert.equal(page.data.selected.id, 'b')
  assert.equal(page.data.sessions[0].id, 'b-workout')
})

it('acceptance requires a reviewed invitation; fetching a preview alone never binds a friend', async () => {
  const { page, api } = setup()
  let accepted = 0
  api.preview = async code => ({ data: { name: '朋友甲' } })
  api.accept = async code => { accepted++; return { data: { id: 'a' } } }
  await page.onAccept()
  assert.equal(accepted, 0)
  page.setData({ code: '1234567890' })
  await page.onPreview()
  assert.equal(accepted, 0)
  assert.equal(page.data.preview.name, '朋友甲')
  await page.onAccept()
  assert.equal(accepted, 1)
  assert.equal(page.data.preview, null)
})
