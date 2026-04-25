// Esegui con: node scripts/bunq-setup.mjs
// Fa il full handshake Bunq e salva device+session su disco

import crypto from 'crypto'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dir = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dir, '..')

const BASE = 'https://public-api.sandbox.bunq.com/v1'
const API_KEY = 'sandbox_e82da87044c92880dea0d13fa719f729f814460ee10608d790a63f41'
const USER_ID = 3628872

function sign(body, privateKey) {
  return crypto.createSign('SHA256').update(body).sign(privateKey, 'base64')
}

function makeHeaders(privateKey, token, method, urlPath, body) {
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
  // Sign ONLY the body (Bunq docs: sign only request body, SHA256, RSA PKCS#1 v1.5)
  if (privateKey && body) {
    h['X-Bunq-Client-Signature'] = sign(body, privateKey)
  }
  return h
}

async function bunq(privateKey, method, urlPath, body, token) {
  const bodyStr = body ? JSON.stringify(body) : ''
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: makeHeaders(privateKey, token, method, urlPath, bodyStr),
    body: bodyStr || undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function main() {
  console.log('=== Bunq Setup ===')
  console.log('API Key:', API_KEY.slice(0, 20) + '...')

  // 1. RSA keypair
  console.log('\n[1] Generating RSA-2048 keypair...')
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  console.log('✓ Done')

  // 2. Installation
  console.log('\n[2] POST /installation...')
  const instRes = await bunq(privateKey, 'POST', '/installation', { client_public_key: publicKey }, null)
  const installationToken = instRes.Response.find(r => r.Token)?.Token?.token
  if (!installationToken) throw new Error('No installation token')
  console.log('✓ Token:', installationToken.slice(0, 30) + '...')

  // 3. Device server
  console.log('\n[3] POST /device-server...')
  await bunq(privateKey, 'POST', '/device-server', {
    description: 'MeditaSplit-Hackathon',
    secret: API_KEY,
    permitted_ips: ['*'],
  }, installationToken)
  console.log('✓ Device registered')

  // 4. Session server
  console.log('\n[4] POST /session-server...')
  const sessRes = await bunq(privateKey, 'POST', '/session-server', { secret: API_KEY }, installationToken)
  const sessionToken = sessRes.Response.find(r => r.Token)?.Token?.token
  const userObj = sessRes.Response.find(r => r.UserPerson || r.UserLight || r.UserApiKey)
  const userId = userObj?.UserPerson?.id ?? userObj?.UserLight?.id ?? USER_ID
  if (!sessionToken) throw new Error('No session token')
  console.log('✓ Session token:', sessionToken.slice(0, 30) + '...')
  console.log('✓ User ID:', userId)

  // 5. Get account
  console.log('\n[5] GET /monetary-account...')
  const accRes = await bunq(privateKey, 'GET', `/user/${userId}/monetary-account`, null, sessionToken)
  const account = accRes.Response[0]?.MonetaryAccountBank
  const accountId = account?.id
  const balance = account?.balance?.value
  const iban = account?.alias?.find(a => a.type === 'IBAN')?.value
  if (!accountId) throw new Error('No account found')
  console.log('✓ Account ID:', accountId)
  console.log('✓ Balance:', balance, 'EUR')
  console.log('✓ IBAN:', iban)

  // 6. Save to disk
  const deviceData = { privateKey, publicKey, installationToken, savedAt: Date.now() }
  const sessionData = { sessionToken, userId, accountId, savedAt: Date.now() }

  fs.writeFileSync(path.join(ROOT, '.bunq-device.json'), JSON.stringify(deviceData, null, 2))
  fs.writeFileSync(path.join(ROOT, '.bunq-session.json'), JSON.stringify(sessionData, null, 2))
  console.log('\n✓ Saved .bunq-device.json and .bunq-session.json')

  // 7. Update .env.local
  const envPath = path.join(ROOT, '.env.local')
  let env = fs.readFileSync(envPath, 'utf8')
  env = env.replace(/BUNQ_API_KEY=.*/,  `BUNQ_API_KEY=${API_KEY}`)
  env = env.replace(/BUNQ_USER_ID=.*/, `BUNQ_USER_ID=${userId}`)
  fs.writeFileSync(envPath, env)
  console.log('✓ Updated .env.local')

  console.log('\n=== Setup completo! ===')
  console.log('Ora puoi usare l\'app con BUNQ_MOCK=false')
}

main().catch(e => { console.error('\n✗ FAILED:', e.message); process.exit(1) })
