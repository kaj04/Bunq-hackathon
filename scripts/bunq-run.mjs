/**
 * Start a Next.js dev server as a specific Bunq user on a given port.
 * Run this in separate terminals to have multiple users open simultaneously.
 *
 * Usage:
 *   node scripts/bunq-run.mjs <Name> [port]
 *
 * Examples:
 *   node scripts/bunq-run.mjs Francesco 3000
 *   node scripts/bunq-run.mjs Vaggelis  3001
 *
 * Then open localhost:3000 as Francesco and localhost:3001 as Vaggelis.
 */

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dir, '..')
const ACCOUNTS_PATH = path.join(ROOT, '.bunq-accounts.json')
const ENV_PATH = path.join(ROOT, '.env.local')

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_PATH)) return {}
  try { return JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf8')) } catch { return {} }
}

const targetName = process.argv[2]
const port = process.argv[3] ?? '3000'

if (!targetName) {
  console.error('Usage: node scripts/bunq-run.mjs <Name> [port]')
  process.exit(1)
}

const accounts = loadAccounts()
const matched = Object.keys(accounts).find(n => n.toLowerCase() === targetName.toLowerCase())

if (!matched) {
  console.error(`\nUnknown account "${targetName}". Available: ${Object.keys(accounts).join(', ')}`)
  console.error(`Create it with: node scripts/bunq-setup.mjs ${targetName}\n`)
  process.exit(1)
}

const account = accounts[matched]

// Write per-user cache files so this server doesn't conflict with others
const suffix = `-${matched}`
if (account.device) fs.writeFileSync(path.join(ROOT, `.bunq-device${suffix}.json`), JSON.stringify(account.device, null, 2))
if (account.session) fs.writeFileSync(path.join(ROOT, `.bunq-session${suffix}.json`), JSON.stringify(account.session, null, 2))

// Read non-Bunq vars from .env.local (Anthropic key, Groq key, etc.)
let baseEnv = ''
if (fs.existsSync(ENV_PATH)) {
  baseEnv = fs.readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter(line => !line.startsWith('BUNQ_'))
    .join('\n')
}

// Build env: inherit process env, add non-Bunq .env.local vars, overlay Bunq account vars
const extraEnv = {}
for (const line of baseEnv.split('\n')) {
  const m = line.match(/^([^#=\s]+)=(.*)$/)
  if (m) extraEnv[m[1]] = m[2]
}

const env = {
  ...process.env,
  ...extraEnv,
  PORT: port,
  BUNQ_API_KEY: account.apiKey,
  BUNQ_USER_ID: String(account.userId),
  BUNQ_ACCOUNT_ID: String(account.accountId),
  BUNQ_USER_NAME: matched,                         // tells session-store which cache files to use
  NEXT_DIST_DIR: `.next-${matched.toLowerCase()}`, // isolated build dir → no cross-instance conflict
}

console.log(`\nStarting MeditaSplit as "${matched}" on http://localhost:${port}\n`)

const child = spawn('npx', ['next', 'dev', '-p', port], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', code => process.exit(code ?? 0))
