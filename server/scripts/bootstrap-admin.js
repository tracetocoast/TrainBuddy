const { loadEnv } = require('../src/lib/loadEnv')
loadEnv()
const { createPool } = require('../src/store/migrate')
const { PostgresStore } = require('../src/store/postgresStore')

async function main() {
  const userId = process.argv[2], reason = process.env.ADMIN_BOOTSTRAP_REASON
  if (!userId || !reason || reason.length < 8) throw new Error('USER_AND_AUDIT_REASON_REQUIRED')
  const store = new PostgresStore(createPool())
  try {
    await store.tx(state => {
      const user = state.users.find(row => row.userId === userId && row.status === 'active' && String(row.wechatSubject).startsWith('wx:'))
      if (!user) throw new Error('REAL_WECHAT_USER_REQUIRED')
      if (state.userRoles.some(row => row.userId === userId && row.role === 'ops')) throw new Error('ROLE_ALREADY_EXISTS')
      state.userRoles.push({ userId, role: 'ops', status: 'active', grantedBy: 'server_bootstrap' })
      state.ops.audits.push({ id: require('crypto').randomUUID(), action: 'admin_bootstrap', targetId: userId, reason, createdAt: Date.now(), actorId: 'server_operator' })
    })
    console.log('Admin granted with audit record; no credentials printed.')
  } finally { await store.close() }
}
main().catch(() => { console.error('Admin bootstrap refused. Check user identity and audit reason.'); process.exitCode = 1 })
