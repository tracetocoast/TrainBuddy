const config = require('../config')

function getToken() {
  try {
    const app = getApp()
    return (app.globalData.session && app.globalData.session.sessionToken) || ''
  } catch (e) {
    return ''
  }
}

/**
 * 统一 HTTP 客户端
 * - Authorization: Bearer <session>
 * - Idempotency-Key / If-Match 可选
 * 成功：{ data, request_id }
 * 失败：reject { code, message, retryable, status, fields }
 */
function request(method, path, options = {}) {
  if (!config.API_BASE_URL) return Promise.reject({ code: 'API_NOT_CONFIGURED', message: '当前环境尚未配置 HTTPS 服务地址', retryable: false })
  const requestToken = getToken()
  const url = config.API_BASE_URL.replace(/\/$/, '') + path
  const header = Object.assign(
    {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + requestToken
    },
    options.headers || {}
  )
  if (options.idempotencyKey) header['Idempotency-Key'] = options.idempotencyKey
  if (options.ifMatch != null) header['If-Match'] = String(options.ifMatch)

  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      header,
      data: options.body,
      timeout: options.timeout != null ? options.timeout : 60000,
      success(res) {
        const body = res.data || {}
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body)
          return
        }
        const err = (body && body.error) || {}
        // 只撤销发起本次请求的失效会话，避免旧请求清掉刚登录的新身份。
        if (res.statusCode === 401 && requestToken && path.indexOf('/auth/') !== 0) {
          const app = getApp()
          if (app.globalData.session && app.globalData.session.sessionToken === requestToken) {
            app.globalData.session = null
            app.globalData.grantedRoles = []
            app.globalData.role = 'student'
            app.globalData.activeSubjectId = null
            app.globalData.bindings = []
            app.globalData._meCache = null
            app.globalData._boundStudentsCache = []
            app.persist()
            wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
            wx.reLaunch({ url: '/pages/login/index' })
          }
        }
        reject({
          code: err.code || 'HTTP_' + res.statusCode,
          message: err.message || '请求失败',
          retryable: !!err.retryable,
          fields: err.fields,
          status: res.statusCode,
          request_id: body.request_id,
          extra: err
        })
      },
      fail(e) {
        reject({
          code: 'NETWORK',
          message: '无法连接服务器，请确认已启动 API（npm start）',
          retryable: true,
          raw: e
        })
      }
    })
  })
}

function get(path, query, options) {
  let url = path
  if (query) {
    const parts = []
    Object.keys(query).forEach((k) => {
      if (query[k] == null || query[k] === '') return
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]))
    })
    if (parts.length) url += (url.indexOf('?') >= 0 ? '&' : '?') + parts.join('&')
  }
  return request('GET', url, options)
}

function post(path, body, options) {
  return request('POST', path, Object.assign({}, options, { body }))
}

function patch(path, body, options) {
  return request('PATCH', path, Object.assign({}, options, { body }))
}

function del(path, options) {
  return request('DELETE', path, options)
}

module.exports = { request, get, post, patch, del }
