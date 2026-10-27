// Generated from public build-time environment variables, never from server secrets.
const endpoints = require('./config.generated')
function version() {
  if (typeof wx === 'undefined') return 'develop' // Node-only diagnostics, not a WeChat fallback.
  const value = wx.getAccountInfoSync().miniProgram.envVersion
  if (!['develop', 'trial', 'release'].includes(value)) throw new Error('无法确定小程序运行环境')
  return value
}
module.exports = {
  get API_BASE_URL() {
    const environment = version()
    const url = endpoints[environment]
    if (!url || (environment !== 'develop' && !/^https:\/\//.test(url))) throw new Error('当前小程序环境尚未配置 HTTPS API 地址')
    return url
  },
  get ALLOW_DEMO_LOGIN() { return version() === 'develop' },
  USE_REMOTE_API: true
}
