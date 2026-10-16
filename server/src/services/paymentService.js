/**
 * 支付购买占位：默认关闭，未决策前不开放真实付款成功。
 * 不模拟「付款成功」发放权益——试用／补偿走运营后台。
 */

const config = require('../config')
const { AppError } = require('../lib/errors')

function getPaymentStatus() {
  return {
    payment_enabled: !!config.features.paymentEnabled,
    message: config.features.paymentEnabled
      ? '开关已开，但仍未接入真实支付渠道，checkout 仅返回占位'
      : '支付未决策：不开放真实付款。请通过运营发放试用额度。',
    providers: []
  }
}

function assertPaymentEnabled() {
  if (!config.features.paymentEnabled) {
    throw new AppError('FEATURE_DISABLED', '支付能力未开放，不能发起真实付款', {
      status: 403,
      extra: { payment_enabled: false }
    })
  }
}

/**
 * 即使开关打开，当前也不返回 paid 成功——避免假成功污染正式环境（AC37 精神）
 */
function createCheckout(actor, body) {
  assertPaymentEnabled()
  return {
    checkout_id: null,
    status: 'not_integrated',
    message: '支付渠道未接入，未产生订单，未扣款，未发放权益',
    requested_sku: body.sku || body.product_id || null,
    user_id: actor.userId
  }
}

function confirmPayment(_actor, _body) {
  assertPaymentEnabled()
  throw new AppError('FEATURE_DISABLED', '支付确认未接入，拒绝伪造成功', {
    status: 501
  })
}

module.exports = {
  getPaymentStatus,
  createCheckout,
  confirmPayment,
  assertPaymentEnabled
}
