const { createApp } = require('./app')
const config = require('./config')

const app = createApp()
app.listen(config.port, () => {
  console.log(`[trainbuddy-api] http://127.0.0.1:${config.port}/api/v1`)
  console.log(`[trainbuddy-api] health http://127.0.0.1:${config.port}/health`)
  console.log(`[trainbuddy-api] timezone Asia/Shanghai · demo invite LINYE7D`)
})
