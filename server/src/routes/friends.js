const express = require('express')
const { authRequired } = require('../middleware/auth')
const { ok } = require('../middleware/errors')
const friends = require('../services/friendService')

function buildFriendsRouter() {
  const router = express.Router()
  router.use(authRequired)
  const read = fn => async (req, res, next) => { try { ok(res, await fn(req)) } catch (err) { next(err) } }
  const write = fn => read(req => req.app.locals.store.tx(state => fn(state, req)))
  router.get('/', read(req => friends.overview(req.app.locals.store.state, req.actor)))
  router.post('/invitations', write((state, req) => friends.createInvitation(state, req.actor)))
  router.post('/invitations/preview', read(req => friends.preview(req.app.locals.store.state, req.actor, req.body.code)))
  router.post('/accept', write((state, req) => friends.accept(state, req.actor, req.body.code, req.body.consent)))
  router.get('/:id/training', read(req => friends.feed(req.app.locals.store.state, req.actor, req.params.id)))
  router.post('/:id/comments', write((state, req) => friends.addComment(state, req.actor, req.params.id, req.body)))
  router.delete('/:id', write((state, req) => friends.remove(state, req.actor, req.params.id)))
  return router
}

module.exports = { buildFriendsRouter }
