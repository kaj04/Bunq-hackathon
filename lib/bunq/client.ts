// OWNER: Francesco
import crypto from 'crypto'
import type { BunqContact, PaymentRequest } from '@/types'

const BASE_URL = 'https://public-api.sandbox.bunq.com/v1'

const _s = {
  publicKey: '',
  privateKey: '',
  installationToken: '',
  sessionToken: '',
  userId: 0,
  accountId: 0,
}

let _initPromise: Promise<void> | null = null

function generateKeys() {
  if (_s.privateKey) return
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  _s.privateKey = privateKey
  _s.publicKey = publicKey
}

function sign(data: string) {
  return crypto.createSign('SHA256').update(data).sign(_s.privateKey, 'base64')
}

function headers(token?: string, method = 'POST', path = '', body = '') {
  const h: Record<string, string> = {
    'Cache-Control': 'no-cache',
    'User-Agent': 'BunqHackathon/1.0',
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Geolocation': '0 0 0 0 NL',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'Content-Type': 'application/json',
  }
  if (token) h['X-Bunq-Client-Authentication'] = token
  if (_s.privateKey && path !== '/installation') {
    const headerStr = Object.entries(h)
      .filter(([k]) => k.startsWith('X-Bunq-') || k === 'Cache-Control' || k === 'User-Agent')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    h['X-Bunq-Client-Signature'] = sign(`${method} ${path}\n${headerStr}\n\n${body}`)
  }
  return h
}

async function bunqPost(path: string, body: object, token?: string) {
  const bodyStr = JSON.stringify(body)
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(token, 'POST', path, bodyStr),
    body: bodyStr,
  })
  if (!res.ok) throw new Error(`Bunq POST ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

async function bunqGet(path: string, token: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: headers(token, 'GET', path, ''),
  })
  if (!res.ok) throw new Error(`Bunq GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

async function _init() {
  generateKeys()
  const API_KEY = process.env.BUNQ_API_KEY!

  // Step 1: Installation — no auth needed
  const installRes = await bunqPost('/installation', { client_public_key: _s.publicKey })
  _s.installationToken = installRes.Response.find((r: any) => r.Token)?.Token.token

  // Step 2: Device registration
  await bunqPost('/device-server', {
    description: 'bunq-hackathon',
    secret: API_KEY,
    permitted_ips: ['*'],
  }, _s.installationToken)

  // Step 3: Session — returns session token + user info
  const sessionRes = await bunqPost('/session-server', { secret: API_KEY }, _s.installationToken)
  _s.sessionToken = sessionRes.Response.find((r: any) => r.Token)?.Token.token
  _s.userId = sessionRes.Response.find((r: any) => r.UserPerson)?.UserPerson?.id

  // Step 4: Get monetary account ID
  const accRes = await bunqGet(`/user/${_s.userId}/monetary-account`, _s.sessionToken)
  _s.accountId = accRes.Response[0]?.MonetaryAccountBank?.id

  console.log(`✓ Bunq session ready — user: ${_s.userId}, account: ${_s.accountId}`)
}

export async function initBunq() {
  if (_s.sessionToken) return
  if (!_initPromise) _initPromise = _init().catch(e => { _initPromise = null; throw e })
  return _initPromise
}

export async function createPaymentRequest(req: PaymentRequest) {
  await initBunq()
  return bunqPost(
    `/user/${_s.userId}/monetary-account/${_s.accountId}/request-inquiry`,
    {
      amount_inquired: { value: req.amount.toFixed(2), currency: req.currency },
      counterparty_alias: { type: 'EMAIL', value: req.recipientAlias },
      description: req.description,
      allow_bunqme: true,
    },
    _s.sessionToken,
  )
}

export async function getBunqContacts(): Promise<BunqContact[]> {
  await initBunq()
  // Sandbox has no real contact list — return test contacts for demo
  return [
    { name: 'Francesco', alias: 'francesco@example.com' },
    { name: 'Giorgio', alias: 'giorgio@example.com' },
    { name: 'Vaggelis', alias: 'vaggelis@example.com' },
    { name: 'Diego', alias: 'diego@example.com' },
  ]
}
