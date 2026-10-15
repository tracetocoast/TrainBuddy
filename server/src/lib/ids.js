const { randomUUID } = require('crypto')
const time = require('./time')

function makeId(prefix) {
  return prefix + '_' + time.nowMs().toString(36) + '_' + randomUUID().slice(0, 8)
}

function requestId() {
  return 'req_' + randomUUID().replace(/-/g, '').slice(0, 16)
}

module.exports = { makeId, requestId }
