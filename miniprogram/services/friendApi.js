const http = require('../utils/http')

module.exports = {
  list: () => http.get('/friends'),
  createInvitation: () => http.post('/friends/invitations', {}),
  preview: code => http.post('/friends/invitations/preview', { code }),
  accept: code => http.post('/friends/accept', { code, consent: true }),
  training: id => http.get('/friends/' + encodeURIComponent(id) + '/training'),
  comment: (id, sessionId, text, key) => http.post('/friends/' + encodeURIComponent(id) + '/comments', { sessionId, text, key }),
  remove: id => http.del('/friends/' + encodeURIComponent(id))
}
