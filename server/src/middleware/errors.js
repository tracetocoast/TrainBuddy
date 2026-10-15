const { AppError } = require('../lib/errors')
const { requestId } = require('../lib/ids')

function attachRequestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || requestId()
  res.setHeader('X-Request-Id', req.requestId)
  next()
}

function ok(res, data, extra) {
  const body = Object.assign({ data, request_id: res.getHeader('X-Request-Id') }, extra || {})
  res.json(body)
}

function errorHandler(err, req, res, next) {
  const rid = req.requestId || requestId()
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        fields: err.fields,
        ...(err.extra || {})
      },
      request_id: rid
    })
  }
  console.error('[api]', rid, err)
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: '服务暂时不可用',
      retryable: true
    },
    request_id: rid
  })
}

module.exports = { attachRequestId, ok, errorHandler }
