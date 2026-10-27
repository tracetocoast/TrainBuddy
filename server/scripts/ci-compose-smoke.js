// Disposable CI project only. Never run this script against an existing deployment.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
if (process.env.CI !== 'true' || process.platform !== 'linux') throw new Error('DISPOSABLE_LINUX_CI_ONLY')
const root = path.resolve(__dirname, '../..')
const project = 'tb_ci_' + crypto.randomBytes(6).toString('hex')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-compose-'))
const envFile = path.join(temporary, '.env')
const password = () => crypto.randomBytes(24).toString('hex')
fs.writeFileSync(envFile, [
  'POSTGRES_PASSWORD=' + password(), 'MIGRATOR_DB_PASSWORD=' + password(), 'APP_DB_PASSWORD=' + password(),
  'BACKUP_DB_PASSWORD=' + password(),
  'ADMIN_API_KEY=' + password(), 'WECHAT_APP_ID=ci-app', 'WECHAT_APP_SECRET=' + password(),
  'API_DOMAIN=api.example.com', 'ACME_EMAIL=ci@example.com',
  'PRODUCTION_COMPAT_STORE_ACK=single-document-locking-reviewed'
].join('\n'), { mode: 0o600 })
const composeArgs = ['compose', '--env-file', envFile, '-f', 'deploy/compose.yaml', '-p', project]
const docker = (args, input) => execFileSync('docker', [...composeArgs, ...args], { cwd: root, input, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()
async function main() {
  try {
    docker(['config', '--quiet'])
    docker(['build', 'api', 'migrate'])
    docker(['up', '-d', '--wait', 'db'])
    docker(['run', '--rm', 'migrate'])
    docker(['run', '--rm', 'migrate', 'node', 'scripts/database.js', 'init-empty'])
    docker(['up', '-d', '--wait', 'api'])
    docker(['exec', '-T', 'api', 'node', '-e', "fetch('http://127.0.0.1:8787/health/ready').then(r=>{if(!r.ok)process.exit(1)})"])
    docker(['exec', '-T', 'api', 'node', '-e', "fetch('http://127.0.0.1:8787/api/v1/auth/wechat-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountKey:'ops_admin'})}).then(r=>{if(r.status!==401)process.exit(1)})"])
    // Runtime role cannot read the raw migration archive or create database tables.
    docker(['exec', '-T', 'api', 'node', '-e', "const p=require('./src/store/migrate').createPool();p.query(\"SELECT has_table_privilege(current_user,'migration_runs','SELECT') AS allowed\").then(r=>{if(r.rows[0].allowed)throw Error('overprivileged')}).finally(()=>p.end())"])
    const original = docker(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'trainbuddy', '-Atc', 'SELECT document::text FROM runtime_state WHERE id=1'])
    docker(['run', '--rm', '--entrypoint', 'sh', 'backup', '/scripts/backup-once.sh'])
    const backups = path.join(root, 'deploy/backups')
    const dump = fs.readdirSync(backups).filter(name => /^trainbuddy-.*\.dump$/.test(name)).sort().at(-1)
    if (!dump) throw new Error('BACKUP_MISSING')
    docker(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-c', 'CREATE DATABASE trainbuddy_restore_test'])
    docker(['exec', '-T', 'db', 'pg_restore', '-U', 'postgres', '-d', 'trainbuddy_restore_test', '--no-owner', '--no-acl', '--exit-on-error'], fs.readFileSync(path.join(backups, dump)))
    const restored = docker(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'trainbuddy_restore_test', '-Atc', 'SELECT document::text FROM runtime_state WHERE id=1'])
    if (restored !== original) throw new Error('RESTORE_CONTENT_MISMATCH')
    console.log('Disposable Compose startup, role protection, backup and restore smoke checks passed. ACME/public TLS and real WeChat were not tested.')
  } finally {
    // Only this random CI project's volumes, never a live trainbuddy deployment.
    if (!/^tb_ci_[a-f0-9]{12}$/.test(project)) throw new Error('UNSAFE_CLEANUP_SCOPE')
    try { docker(['down', '--volumes', '--remove-orphans']) } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
  }
}
main().catch(() => { console.error('Compose smoke failed. No environment values or raw command output are printed.'); process.exitCode = 1 })
