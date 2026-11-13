const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '../../miniprogram')

function applyData(target, values) {
  Object.keys(values).forEach((key) => {
    const nested = /^(.+)\[(\d+)\]\.(.+)$/.exec(key)
    if (nested) {
      target[nested[1]][Number(nested[2])][nested[3]] = values[key]
      return
    }
    target[key] = values[key]
  })
}

function setupPlansPage() {
  let page
  const urls = []
  const source = fs.readFileSync(path.join(root, 'pages/plans/index.js'), 'utf8')
  vm.runInNewContext(source, {
    Page: (definition) => { page = definition },
    getApp: () => ({ globalData: { role: 'student', session: { user: { userId: 'u1' } } }, toast() {} }),
    wx: { getSystemInfoSync: () => ({ windowWidth: 375 }), navigateTo: (opt) => urls.push(opt.url) },
    require: (id) => {
      if (id.includes('guard')) return { requireLogin: () => true }
      if (id.includes('trainingApi')) return {}
      if (id.includes('planSchedule')) return require('../../miniprogram/utils/planSchedule')
      if (id.endsWith('/time')) return { todayKey: () => '2026-11-13' }
      throw new Error(id)
    }
  })
  page.setData = function (values) { applyData(this.data, values) }
  page.setData({
    plans: [{ plan_id: 'p1', can_edit: true, offset: 0, swiping: false }]
  })
  page._actionWidth = 48
  return { page, urls }
}

function touch(x, y, dataset) {
  return {
    currentTarget: { dataset },
    touches: [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }]
  }
}

test('plan cards do not catch vertical touchmove in JS, only lock scroll on horizontal axis via wxs', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/plans/index.wxml'), 'utf8')
  const wxs = wxml.match(/<wxs module="swipeAxis">([\s\S]*?)<\/wxs>/)?.[1] || ''
  assert.equal(wxml.includes('catchtouchmove="onSwipeMove"'), false)
  assert.equal(wxml.includes('bindtouchmove="onSwipeMove"'), false)
  assert.equal(wxml.includes('data-move-method="onSwipeMove"'), true)
  assert.equal(wxml.includes('data-snap-method="onSwipeSnap"'), true)
  assert.ok(wxs)
  assert.equal(wxml.includes('catchtouchmove="{{swipeAxis.move}}"'), false)
  assert.equal(wxml.includes('bindtouchmove="{{swipeAxis.move}}"'), true)
  assert.match(wxs, /callMethod\(method/)
  assert.match(wxs, /setStyle/)
  assert.match(wxs, /return false/)
})

test('plan editor set rows reuse the same vertical-scroll-safe swipe binding', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/plan-edit/index.wxml'), 'utf8')
  assert.equal(wxml.includes('catchtouchmove="onSetSwipeMove"'), false)
  assert.equal(wxml.includes('bindtouchmove="onSetSwipeMove"'), false)
  assert.equal(wxml.includes('data-move-method="onSetSwipeMove"'), true)
  assert.equal(wxml.includes('catchtouchmove="{{swipeAxis.move}}"'), false)
  assert.equal(wxml.includes('bindtouchmove="{{swipeAxis.move}}"'), true)
})

test('vertical swipe on a plan card does not open the delete action', () => {
  const { page } = setupPlansPage()
  const dataset = { canEdit: 1, index: 0 }
  page.onSwipeStart(touch(120, 80, dataset))
  page.onSwipeMove(touch(118, 160, dataset))
  page.onSwipeEnd()
  assert.equal(page.data.plans[0].offset, 0)
  assert.equal(page.data.plans[0].swiping, false)
})

test('horizontal swipe on a plan card reveals the delete action', () => {
  const { page } = setupPlansPage()
  const dataset = { canEdit: 1, index: 0 }
  page.onSwipeStart(touch(120, 80, dataset))
  page.onSwipeMove(touch(60, 82, dataset))
  page.onSwipeEnd()
  assert.equal(page.data.plans[0].offset, -48)
  assert.equal(page.data.plans[0].swiping, false)
})

test('plan list drops the default-leg template, keeps start on the right, and edits from swipe', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/plans/index.wxml'), 'utf8')
  assert.equal(wxml.includes('创建默认下肢计划'), false)
  assert.equal(wxml.includes('onEnsureDefault'), false)
  assert.equal(wxml.includes('class="swipe-edit"'), true)
  assert.equal(wxml.includes('catchtap="goEdit"'), true)
  assert.equal(wxml.includes('class="plan-cta"'), true)
  assert.equal(wxml.includes('catchtap="goStart"'), true)
  assert.equal(wxml.includes('bindtap="goView"'), true)
})

test('tapping a plan opens read-only details; swipe edit stays writable', () => {
  const { page, urls } = setupPlansPage()
  page.goView({ currentTarget: { dataset: { id: 'p1', index: 0 } } })
  page.goEdit({ currentTarget: { dataset: { id: 'p1' } } })
  assert.equal(urls[0], '/pages/plan-edit/index?id=p1&view=1')
  assert.equal(urls[1], '/pages/plan-edit/index?id=p1')
})

test('wxs snap keeps the edit and delete actions open', () => {
  const { page, urls } = setupPlansPage()
  page.onSwipeSnap({ index: 0, offset: -48 })
  assert.equal(page.data.plans[0].offset, -48)
  page.goView({ currentTarget: { dataset: { id: 'p1', index: 0 } } })
  assert.equal(urls.length, 0)
})
