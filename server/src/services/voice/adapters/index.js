const mock = require('./mock')
const wechat = require('./wechat')

const REGISTRY = {
  mock,
  wechat
}

function getAdapter(name) {
  const key = (name || process.env.VOICE_ASR_PROVIDER || 'mock').toLowerCase()
  const adapter = REGISTRY[key]
  if (!adapter) {
    const err = new Error('未知转写适配器: ' + key)
    err.code = 'ASR_UNKNOWN_PROVIDER'
    throw err
  }
  return adapter
}

function listProviders() {
  return Object.keys(REGISTRY).map((k) => ({
    id: k,
    configured:
      k === 'mock' || (k === 'wechat' && !!process.env.WECHAT_ASR_ENDPOINT)
  }))
}

module.exports = { getAdapter, listProviders, REGISTRY }
