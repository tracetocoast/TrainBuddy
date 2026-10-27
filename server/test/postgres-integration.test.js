const { it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { Pool } = require('pg')
const { migrate } = require('../src/store/migrate')
const { importJson } = require('../src/store/importJson')
const { PostgresStore } = require('../src/store/postgresStore')
const { emptyState } = require('../src/store/memoryStore')
const { seed } = require('../src/seed')
const { createApp } = require('../src/app')
const time = require('../src/lib/time')

it('real PostgreSQL: migration verification, restart, rollback, cross-instance locks and HTTP idempotency', { skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL absent; real PostgreSQL was NOT tested' }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL)
  if (!url.pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL must name a disposable *_test database')
  const schema = 'tb_test_' + require('crypto').randomBytes(8).toString('hex')
  const admin = new Pool({ connectionString: url.toString() })
  await admin.query(`CREATE SCHEMA ${schema}`)
  const pool = new Pool({ connectionString: url.toString(), options: '-c search_path=' + schema, max: 8 })
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tb-pg-'))
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); await fs.rm(directory, { recursive: true, force: true }) })
  await migrate(pool); await migrate(pool)
  const fixture = { state: emptyState(), persist() {} }; seed(fixture)
  fixture.state.sessions.old = { userId: 'u_stu_001', expiresAt: Date.now() + 60000 }
  fixture.state.unknownExtension = { preserve: ['value'] }
  const file = path.join(directory, 'source.json')
  await fs.writeFile(file, JSON.stringify(fixture.state))
  await importJson(pool, file, 'apply')
  assert.equal((await importJson(pool, file, 'verify')).verified, true)
  await assert.rejects(importJson(pool, file, 'apply'), /TARGET_NOT_EMPTY/)
  const store = new PostgresStore(pool), other = new PostgresStore(pool)
  await store.transaction(() => { assert.deepEqual(store.state.sessions, {}); assert.deepEqual(store.state.unknownExtension, { preserve: ['value'] }) })
  await assert.rejects(store.tx(state => { state.counter = 100; store.persist(); throw new Error('rollback') }))
  await other.transaction(() => assert.equal(other.state.counter, undefined))
  await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? store : other).tx(async state => {
    const old = state.counter || 0; await new Promise(resolve => setTimeout(resolve, 5)); state.counter = old + 1
  })))
  await other.transaction(() => assert.equal(other.state.counter, 8))
  const server = http.createServer(createApp({ store }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1'
  const request = async (method, route, token, body, key) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json() }
  }
  const login = await request('POST', '/auth/wechat-session', null, { accountKey: 'student_only' })
  assert.equal(login.status, 200)
  const token = login.body.data.sessionToken
  assert.equal((await request('GET', '/me', token)).status, 200)
  assert.equal((await request('POST', '/bindings/accept', token, { token: 'LINYE7D', scopes: { workout_self: true } }, 'bind-test')).status, 200)
  const from = time.addDays(time.todayKey(), 2), to = time.addDays(from, 5)
  const slots = await request('GET', `/coaches/coach_001/slots?from=${from}&to=${to}`, token)
  const slot = slots.body.data.slots.find(row => row.status === 'open')
  assert.ok(slot)
  const booking = { coach_id: 'coach_001', course_type_id: 'private_strength_60', start_at: slot.start_at || slot.startAt, accepted_rules_version: require('../src/config').schedule.rulesVersion }
  const results = await Promise.all([request('POST', '/bookings', token, booking, 'booking-a'), request('POST', '/bookings', token, booking, 'booking-b')])
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409])
  const winner = results[0].status === 200 ? 0 : 1
  const repeated = await request('POST', '/bookings', token, booking, winner === 0 ? 'booking-a' : 'booking-b')
  assert.equal(repeated.status, 200)
  assert.equal(repeated.body.data.booking_id, results[winner].body.data.booking_id)
})
