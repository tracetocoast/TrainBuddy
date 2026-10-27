const { it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { MemoryStore, emptyState } = require('../src/store/memoryStore')
const { canonical, hash, inspect, sanitizeSessions, importJson } = require('../src/store/importJson')

it('corrupt JSON refuses startup and never replaces the source file', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-corrupt-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'store.json'); fs.writeFileSync(file, '{broken')
  assert.throws(() => new MemoryStore(file), /STORE_READ_FAILED/)
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken')
})

it('failed JSON transactions roll back memory and prevent intermediate persist from reaching disk', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-rollback-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'store.json'), store = new MemoryStore(file)
  store.persist(); const before = fs.readFileSync(file, 'utf8')
  await assert.rejects(store.tx(state => { state.users.push({ userId: 'partial' }); store.persist(); throw new Error('failure') }))
  assert.equal(store.state.users.length, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
  await store.tx(state => { state.users.push({ userId: 'committed' }) })
  assert.equal(new MemoryStore(file).state.users[0].userId, 'committed')
})

it('import dry-run preserves unknown data and counts without exposing session tokens or mutating source', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-import-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const state = emptyState(); state.seeded = true
  state.sessions['never-print-this-token'] = { userId: 'sample' }
  state.futureExtension = { preserved: ['original'] }; state.idempotency.login = { response: { sessionToken: 'old' } }
  const file = path.join(dir, 'store.json'); fs.writeFileSync(file, JSON.stringify(state)); const before = fs.readFileSync(file)
  const report = await importJson(null, file)
  assert.equal(report.source_sha256, hash(before))
  assert.equal(report.invalidated_sessions, 1)
  assert.equal(JSON.stringify(report).includes('never-print-this-token'), false)
  const clean = sanitizeSessions(state)
  assert.deepEqual(clean.futureExtension, state.futureExtension)
  assert.deepEqual(clean.sessions, {})
  assert.deepEqual(clean.idempotency, {})
  assert.equal(state.sessions['never-print-this-token'].userId, 'sample')
  assert.deepEqual(fs.readFileSync(file), before)
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }))
  assert.throws(() => inspect({ ...state, users: [{ userId: 'duplicate' }, { userId: 'duplicate' }] }), /INVALID_USER_IDS/)
})
