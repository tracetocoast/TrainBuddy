const KEY = 'lianzida_state_v1'

function load() {
  try {
    return wx.getStorageSync(KEY) || null
  } catch (e) {
    return null
  }
}

function save(data) {
  try {
    wx.setStorageSync(KEY, {
      role: data.role,
      booked: data.booked,
      sets: data.sets,
      checkins: data.checkins,
      records: data.records,
      date: data.date,
      student: data.student
    })
  } catch (e) {
    // ignore
  }
}

module.exports = { load, save }
