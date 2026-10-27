const fs = require('fs/promises')
const path = require('path')

async function migrate(pool) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(71483921)')
    // Bootstrap only the version table, then apply each known immutable migration.
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const version of ['001_compat_state.sql']) {
      const sql = await fs.readFile(path.join(__dirname, '../../migrations', version), 'utf8')
      const checksum = require('crypto').createHash('sha256').update(sql).digest('hex')
      const found = await client.query('SELECT version, checksum FROM schema_migrations WHERE version=$1', [version])
      if (found.rows.length) { if (found.rows[0].checksum !== checksum) throw new Error('MIGRATION_CHECKSUM_CHANGED'); continue }
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations(version,checksum) VALUES ($1,$2)', [version, checksum])
    }
    await client.query('COMMIT')
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err }
  finally { client.release() }
}

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED')
  const { Pool } = require('pg')
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 })
}
module.exports = { migrate, createPool }
