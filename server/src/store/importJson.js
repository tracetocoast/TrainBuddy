const crypto = require('crypto')
const fs = require('fs/promises')
const { emptyState } = require('./memoryStore')

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}
const hash = input => crypto.createHash('sha256').update(input).digest('hex')
function inspect(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document) || document.seeded !== true) throw new Error('INVALID_STORE_STRUCTURE')
  const defaults = emptyState()
  const counts = {}
  function safeValues(value) {
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('UNSAFE_JSON_NUMBER')
    if (value && typeof value === 'object') {
      if (Object.hasOwn(value, '__proto__')) throw new Error('UNSAFE_JSON_KEY')
      Object.values(value).forEach(safeValues)
    }
  }
  safeValues(document)
  function shape(actual, expected, location) {
    if (Array.isArray(expected)) { if (!Array.isArray(actual)) throw new Error('INVALID_STORE_STRUCTURE:' + location); return }
    if (expected && typeof expected === 'object') {
      if (!actual || typeof actual !== 'object' || Array.isArray(actual)) throw new Error('INVALID_STORE_STRUCTURE:' + location)
      for (const name of Object.keys(expected)) if (name in actual) shape(actual[name], expected[name], location + '.' + name)
    }
  }
  // Validate the core shape without discarding extensions in older/newer versions.
  shape(document, defaults, 'root')
  if (!Array.isArray(document.users) || !Array.isArray(document.userRoles) || !document.sessions || Array.isArray(document.sessions)) throw new Error('INVALID_STORE_STRUCTURE')
  const ids = document.users.map(user => user.userId)
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('INVALID_USER_IDS')
  // Never include dynamic dictionary keys (especially legacy bearer tokens) in reports.
  for (const [key, value] of Object.entries(document)) {
    if (Array.isArray(value)) counts[key] = value.length
    else if (value && typeof value === 'object') {
      counts[key] = Object.keys(value).length
      const known = defaults[key]
      if (known && !Array.isArray(known)) for (const child of Object.keys(known)) {
        if (Array.isArray(value[child])) counts[key + '.' + child] = value[child].length
      }
    }
  }
  return { canonical_sha256: hash(canonical(document)), counts }
}
function sanitizeSessions(document) {
  const result = JSON.parse(JSON.stringify(document))
  // Old bearer tokens and cached login responses must never become valid production credentials.
  result.sessions = {}
  result.idempotency = {}
  return result
}
async function importJson(pool, file, mode = 'dry-run') {
  const bytes = await fs.readFile(file)
  if (!Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) throw new Error('INVALID_SOURCE_UTF8')
  const document = JSON.parse(bytes.toString('utf8'))
  const report = { source_sha256: hash(bytes), ...inspect(document) }
  const imported = sanitizeSessions(document)
  report.imported_sha256 = hash(canonical(imported))
  report.invalidated_sessions = Object.keys(document.sessions).length
  report.invalidated_idempotency = Object.keys(document.idempotency || {}).length
  if (mode === 'dry-run') return { ...report, mode }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('LOCK TABLE runtime_state IN EXCLUSIVE MODE')
    if (mode === 'verify') {
      const result = await client.query('SELECT document FROM runtime_state WHERE id=1')
      if (!result.rows.length || hash(canonical(result.rows[0].document)) !== report.imported_sha256) throw new Error('MIGRATION_VERIFICATION_FAILED')
    } else if (mode === 'apply') {
      const exists = await client.query('SELECT id FROM runtime_state')
      if (exists.rows.length) throw new Error('TARGET_NOT_EMPTY')
      await client.query('INSERT INTO runtime_state(id,document) VALUES (1,$1::jsonb)', [JSON.stringify(imported)])
      const result = await client.query('SELECT document FROM runtime_state WHERE id=1')
      if (hash(canonical(result.rows[0].document)) !== report.imported_sha256) throw new Error('MIGRATION_VERIFICATION_FAILED')
      await client.query('INSERT INTO migration_runs(id,source_sha256,canonical_sha256,imported_sha256,counts,original_document,original_bytes) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)',
        [crypto.randomUUID(), report.source_sha256, report.canonical_sha256, report.imported_sha256, JSON.stringify(report.counts), JSON.stringify(document), bytes])
    } else throw new Error('INVALID_IMPORT_MODE')
    const archived = await client.query('SELECT original_document, original_bytes, canonical_sha256, imported_sha256, counts FROM migration_runs WHERE source_sha256=$1 ORDER BY imported_at DESC LIMIT 1', [report.source_sha256])
    const receipt = archived.rows[0]
    if (!receipt || receipt.canonical_sha256 !== report.canonical_sha256 || receipt.imported_sha256 !== report.imported_sha256 ||
        hash(receipt.original_bytes) !== report.source_sha256 || hash(canonical(receipt.original_document)) !== report.canonical_sha256 || canonical(receipt.counts) !== canonical(report.counts)) throw new Error('MIGRATION_ARCHIVE_VERIFICATION_FAILED')
    await client.query('COMMIT')
    return { ...report, mode, verified: true }
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err }
  finally { client.release() }
}
module.exports = { canonical, hash, inspect, sanitizeSessions, importJson }
