const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

test('Field Notes overrides a dark preference only on migrated pages and restores other pages', () => {
  const native = [], writes = []
  const context = { module: { exports: {} }, wx: {
    getStorageSync: () => 'dark', setStorageSync: (...args) => writes.push(args),
    setNavigationBarColor: value => native.push(value), setBackgroundColor() {}
  } }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/theme.js'), 'utf8'), context)
  const theme = context.module.exports
  const page = { data: { visualTheme: 'fieldNotes' }, setData(v) { Object.assign(this.data, v) } }
  theme.applyToPage(page)
  assert.equal(page.data.skinClass, '')
  assert.equal(page.data.pageBg, '#F8F5EF')
  assert.equal(native.at(-1).frontColor, '#000000')
  const other = { data: {}, setData: page.setData }
  theme.applyToPage(other)
  assert.equal(other.data.skinClass, 'skin-dark')
  assert.equal(native.at(-1).backgroundColor, '#0f1512')
  assert.equal(writes.length, 0)
})

test('report detail expansion only changes presentation, not the authorized report', () => {
  let config
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/training-report/index.js'), 'utf8'), {
    Page: value => { config = value }, require: () => ({})
  })
  config.setData = function(value) { Object.assign(this.data, value) }
  const report = { exercises: [{ id: 'e', sets: [{ weight: '未记录' }] }] }
  config.data.report = report
  config.onToggleSets()
  assert.equal(config.data.showSets, true)
  config.onToggleSets()
  assert.equal(config.data.showSets, false)
  assert.equal(config.data.report, report)
  assert.equal(report.exercises[0].sets[0].weight, '未记录')
})
