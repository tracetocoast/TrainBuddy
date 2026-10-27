const fs = require('fs')
const path = require('path')
function validate(value, production) {
  if (!value) { if (production) throw new Error('Production API URL is required'); return '' }
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/\/api\/v1\/?$/.test(url.pathname)) throw new Error('Invalid API base URL')
  if (production && (url.protocol !== 'https:' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(':') || /(^localhost$|\.local$|\.internal$)/i.test(url.hostname) || !url.hostname.includes('.'))) throw new Error('Release/trial require a public HTTPS domain')
  return value.replace(/\/$/, '')
}
function build(env = process.env) {
  return {
    develop: validate(env.MINIPROGRAM_DEV_API_BASE_URL || 'http://127.0.0.1:8787/api/v1', false),
    trial: env.MINIPROGRAM_TRIAL_API_BASE_URL ? validate(env.MINIPROGRAM_TRIAL_API_BASE_URL, true) : '',
    release: env.MINIPROGRAM_RELEASE_API_BASE_URL ? validate(env.MINIPROGRAM_RELEASE_API_BASE_URL, true) : ''
  }
}
if (require.main === module) {
  try {
    const config = build()
    if (process.argv.includes('--release') && !config.release) throw new Error('MINIPROGRAM_RELEASE_API_BASE_URL required')
    fs.writeFileSync(path.join(__dirname, '../miniprogram/config.generated.js'), 'module.exports = ' + JSON.stringify(config, null, 2) + '\n')
    console.log('Public mini-program endpoint config generated; no secrets included.')
  } catch (_) { console.error('Invalid or missing mini-program API environment configuration'); process.exitCode = 1 }
}
module.exports = { build, validate }
