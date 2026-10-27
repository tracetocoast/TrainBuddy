const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
const { createApp } = require('../src/app')
const { MemoryStore } = require('../src/store/memoryStore')
const { seed } = require('../src/seed')
const time = require('../src/lib/time')
const config = require('../src/config')

function createTestApp(options = {}) {
  const file = path.join(
    os.tmpdir(),
    'tb_' + Date.now() + '_' + Math.random().toString(16).slice(2) + '.json'
  )
  const store = new MemoryStore(file)
  store.reset()
  seed(store)
  const app = createApp({ ...options, store })
  const server = http.createServer(app)
  let port
  const ready = new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port
      resolve()
    })
  })

  async function request(method, url, opts = {}) {
    await ready
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {}
    )
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token
    const r = await fetch('http://127.0.0.1:' + port + url, {
      method,
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    })
    const text = await r.text()
    let body
    try {
      body = JSON.parse(text)
    } catch (_) {
      body = text
    }
    return { status: r.status, body }
  }

  async function login(accountKey, claimRole) {
    const res = await request('POST', '/api/v1/auth/wechat-session', {
      body: { accountKey, claimRole }
    })
    if (res.status >= 400) {
      const err = new Error((res.body.error && res.body.error.message) || 'login fail')
      err.response = res
      throw err
    }
    return res.body.data
  }

  async function findOpenSlot(token, coachId) {
    const from = time.addDays(time.todayKey(), 2)
    const to = time.addDays(from, 5)
    const res = await request(
      'GET',
      `/api/v1/coaches/${coachId}/slots?from=${from}&to=${to}`,
      { token }
    )
    const slots = (res.body.data && res.body.data.slots) || []
    const open = slots.find((s) => s.status === 'open')
    if (!open) throw new Error('no open slot in range')
    return open
  }

  async function bindStudent(studentToken, scopes) {
    const res = await request('POST', '/api/v1/bindings/accept', {
      token: studentToken,
      body: {
        token: 'LINYE7D',
        scopes: scopes || {
          workout_self: true,
          meal: true,
          body_state: true,
          special: false
        }
      },
      headers: { 'Idempotency-Key': 'bind_' + Math.random() }
    })
    if (res.status >= 400) {
      const err = new Error(JSON.stringify(res.body))
      err.response = res
      throw err
    }
    return res.body.data
  }

  function cleanup() {
    return new Promise((resolve) => {
      server.close(() => {
        try {
          fs.unlinkSync(file)
        } catch (_) {}
        resolve()
      })
    })
  }

  return { app, store, request, login, findOpenSlot, bindStudent, cleanup, time, config }
}

module.exports = { createTestApp, time, config }
