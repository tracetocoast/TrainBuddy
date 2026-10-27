const { it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const yaml = require('yaml')
const { build, validate } = require('../../scripts/build-miniprogram-config')
const { findings } = require('../scripts/scan-secrets')

it('Compose keeps database and API private, requires healthy dependencies and retains data volumes', () => {
  const compose = yaml.parse(fs.readFileSync(path.join(__dirname, '../../deploy/compose.yaml'), 'utf8'))
  assert.equal(compose.services.db.ports, undefined)
  assert.equal(compose.services.api.ports, undefined)
  assert.equal(compose.networks.database.internal, true)
  assert.ok(compose.services.db.volumes.some(value => value.startsWith('pgdata:')))
  assert.equal(compose.services.api.depends_on.migrate.condition, 'service_completed_successfully')
  assert.equal(compose.services.api.read_only, true)
  assert.equal(compose.services.api.environment.STORE_DRIVER, 'postgres')
  assert.equal(compose.services.api.environment.PAYMENT_ENABLED, 'false')
  assert.equal(compose.services.backup.healthcheck.retries, 1)
})
it('release API configuration requires HTTPS without credentials, local addresses or silent fallback', () => {
  for (const url of ['http://api.example.com/api/v1', 'https://127.0.0.1/api/v1', 'https://localhost/api/v1', 'https://user:password@api.example.com/api/v1', 'https://api.example.com/api/v1?key=secret']) assert.throws(() => validate(url, true))
  assert.equal(build({ MINIPROGRAM_RELEASE_API_BASE_URL: 'https://api.example.com/api/v1' }).release, 'https://api.example.com/api/v1')
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../miniprogram/config.js'), 'utf8'), {
    module, require: () => ({ develop: 'http://localhost:8787/api/v1', release: '' }), wx: { getAccountInfoSync: () => ({ miniProgram: { envVersion: 'release' } }) }
  })
  assert.throws(() => module.exports.API_BASE_URL, /HTTPS API/)
  assert.equal(module.exports.ALLOW_DEMO_LOGIN, false)
})
it('secret scanner detects common token formats without including values in its finding model', () => {
  const token = 'sk-' + 'A'.repeat(40)
  assert.deepEqual(findings('line\n' + token), [2])
  assert.deepEqual(findings('API_KEY=${API_KEY}\nDATABASE_URL='), [])
})
