const { it } = require('node:test')
const assert = require('node:assert/strict')
const { createTestApp } = require('./helpers')
const { validateProduction, safeEqual } = require('../src/security/production')
const { exchangeCode } = require('../src/services/wechatLogin')
const { createSession, tokenHash } = require('../src/services/authService')

it('production configuration rejects JSON, mock providers, payment placeholders and missing secrets', () => {
  const env = { NODE_ENV: 'production', STORE_DRIVER: 'postgres', DATABASE_URL: 'postgres://test', WECHAT_APP_ID: 'app', WECHAT_APP_SECRET: 'test', ADMIN_API_KEY: 'x'.repeat(32), PRODUCTION_COMPAT_STORE_ACK: 'single-document-locking-reviewed' }
  assert.doesNotThrow(() => validateProduction(env))
  for (const change of [{ STORE_DRIVER: 'json' }, { DATABASE_URL: '' }, { WECHAT_APP_SECRET: '' }, { ADMIN_API_KEY: 'short' }, { AI_PROVIDER: 'mock' }, { PAYMENT_ENABLED: 'true' }, { PRODUCTION_COMPAT_STORE_ACK: '' }]) assert.throws(() => validateProduction({ ...env, ...change }))
  assert.equal(safeEqual('x'.repeat(32), 'x'.repeat(32)), true)
  assert.equal(safeEqual('wrong', 'x'.repeat(32)), false)
})

it('real WeChat exchange never accepts demo identities and discards upstream session_key and error details', async () => {
  let calls = 0
  const options = { env: { WECHAT_APP_ID: 'test-app', WECHAT_APP_SECRET: 'test-secret' }, fetch: async url => {
    calls++; assert.equal(url.origin, 'https://api.weixin.qq.com')
    return new Response(JSON.stringify({ openid: 'test-openid', session_key: 'never-return-this' }))
  } }
  for (const body of [{}, { code: 'ops_admin' }, { code: 'valid-code-123', claimRole: 'ops' }, { code: 'valid-code-123', accountKey: 'student_only' }]) await assert.rejects(exchangeCode(body, options))
  assert.equal(calls, 0)
  const identity = await exchangeCode({ code: 'valid-code-123' }, options)
  assert.deepEqual(identity, { subject: 'wx:test-app:test-openid' })
  await assert.rejects(exchangeCode({ code: 'valid-code-123' }, { ...options, fetch: async () => new Response(JSON.stringify({ errcode: 40029, errmsg: 'test-secret' })) }), error => !error.message.includes('test-secret'))
})

it('production login uses verified identities, hashes tokens, enforces roles/admin second factor and revokes sessions', async t => {
  const keyBefore = process.env.ADMIN_API_KEY
  process.env.ADMIN_API_KEY = 'test-admin-key-'.repeat(4)
  t.after(() => { if (keyBefore === undefined) delete process.env.ADMIN_API_KEY; else process.env.ADMIN_API_KEY = keyBefore })
  const ctx = createTestApp({ production: true, wechat: { env: { WECHAT_APP_ID: 'test-app', WECHAT_APP_SECRET: 'test-secret' }, fetch: async () => new Response(JSON.stringify({ openid: 'real-user', session_key: 'never-store' })) } })
  t.after(() => ctx.cleanup())
  assert.equal((await ctx.request('POST', '/api/v1/auth/wechat-session', { body: { accountKey: 'ops_admin' } })).status, 401)
  const login = await ctx.request('POST', '/api/v1/auth/wechat-session', { body: { code: 'verified-code-123' } })
  assert.equal(login.status, 200)
  const data = login.body.data, token = data.sessionToken
  assert.deepEqual(data.grantedRoles, ['student'])
  assert.equal(data.mockAccountKey, null)
  assert.equal(ctx.store.state.sessions[token], undefined)
  assert.ok(ctx.store.state.sessions[tokenHash(token)])
  assert.equal(JSON.stringify(ctx.store.state).includes('never-store'), false)
  ctx.store.state.sessions[tokenHash(token)].expiresAt = Date.now() - 1
  assert.equal((await ctx.request('GET', '/api/v1/me', { token })).status, 401)
  ctx.store.state.sessions[tokenHash(token)].expiresAt = Date.now() + 60000
  ctx.store.state.users.find(user => user.userId === data.user.userId).status = 'disabled'
  assert.equal((await ctx.request('GET', '/api/v1/me', { token })).status, 401)
  ctx.store.state.users.find(user => user.userId === data.user.userId).status = 'active'
  assert.equal((await ctx.request('GET', '/api/v1/admin/config', { token, headers: { 'x-admin-key': process.env.ADMIN_API_KEY } })).status, 403)
  const ops = createSession(ctx.store.state, 'u_ops_001')
  assert.equal((await ctx.request('GET', '/api/v1/admin/config', { token: ops })).status, 403)
  assert.equal((await ctx.request('GET', '/api/v1/admin/config', { token: ops, headers: { 'x-admin-key': process.env.ADMIN_API_KEY } })).status, 200)
  assert.equal((await ctx.request('GET', '/ops')).status, 404)
  for (const route of ['/ai/providers', '/media/cleanup-tasks/any', '/voice/providers', '/payments/status', '/AI/providers', '/Payments/status']) assert.equal((await ctx.request('GET', '/api/v1' + route, { token })).status, 503)
  assert.equal((await ctx.request('POST', '/api/v1/notifications/demo/', { token, body: {} })).status, 503)
  ctx.store.state.sessions['legacy-bearer'] = { userId: data.user.userId, expiresAt: Date.now() + 100000 }
  assert.equal((await ctx.request('GET', '/api/v1/me', { token: 'legacy-bearer' })).status, 401)
  const binding = require('../src/services/bindingService').acceptBinding(ctx.store.state, { token: 'LINYE7D', studentUser: data.user, scopes: { workout_self: true } })
  const coachToken = createSession(ctx.store.state, 'u_coach_001')
  const draft = { coachDraft: true, student_id: data.user.userId, title: 'Private session' }
  const headers = { 'Idempotency-Key': 'revocation-test' }
  assert.equal((await ctx.request('POST', '/api/v1/sessions', { token: coachToken, headers, body: draft })).status, 200)
  binding.status = 'ended'
  assert.equal((await ctx.request('POST', '/api/v1/sessions', { token: coachToken, headers, body: draft })).status, 403)
  assert.equal((await ctx.request('POST', '/api/v1/auth/logout', { token, body: {} })).status, 200)
  assert.equal((await ctx.request('GET', '/api/v1/me', { token })).status, 401)
})
