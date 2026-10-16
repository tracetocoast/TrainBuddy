const http = require('../utils/http')

function getEntitlements() {
  return http.get('/entitlements').then((res) => res.data)
}

function getUsageLedger(query) {
  return http.get('/usage-ledger', query).then((res) => res.data)
}

function getPaymentStatus() {
  return http.get('/payments/status').then((res) => res.data)
}

/** 支付未开放时会失败；勿在正式路径当作成功 */
function checkout(body, idempotencyKey) {
  return http
    .post('/payments/checkout', body || {}, {
      idempotencyKey: idempotencyKey || 'pay_' + Date.now()
    })
    .then((res) => res.data)
}

module.exports = {
  getEntitlements,
  getUsageLedger,
  getPaymentStatus,
  checkout
}
