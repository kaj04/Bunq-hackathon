/**
 * Creates a fresh Bunq sandbox user and saves credentials to .bunq-accounts.json.
 *
 * Usage:  node scripts/bunq-setup.mjs <Name>
 * Example: node scripts/bunq-setup.mjs Vaggelis
 *
 * Then switch to the account with: node scripts/bunq-switch.mjs <Name>
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dir, '..')
const ACCOUNTS_PATH = path.join(ROOT, '.bunq-accounts.json')
const BASE = 'https://public-api.sandbox.bunq.com/v1'

const name = process.argv[2]
if (!name) { console.error('Usage: node scripts/bunq-setup.mjs <Name>'); process.exit(1) }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sign(body, privateKey) {
  return crypto.createSign('SHA256').update(body).sign(privateKey, 'base64')
}

function makeHeaders(privateKey, token, body) {
  const h = {
    'Cache-Control': 'no-cache',
    'User-Agent': 'MeditaSplit/1.0',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'X-Bunq-Geolocation': '0 0 0 0 NL',
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'Content-Type': 'application/json',
  }
  if (token) h['X-Bunq-Client-Authentication'] = token
  if (privateKey && body) h['X-Bunq-Client-Signature'] = sign(body, privateKey)
  return h
}

async function bunq(method, urlPath, body, privateKey, token) {
  const bodyStr = body ? JSON.stringify(body) : ''
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: makeHeaders(privateKey, token, bodyStr),
    body: bodyStr || undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`)
  return JSON.parse(text)
}

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_PATH)) return {}
  try { return JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf8')) } catch { return {} }
}

function saveAccounts(accounts) {
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(accounts, null, 2))
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\nSetting up Bunq sandbox for "${name}"...\n`)

// 1. Create sandbox user
console.log('[1/5] Creating sandbox user...')
const sandboxRes = await bunq('POST', '/sandbox-user-person', {}, null, null)
const apiKey = sandboxRes.Response.find(r => r.ApiKey)?.ApiKey?.api_key
if (!apiKey) throw new Error('No API key returned: ' + JSON.stringify(sandboxRes))
console.log(`      Key: ${apiKey.slice(0, 24)}...`)

// 2. Generate RSA keypair + Installation
console.log('[2/5] Installing...')
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const installRes = await bunq('POST', '/installation', { client_public_key: publicKey }, privateKey, null)
const installToken = installRes.Response.find(r => r.Token)?.Token?.token
if (!installToken) throw new Error('No installation token')

// 3. Register device
console.log('[3/5] Registering device...')
await bunq('POST', '/device-server', {
  description: `MeditaSplit-${name}`,
  secret: apiKey,
  permitted_ips: ['*'],
}, privateKey, installToken)

// 4. Open session
console.log('[4/5] Opening session...')
const sessRes = await bunq('POST', '/session-server', { secret: apiKey }, privateKey, installToken)
const sessionToken = sessRes.Response.find(r => r.Token)?.Token?.token
const userObj = sessRes.Response.find(r => r.UserPerson || r.UserLight)
const userId = userObj?.UserPerson?.id ?? userObj?.UserLight?.id
if (!sessionToken || !userId) throw new Error('Missing session token or user ID')

// 5. Get account info
console.log('[5/5] Fetching account...')
const accRes = await bunq('GET', `/user/${userId}/monetary-account`, null, null, sessionToken)
const account = accRes.Response[0]?.MonetaryAccountBank
const accountId = account?.id
const balance = account?.balance?.value ?? '0.00'
const emailAlias = account?.alias?.find(a => a.type === 'EMAIL')?.value ?? ''
if (!accountId) throw new Error('No monetary account found')

// ─── Save to accounts store ───────────────────────────────────────────────────

const accounts = loadAccounts()
accounts[name] = {
  name,
  apiKey,
  userId,
  accountId,
  email: emailAlias,
  balance,
  device: { privateKey, publicKey, installationToken: installToken, savedAt: Date.now() },
  session: { sessionToken, userId, accountId, savedAt: Date.now() },
  createdAt: new Date().toISOString(),
}
saveAccounts(accounts)

// ─── Update bunq-members.json (public, committable — no private keys) ────────
const MEMBERS_PATH = path.join(ROOT, 'bunq-members.json')
let members = []
if (fs.existsSync(MEMBERS_PATH)) {
  try { members = JSON.parse(fs.readFileSync(MEMBERS_PATH, 'utf8')) } catch { members = [] }
}
const existingIdx = members.findIndex(m => m.name.toLowerCase() === name.toLowerCase())
const memberEntry = { name, userId, alias: emailAlias }
if (existingIdx >= 0) members[existingIdx] = memberEntry
else members.push(memberEntry)
fs.writeFileSync(MEMBERS_PATH, JSON.stringify(members, null, 2))

console.log(`
✓ Account saved to .bunq-accounts.json
✓ Email registered in bunq-members.json (commit this file to share with team)

  Name:       ${name}
  User ID:    ${userId}
  Account ID: ${accountId}
  Email:      ${emailAlias}
  Balance:    €${balance}

To activate this account:
  node scripts/bunq-switch.mjs ${name}

Other available accounts: ${Object.keys(accounts).filter(n => n !== name).join(', ') || '(none yet)'}
`)
