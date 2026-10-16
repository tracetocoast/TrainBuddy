/**
 * 通知 outbox（AC35）
 * 业务成功与渠道投递解耦：预约／记录成功后站内可查；投递失败入队列可重试。
 */

const time = require('../lib/time')
const { makeId } = require('../lib/ids')
const { AppError } = require('../lib/errors')

function ensureOutbox(state) {
  if (!state.outbox) state.outbox = []
  return state.outbox
}

function ensureNotifications(state) {
  if (!state.notifications) state.notifications = []
  return state.notifications
}

/**
 * 写入站内通知 + outbox 投递项
 * @param {{ failDelivery?: boolean }} opts 测试用：首投故意失败
 */
function enqueue(state, { userId, title, body, channel, template, payload, relatedType, relatedId, failDelivery }) {
  const notifications = ensureNotifications(state)
  const n = {
    id: makeId('ntf'),
    userId,
    title: title || '系统通知',
    body: body || '',
    createdAt: time.nowMs(),
    readAt: null,
    meta: {
      related_type: relatedType || null,
      related_id: relatedId || null
    }
  }
  notifications.push(n)

  const outbox = ensureOutbox(state)
  const item = {
    id: makeId('obx'),
    notificationId: n.id,
    userId,
    channel: channel || 'wechat_subscribe',
    template: template || 'generic',
    payload: payload || { title: n.title, body: n.body },
    relatedType: relatedType || null,
    relatedId: relatedId || null,
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: time.nowMs(),
    updatedAt: time.nowMs(),
    sentAt: null,
    /** 演示：可强制首投失败 */
    _forceFailOnce: !!failDelivery
  }
  outbox.push(item)

  // 尝试即时投递（失败不影响业务调用方）
  tryDeliver(state, item.id)
  return { notification: presentNotification(n), outbox: presentOutbox(item) }
}

function tryDeliver(state, outboxId) {
  const outbox = ensureOutbox(state)
  const item = outbox.find((x) => x.id === outboxId)
  if (!item) throw new AppError('NOT_FOUND', 'outbox 不存在')
  if (item.status === 'sent') return presentOutbox(item)

  item.attempts += 1
  item.updatedAt = time.nowMs()

  if (item._forceFailOnce) {
    item._forceFailOnce = false
    item.status = 'failed'
    item.lastError = 'MOCK_DELIVERY_FAILED'
    return presentOutbox(item)
  }

  // mock 渠道：默认成功
  item.status = 'sent'
  item.sentAt = time.nowMs()
  item.lastError = null
  return presentOutbox(item)
}

/** 运营／系统重试失败队列 */
function retry(state, outboxId) {
  const outbox = ensureOutbox(state)
  const item = outbox.find((x) => x.id === outboxId)
  if (!item) throw new AppError('NOT_FOUND', 'outbox 不存在')
  if (item.status === 'sent') return presentOutbox(item)
  item.status = 'pending'
  item.lastError = null
  return tryDeliver(state, outboxId)
}

function listFailed(state) {
  return ensureOutbox(state)
    .filter((x) => x.status === 'failed')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(presentOutbox)
}

function listOutbox(state, filter = {}) {
  return ensureOutbox(state)
    .filter((x) => (filter.status ? x.status === filter.status : true))
    .filter((x) => (filter.user_id ? x.userId === filter.user_id : true))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(presentOutbox)
}

function listNotifications(state, userId) {
  return ensureNotifications(state)
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(presentNotification)
}

function markRead(state, userId, notificationId) {
  const n = ensureNotifications(state).find((x) => x.id === notificationId && x.userId === userId)
  if (!n) throw new AppError('NOT_FOUND', '通知不存在')
  n.readAt = time.nowMs()
  return presentNotification(n)
}

function presentNotification(n) {
  return {
    id: n.id,
    user_id: n.userId,
    title: n.title,
    body: n.body,
    created_at: n.createdAt,
    read_at: n.readAt,
    meta: n.meta || null
  }
}

function presentOutbox(item) {
  return {
    outbox_id: item.id,
    notification_id: item.notificationId,
    user_id: item.userId,
    channel: item.channel,
    template: item.template,
    status: item.status,
    attempts: item.attempts,
    last_error: item.lastError,
    related_type: item.relatedType,
    related_id: item.relatedId,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    sent_at: item.sentAt
  }
}

module.exports = {
  enqueue,
  tryDeliver,
  retry,
  listFailed,
  listOutbox,
  listNotifications,
  markRead,
  presentOutbox
}
