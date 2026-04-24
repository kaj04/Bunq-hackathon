// OWNER: Francesco
import crypto from 'crypto'
import { loadSession, saveSession, clearSession } from './session-store'
import { MOCK_CONTACTS } from './mock-data'
import type { BunqContact, PaymentRequest } from '@/types'

const BASE_URL = 'https://public-api.sandbox.bunq.com/v1'
const MOCK = process.env.BUNQ_MOCK === 'true'

// ─── Session state ────────────────────────────────────────────────────────────

const _s = {
  privateKey: '',
  publicKey: '',
  installationToken: '',
  sessionToken: '',
  userId: 0,
  accountId: 0,
}

let _initPromise: Promise<void> | null = null

// ─── Crypto helpers ───────────────────────────────────────────────────────────

function generateKeys() {
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

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function buildHeaders(token?: string, method = 'POST', path = '', body = '') {
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
    h['X-Bunq-Client-Signature'] = sign(`${method} /v1${path}\n\n${headerStr}\n\n${body}`)
  }
  return h
}

async function bunqReq(method: 'POST' | 'GET' | 'PUT', path: string, body?: object, token?: string) {
  const bodyStr = body ? JSON.stringify(body) : ''
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: buildHeaders(token ?? _s.sessionToken, method, path, bodyStr),
    body: bodyStr || undefined,
  })
  if (!res.ok) throw new Error(`Bunq ${method} ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

// ─── Handshake ────────────────────────────────────────────────────────────────

export async function bunqGetPublic(path: string) {
  await initBunq()
  return bunqReq('GET', path)
}

async function _init() {
  // Try to restore session from disk first
  const stored = loadSession()
  if (stored) {
    Object.assign(_s, stored)
    console.log('✓ Bunq session restored from disk')
    return
  }

  generateKeys()
  const API_KEY = process.env.BUNQ_API_KEY!

  const installRes = await bunqReq('POST', '/installation', { client_public_key: _s.publicKey }, '')
  _s.installationToken = installRes.Response.find((r: any) => r.Token)?.Token.token

  await bunqReq('POST', '/device-server', {
    description: 'bunq-hackathon', secret: API_KEY, permitted_ips: ['*'],
  }, _s.installationToken)

  const sessionRes = await bunqReq('POST', '/session-server', { secret: API_KEY }, _s.installationToken)
  _s.sessionToken = sessionRes.Response.find((r: any) => r.Token)?.Token.token
  _s.userId = sessionRes.Response.find((r: any) => r.UserPerson)?.UserPerson?.id

  const accRes = await bunqReq('GET', `/user/${_s.userId}/monetary-account`, undefined, _s.sessionToken)
  _s.accountId = accRes.Response[0]?.MonetaryAccountBank?.id

  saveSession({ ..._s })
  console.log(`✓ Bunq session created — user: ${_s.userId}, account: ${_s.accountId}`)
}

export async function initBunq() {
  if (_s.sessionToken) return
  if (!_initPromise) {
    _initPromise = _init().catch(e => {
      _initPromise = null
      clearSession()
      throw e
    })
  }
  return _initPromise
}

export async function getBunqSession() {
  await initBunq()
  return {
    userId: _s.userId,
    accountId: _s.accountId,
    sessionToken: _s.sessionToken,
    privateKey: _s.privateKey,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Invia richiesta di pagamento a una persona */
export async function createPaymentRequest(req: PaymentRequest) {
  if (MOCK) { console.log(`[MOCK] Request €${req.amount} → ${req.recipientAlias}`); return { mock: true } }
  await initBunq()
  return bunqReq('POST', `/user/${_s.userId}/monetary-account/${_s.accountId}/request-inquiry`, {
    amount_inquired: { value: req.amount.toFixed(2), currency: req.currency },
    counterparty_alias: { type: 'EMAIL', value: req.recipientAlias },
    description: req.description,
    allow_bunqme: true,
  })
}

/** Invia richieste di pagamento a più persone in una volta (split di gruppo) */
export async function createGroupSplit(requests: PaymentRequest[]) {
  if (MOCK) {
    console.log(`[MOCK] Group split: ${requests.map(r => `€${r.amount}→${r.recipientAlias}`).join(', ')}`)
    return { mock: true }
  }
  await initBunq()
  const total = requests.reduce((s, r) => s + r.amount, 0)
  return bunqReq('POST', `/user/${_s.userId}/monetary-account/${_s.accountId}/request-inquiry-batch`, {
    request_inquiries: requests.map(r => ({
      amount_inquired: { value: r.amount.toFixed(2), currency: r.currency },
      counterparty_alias: { type: 'EMAIL', value: r.recipientAlias },
      description: r.description,
      allow_bunqme: true,
    })),
    total_amount_inquired: { value: total.toFixed(2), currency: 'EUR' },
  })
}

/** Saldo e info account corrente */
export async function getBalance() {
  if (MOCK) return [{ name: 'Main Account', balance: '1000.00', currency: 'EUR' }]
  await initBunq()
  const res = await bunqReq('GET', `/user/${_s.userId}/monetary-account`)
  return res.Response.map((r: any) => {
    const acc = r.MonetaryAccountBank
    return { name: acc?.description, balance: acc?.balance?.value, currency: acc?.balance?.currency }
  }).filter(Boolean)
}

/** Ultime transazioni */
export async function getTransactions(count = 20) {
  if (MOCK) return MOCK_TRANSACTIONS
  await initBunq()
  const res = await bunqReq('GET', `/user/${_s.userId}/monetary-account/${_s.accountId}/payment`)
  return res.Response.slice(0, count).map((r: any) => {
    const p = r.Payment
    return {
      id: p?.id,
      amount: p?.amount?.value,
      currency: p?.amount?.currency,
      description: p?.description,
      type: parseFloat(p?.amount?.value) > 0 ? 'in' : 'out',
      counterparty: p?.counterparty_alias?.display_name,
      date: p?.created,
    }
  })
}

/** Richieste di pagamento in arrivo (che devo accettare) */
export async function getIncomingRequests() {
  if (MOCK) return MOCK_REQUESTS
  await initBunq()
  const res = await bunqReq('GET', `/user/${_s.userId}/monetary-account/${_s.accountId}/request-response`)
  return res.Response.map((r: any) => {
    const req = r.RequestResponse
    return {
      id: req?.id,
      amount: req?.amount_inquired?.value,
      currency: req?.amount_inquired?.currency,
      description: req?.description,
      from: req?.counterparty_alias?.display_name,
      status: req?.status,
      date: req?.created,
    }
  }).filter((r: any) => r.status === 'PENDING')
}

/** Accetta una richiesta di pagamento in arrivo */
export async function acceptPaymentRequest(requestResponseId: number) {
  if (MOCK) { console.log(`[MOCK] Accepted request ${requestResponseId}`); return { mock: true } }
  await initBunq()
  return bunqReq('PUT', `/user/${_s.userId}/monetary-account/${_s.accountId}/request-response/${requestResponseId}`, {
    status: 'ACCEPTED',
  })
}

export async function getBunqContacts(): Promise<BunqContact[]> {
  if (MOCK) return MOCK_CONTACTS
  if (!_s.sessionToken) await initBunq()
  // Bunq sandbox has no contact API — use hardcoded team members for demo
  return MOCK_CONTACTS
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TRANSACTIONS = [
  { id: 1, amount: '-25.50', currency: 'EUR', description: 'Cena da Mario - pizza',         type: 'out', counterparty: 'Giorgio',   date: '2026-04-24' },
  { id: 2, amount: '+18.00', currency: 'EUR', description: 'Cena da Mario - pasta',         type: 'in',  counterparty: 'Giorgio',   date: '2026-04-24' },
  { id: 3, amount: '-34.00', currency: 'EUR', description: 'Taxi condiviso aeroporto',      type: 'out', counterparty: 'Diego',     date: '2026-04-23' },
  { id: 4, amount: '+22.00', currency: 'EUR', description: 'Cinema biglietti x4',           type: 'in',  counterparty: 'Vaggelis',  date: '2026-04-23' },
  { id: 5, amount: '-8.50',  currency: 'EUR', description: 'Caffè e cornetti',              type: 'out', counterparty: 'Vaggelis',  date: '2026-04-22' },
  { id: 6, amount: '-45.00', currency: 'EUR', description: 'Supermercato spesa settimana',  type: 'out', counterparty: 'Diego',     date: '2026-04-22' },
]

const MOCK_REQUESTS = [
  { id: 101, amount: '15.75', currency: 'EUR', description: 'Pranzo hackathon',       from: 'Diego',     status: 'PENDING', date: '2026-04-24' },
  { id: 102, amount: '12.50', currency: 'EUR', description: 'Aperitivo bar centro',   from: 'Vaggelis',  status: 'PENDING', date: '2026-04-23' },
]
