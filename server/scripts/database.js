const { loadEnv } = require('../src/lib/loadEnv')
loadEnv()
const { migrate, createPool } = require('../src/store/migrate')
const { importJson } = require('../src/store/importJson')
const { emptyState } = require('../src/store/memoryStore')

async function main() {
  const [command, file, flag] = process.argv.slice(2)
  if (command === 'import' && (!file || !['--dry-run', '--apply', '--verify'].includes(flag))) throw new Error('USAGE_IMPORT_FILE_MODE')
  if (command === 'import' && flag === '--dry-run') { console.log(JSON.stringify(await importJson(null, file))); return }
  const pool = createPool()
  try {
    if (command === 'migrate') await migrate(pool)
    else if (command === 'import') console.log(JSON.stringify(await importJson(pool, file, flag.slice(2))))
    else if (command === 'init-empty') {
      const state = emptyState(); state.seeded = true
      // No upsert: an existing database must never be overwritten.
      await pool.query('INSERT INTO runtime_state(id,document) VALUES (1,$1::jsonb)', [JSON.stringify(state)])
    } else throw new Error('UNKNOWN_DATABASE_COMMAND')
  } finally { await pool.end() }
}
main().catch(() => { console.error('Database operation failed. Verify arguments, target emptiness, connectivity and schema. No credentials are logged.'); process.exitCode = 1 })
