const http = require('../utils/http')

function listExercises(app, query) {
  return http
    .get('/exercises', {
      q: query && query.q,
      muscleGroup: query && query.muscleGroup
    })
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function getExercise(app, id) {
  return http
    .get('/exercises/' + id)
    .then((res) => ({ data: res.data, request_id: res.request_id }))
}

function toggleFavorite(app, id) {
  // 收藏仍可本地；远程未单开接口时返回本地翻转提示
  return Promise.resolve({ data: { favorited: true }, request_id: 'local' })
}

function filters() {
  return {
    muscles: ['下肢', '上肢', '核心', '全身'],
    equipment: ['杠铃', '哑铃', '器械', '自重']
  }
}

module.exports = { listExercises, getExercise, toggleFavorite, filters }
