if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required. Use a disposable *_test database, never a live database.')
  process.exitCode = 1
} else {
  const result = require('child_process').spawnSync(process.execPath, ['--test', 'test/postgres-integration.test.js'], { cwd: require('path').join(__dirname, '..'), stdio: 'inherit' })
  process.exitCode = result.status === null ? 1 : result.status
}
