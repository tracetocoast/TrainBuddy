const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const root = path.resolve(__dirname, '../..')
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}/,
  /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKID[A-Za-z0-9]{28,}|LTAI[A-Za-z0-9]{16,})/,
  /postgres(?:ql)?:\/\/(?![^\s]*\$\{)[^\s:/]+:[^\s@]{12,}@/
]
function findings(text) { return text.split('\n').map((line, index) => patterns.some(pattern => pattern.test(line)) ? index + 1 : 0).filter(Boolean) }
function scan() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean)
  let count = 0
  for (const file of new Set(files)) {
    const full = path.join(root, file)
    if (!fs.existsSync(full) || !fs.statSync(full).isFile() || fs.statSync(full).size > 2 * 1024 * 1024) continue
    const buffer = fs.readFileSync(full)
    if (buffer.includes(0)) continue
    for (const line of findings(buffer.toString('utf8'))) { console.log(JSON.stringify({ scope: 'working-tree', file, line })); count++ }
  }
  if (process.argv.includes('--history')) {
    const diff = execFileSync('git', ['log', '--all', '-p', '--no-ext-diff', '--format='], { cwd: root, maxBuffer: 128 * 1024 * 1024 }).toString()
    let file = '(unknown)'
    diff.split('\n').forEach((line, index) => {
      if (line.startsWith('+++ b/')) file = line.slice(6)
      if (/^[+-](?![+-])/.test(line) && findings(line).length) { console.log(JSON.stringify({ scope: 'history-diff', file, diff_line: index + 1 })); count++ }
    })
  }
  console.log(JSON.stringify({ event: 'secret_scan', findings: count, history: process.argv.includes('--history'), note: 'Pattern scan only; never proves absence of every possible credential format.' }))
  if (count) process.exitCode = 1
}
if (require.main === module) { try { scan() } catch (_) { console.error('Secret scan failed; no sensitive output printed.'); process.exitCode = 1 } }
module.exports = { findings }
