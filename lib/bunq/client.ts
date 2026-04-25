// OWNER: Francesco
import crypto from 'crypto'
import {
  loadDevice, saveDevice,
  loadSession, saveSession, clearSession,
} from './session-store'
import type { BunqContact, PaymentRequest } from '@/types'

const BASE_URL = 'https://public-api.sandbox.bunq.com/v1'
const MOCK = process.env.BUNQ_MOCK === 'true'

// ─── In-memory state ─────────────────────────────────────────────────────────
// Sopravvive tra le chiamate nello stesso processo Next.js; si resetta su cold start.
// Il file system (session-store) è la fonte di verità tra processi/cold start.

const _s = {
  privateKey: '',
  publicKey: '',
  installationToken: '',
  sessionToken: '',
  userId: 0,
  accountId: 0,
}

let _sessionPromise: Promise<void> | null = null

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
  // Bunq: sign ONLY the request body (SHA256 + RSA PKCS#1 v1.5 + base64)
  if (_s.privateKey && body) {
    h['X-Bunq-Client-Signature'] = sign(body)
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
  if (!res.ok) {
    const text = await res.text()
    const err = new Error(`Bunq ${method} ${path} → ${res.status}: ${text}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json()
}

// ─── Device registration — solo la prima volta o dopo 30 giorni ──────────────
// POST /installation + POST /device-server sono RATE LIMITED.
// Una volta registrato, il device rimane valido e non va mai riregistrato.

async function _ensureDevice() {
  const stored = loadDevice()
  if (stored) {
    // Riusa keypair e installation token esistenti
    _s.privateKey = stored.privateKey
    _s.publicKey = stored.publicKey
    _s.installationToken = stored.installationToken
    console.log('✓ Bunq device registration loaded from disk')
    return
  }

  console.log('→ Bunq: registering new device (first time)')
  generateKeys()
  const API_KEY = process.env.BUNQ_API_KEY!

  const installRes = await bunqReq('POST', '/installation', { client_public_key: _s.publicKey }, '')
  _s.installationToken = installRes.Response.find((r: any) => r.Token)?.Token.token

  // Questo è il passo RATE LIMITED — viene chiamato una sola volta grazie al file
  await bunqReq('POST', '/device-server', {
    description: 'bunq-hackathon', secret: API_KEY, permitted_ips: ['*'],
  }, _s.installationToken)

  saveDevice({
    privateKey: _s.privateKey,
    publicKey: _s.publicKey,
    installationToken: _s.installationToken,
  })
  console.log('✓ Bunq device registered and saved to disk')
}

// ─── Session creation — ogni ora circa, senza toccare device-server ───────────

async function _createSession() {
  await _ensureDevice()

  const API_KEY = process.env.BUNQ_API_KEY!
  const sessionRes = await bunqReq('POST', '/session-server', { secret: API_KEY }, _s.installationToken)
  _s.sessionToken = sessionRes.Response.find((r: any) => r.Token)?.Token.token
  _s.userId = sessionRes.Response.find((r: any) => r.UserPerson)?.UserPerson?.id
    ?? parseInt(process.env.BUNQ_USER_ID ?? '0')

  const accRes = await bunqReq('GET', `/user/${_s.userId}/monetary-account`, undefined, _s.sessionToken)
  _s.accountId = accRes.Response[0]?.MonetaryAccountBank?.id

  saveSession({ sessionToken: _s.sessionToken, userId: _s.userId, accountId: _s.accountId })
  console.log(`✓ Bunq session created — user: ${_s.userId}, account: ${_s.accountId}`)
}

// ─── Public init — chiamato da ogni funzione API ──────────────────────────────

export async function initBunq() {
  // Fast path: sessione già in memoria
  if (_s.sessionToken) return

  // Second fast path: sessione valida su disco (tra cold start)
  const session = loadSession()
  if (session) {
    // Carica anche le chiavi dal device file per poter firmare le prossime richieste
    const device = loadDevice()
    if (device) {
      _s.privateKey = device.privateKey
      _s.publicKey = device.publicKey
      _s.installationToken = device.installationToken
    }
    _s.sessionToken = session.sessionToken
    _s.userId = session.userId
    _s.accountId = session.accountId
    console.log('✓ Bunq session restored from disk')
    return
  }

  // Sessione scaduta — ne creiamo una nuova SENZA rifar device-server
  if (!_sessionPromise) {
    _sessionPromise = _createSession().catch(e => {
      _sessionPromise = null
      // Cancella solo la sessione, MAI il device registration
      clearSession()
      throw e
    })
  }
  return _sessionPromise
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Pagamento diretto (simulazione spesa personale) — appare nelle transazioni */
export async function makePayment(amount: number, description: string) {
  if (MOCK) {
    MOCK_TRANSACTIONS.unshift({
      id: Date.now(),
      amount: `-${amount.toFixed(2)}`,
      currency: 'EUR',
      description,
      type: 'out',
      counterparty: 'sugardaddy@bunq.com',
      date: new Date().toISOString().slice(0, 10),
    })
    console.log(`[MOCK] Payment €${amount}: ${description}`)
    return { mock: true }
  }
  await initBunq()
  return bunqReq('POST', `/user/${_s.userId}/monetary-account/${_s.accountId}/payment`, {
    amount: { value: amount.toFixed(2), currency: 'EUR' },
    counterparty_alias: { type: 'EMAIL', value: 'sugardaddy@bunq.com' },
    description,
  })
}

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
    const total = requests.reduce((s, r) => s + r.amount, 0)
    const batchId = Date.now()
    MOCK_TRANSACTIONS.unshift({
      id: batchId,
      amount: `-${total.toFixed(2)}`,
      currency: 'EUR',
      description: requests[0]?.description ?? 'Group split',
      type: 'out',
      counterparty: requests.map(r => r.recipientAlias.split('@')[0]).join(', '),
      date: new Date().toISOString().slice(0, 10),
    })
    console.log(`[MOCK] Group split: ${requests.map(r => `€${r.amount}→${r.recipientAlias}`).join(', ')}`)
    return { mock: true, batchId }
  }
  await initBunq()
  const total = requests.reduce((s, r) => s + r.amount, 0)
  const res = await bunqReq('POST', `/user/${_s.userId}/monetary-account/${_s.accountId}/request-inquiry-batch`, {
    request_inquiries: requests.map(r => ({
      amount_inquired: { value: r.amount.toFixed(2), currency: r.currency },
      counterparty_alias: { type: 'EMAIL', value: r.recipientAlias },
      description: r.description,
      allow_bunqme: true,
    })),
    total_amount_inquired: { value: total.toFixed(2), currency: 'EUR' },
  })
  const batchId: number = res.Response?.[0]?.Id?.id ?? res.Response?.[0]?.RequestInquiryBatch?.id ?? 0
  return { ...res, batchId }
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

/** IBAN e nome dell'account corrente (per il funding) */
export async function getMyAccountInfo(): Promise<{ iban: string; name: string } | null> {
  if (MOCK) return { iban: 'NL00BUNQ0123456789', name: 'Francesco Test' }
  await initBunq()
  const res = await bunqReq('GET', `/user/${_s.userId}/monetary-account`)
  const acc = res.Response[0]?.MonetaryAccountBank
  if (!acc) return null
  const ibanAlias = acc.alias?.find((a: any) => a.type === 'IBAN')
  return ibanAlias ? { iban: ibanAlias.value, name: acc.display_name ?? 'Francesco' } : null
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
  if (MOCK) return [
    { name: 'Giorgio',   alias: 'giorgio@sandbox.com' },
    { name: 'Vaggelis',  alias: 'vaggelis@sandbox.com' },
    { name: 'Diego',     alias: 'diego@sandbox.com' },
  ]
  await initBunq()
  return SANDBOX_USERS.filter(u => u.userId !== _s.userId)
    .map(u => ({ name: u.name, alias: u.alias }))
}

/** Fetch email alias for a specific sandbox userId */
export async function getSandboxUserEmail(userId: number): Promise<string | null> {
  if (MOCK) {
    const u = SANDBOX_USERS.find(u => u.userId === userId)
    return u?.alias ?? null
  }
  await initBunq()
  try {
    const res = await bunqReq('GET', `/user/${userId}`)
    const user = res.Response.find((r: any) => r.UserPerson || r.UserCompany || r.UserLight)
    const userObj = user?.UserPerson ?? user?.UserCompany ?? user?.UserLight
    const emailAlias = userObj?.alias?.find((a: any) => a.type === 'EMAIL')
    return emailAlias?.value ?? null
  } catch {
    return null
  }
}

/** Resolve email aliases — reads from bunq-members.json (shared) overriding with bunq-accounts.json (local) */
export async function resolveMemberAliases(): Promise<{ name: string; userId: number; alias: string }[]> {
  const fs = await import('fs')
  const path = await import('path')

  // Load shared public registry (names + emails, committable)
  const membersPath = path.join(process.cwd(), 'bunq-members.json')
  let members: { name: string; userId: number; alias: string }[] = [...SANDBOX_USERS]
  if (fs.existsSync(membersPath)) {
    try {
      const fromFile = JSON.parse(fs.readFileSync(membersPath, 'utf8')) as typeof members
      // Merge: file entries override hardcoded ones
      for (const entry of fromFile) {
        const idx = members.findIndex(m => m.name.toLowerCase() === entry.name.toLowerCase())
        if (idx >= 0) members[idx] = entry
        else members.push(entry)
      }
    } catch { /* keep defaults */ }
  }

  // Also override with local .bunq-accounts.json (highest priority — own machine)
  const accountsPath = path.join(process.cwd(), '.bunq-accounts.json')
  if (fs.existsSync(accountsPath)) {
    try {
      const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8')) as Record<string, { email: string; userId: number }>
      for (const [name, acc] of Object.entries(accounts)) {
        if (!acc.email) continue
        const idx = members.findIndex(m => m.name.toLowerCase() === name.toLowerCase())
        if (idx >= 0) members[idx] = { ...members[idx], userId: acc.userId, alias: acc.email }
        else members.push({ name, userId: acc.userId, alias: acc.email })
      }
    } catch { /* keep defaults */ }
  }

  return members
}

export const SANDBOX_USERS = [
  { name: 'Francesco', userId: 3629040, alias: 'test+04f633e0-a0b9-462f-bb2f-d71d81d7d8ad@bunq.com' },
  { name: 'Giorgio',   userId: 3629030, alias: 'test+708be9a9-dcde-4a0a-95c2-d485b72850a4@bunq.com' },
  { name: 'Vaggelis',  userId: 3629028, alias: 'test+a1223711-bee6-4974-bc54-b3ed8b11f121@bunq.com' },
  { name: 'Diego',     userId: 3629045, alias: 'test+0e48be1e-7446-4b25-b0ac-6c16fbb0f38d@bunq.com' },
]

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TRANSACTIONS: { id: number; amount: string; currency: string; description: string; type: string; counterparty: string; date: string }[] = [
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
