const { MemoryStore } = require('./store/memoryStore')
const { seed } = require('./seed')
const config = require('./config')

const store = new MemoryStore(config.storeFile)
store.reset()
seed(store)
console.log('seeded →', config.storeFile)
console.log('demo invite: LINYE7D')
