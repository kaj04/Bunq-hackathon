/**
 * Switch the active Bunq sandbox account (single-server mode).
 *
 * Usage:
 *   node scripts/bunq-switch.mjs           → list available accounts
 *   node scripts/bunq-switch.mjs <Name>    → activate that account
 *
 * For two accounts simultaneously, use bunq-run.mjs instead.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dir, '..')
const ACCOUNTS_PATH = path.join(ROOT, '.bunq-accounts.json')
const ENV_PATH = path.join(ROOT, '.env.local')

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_PATH)) return {}
  try { return JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf8')) } catch { return {} }
}

function setEnvLine(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm')
  return re.test(content) ? content.replace(re, `${key}=${value}`) : content.trimEnd() + `\n${key}=${value}`
}

const accounts = loadAccounts()
const names = Object.keys(accounts)

if (names.length === 0) {
  console.log('\nNo accounts yet. Create one with:\n  node scripts/bunq-setup.mjs <Name>\n')
  process.exit(0)
}

const targetName = process.argv[2]

if (!targetName) {
  let currentKey = ''
  if (fs.existsSync(ENV_PATH)) {
    const match = fs.readFileSync(ENV_PATH, 'utf8').match(/^BUNQ_API_KEY=(.+)$/m)
    if (match) currentKey = match[1].trim()
  }
  console.log('\nAvailable Bunq sandbox accounts:\n')
  for (const n of names) {
    const a = accounts[n]
    const active = a.apiKey === currentKey ? ' ← active' : ''
    console.log(`  ${n.padEnd(14)} userId: ${String(a.userId).padEnd(10)} ${a.email}${active}`)
  }
  console.log('\nSwitch:       node scripts/bunq-switch.mjs <Name>')
  console.log('Two at once:  node scripts/bunq-run.mjs <Name> <port>\n')
  process.exit(0)
}

const matched = names.find(n => n.toLowerCase() === targetName.toLowerCase())
if (!matched) {
  console.error(`\nUnknown account "${targetName}". Available: ${names.join(', ')}\n`)
  process.exit(1)
}

const account = accounts[matched]

// Update .env.local
let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
env = env.replace(/^BUNQ_MOCK=.*\n?/m, '').replace(/^BUNQ_USER_NAME=.*\n?/m, '')
env = setEnvLine(env, 'BUNQ_API_KEY', account.apiKey)
env = setEnvLine(env, 'BUNQ_USER_ID', String(account.userId))
env = setEnvLine(env, 'BUNQ_ACCOUNT_ID', String(account.accountId))
fs.writeFileSync(ENV_PATH, env.trimEnd() + '\n')

// Write cache files (unnamed, for default single-server mode)
if (account.device) fs.writeFileSync(path.join(ROOT, '.bunq-device.json'), JSON.stringify(account.device, null, 2))
if (account.session) fs.writeFileSync(path.join(ROOT, '.bunq-session.json'), JSON.stringify(account.session, null, 2))

console.log(`\n✓ Switched to "${matched}" — restart the dev server: npm run dev\n`)
