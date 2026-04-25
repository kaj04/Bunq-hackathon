/**
 * OWNER: Francesco
 * Crea transazioni fake tra i 4 utenti sandbox per testare l'agente.
 * Include scenari realistici in italiano e inglese, con casi-limite per il testing.
 *
 * Esegui con: npx tsx scripts/seed-transactions.ts
 */

import crypto from 'crypto'

const BASE_URL = 'https://public-api.sandbox.bunq.com/v1'

// I 4 utenti sandbox del team
const USERS = [
  { name: 'Francesco', apiKey: 'sandbox_b0b5f1946c99064e6251e19edc4f50f2dc57277db565734995cf683a', userId: 3628453 },
  { name: 'Giorgio',   apiKey: 'sandbox_2ee7914bdb64da27a9897d77c0e9bf0feac24457676f1be4c558c338', userId: 3628489 },
  { name: 'Vaggelis',  apiKey: 'sandbox_1f47bb0df479723ac150f26b130304c319b4fbdaa00c7bfebe623073', userId: 3628490 },
  { name: 'Diego',     apiKey: 'sandbox_472a630848c447bc9caa3d25eeb4fb1ecb5b081dd3b3b2b72f306a44', userId: 3628491 },
]

// Sessioni attive per ogni utente
const sessions: Record<string, { token: string; accountId: number; privateKey: string; publicKey: string }> = {}

function generateKeys() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
}

function sign(data: string, privateKey: string) {
  return crypto.createSign('SHA256').update(data).sign(privateKey, 'base64')
}

function buildHeaders(privateKey: string, _publicKey: string, token?: string, method = 'POST', path = '', body = '') {
  const h: Record<string, string> = {
    'Cache-Control': 'no-cache',
    'User-Agent': 'BunqSeed/1.0',
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Geolocation': '0 0 0 0 NL',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'Content-Type': 'application/json',
  }
  if (token) h['X-Bunq-Client-Authentication'] = token
  if (privateKey && path !== '/installation') {
    const headerStr = Object.entries(h)
      .filter(([k]) => k.startsWith('X-Bunq-') || k === 'Cache-Control' || k === 'User-Agent')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    h['X-Bunq-Client-Signature'] = sign(`${method} /v1${path}\n\n${headerStr}\n\n${body}`, privateKey)
  }
  return h
}

async function bunqPost(path: string, body: object, token?: string, privateKey = '', publicKey = '') {
  const bodyStr = JSON.stringify(body)
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(privateKey, publicKey, token, 'POST', path, bodyStr),
    body: bodyStr,
  })
  if (!res.ok) throw new Error(`POST ${path} failed ${res.status}: ${await res.text()}`)
  return res.json()
}

async function bunqGet(path: string, token: string, privateKey: string, publicKey: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: buildHeaders(privateKey, publicKey, token, 'GET', path, ''),
  })
  if (!res.ok) throw new Error(`GET ${path} failed ${res.status}: ${await res.text()}`)
  return res.json()
}

async function loginUser(user: typeof USERS[0]) {
  console.log(`\nLogging in ${user.name}...`)
  const { privateKey, publicKey } = generateKeys()

  const installRes = await bunqPost('/installation', { client_public_key: publicKey }, undefined, '', publicKey)
  const installToken = installRes.Response.find((r: any) => r.Token)?.Token.token

  await bunqPost('/device-server', {
    description: `seed-${user.name}`,
    secret: user.apiKey,
    permitted_ips: ['*'],
  }, installToken, privateKey, publicKey)

  const sessionRes = await bunqPost('/session-server', { secret: user.apiKey }, installToken, privateKey, publicKey)
  const sessionToken = sessionRes.Response.find((r: any) => r.Token)?.Token.token

  const accRes = await bunqGet(`/user/${user.userId}/monetary-account`, sessionToken, privateKey, publicKey)
  const accountId = accRes.Response[0]?.MonetaryAccountBank?.id

  sessions[user.name] = { token: sessionToken, accountId, privateKey, publicKey }
  console.log(`✓ ${user.name} — account: ${accountId}`)
}

async function createPayment(fromName: string, toUserId: number, amount: number, description: string) {
  const from = sessions[fromName]
  const fromUser = USERS.find(u => u.name === fromName)!
  await bunqPost(
    `/user/${fromUser.userId}/monetary-account/${from.accountId}/payment`,
    {
      amount: { value: amount.toFixed(2), currency: 'EUR' },
      counterparty_alias: { type: 'ID', value: String(toUserId) },
      description,
    },
    from.token, from.privateKey, from.publicKey,
  )
  const toUser = USERS.find(u => u.userId === toUserId)!
  console.log(`  💸 ${fromName} → ${toUser.name}: €${amount.toFixed(2)} (${description})`)
}

async function main() {
  console.log('=== Bunq Seed Script ===')
  console.log('Logging in all 4 users...')

  for (const user of USERS) {
    try {
      await loginUser(user)
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) {
      console.error(`✗ ${user.name} login failed:`, e)
    }
  }

  console.log('\nCreating fake transactions...')

  // Each scenario: fromName pays toUserId (Giorgio = 3628489, Francesco = 3628453, Vaggelis = 3628490, Diego = 3628491)
  const scenarios: { from: string; to: number; amount: number; desc: string }[] = [
    // ── Yesterday ────────────────────────────────────────────────────────────
    { from: 'Giorgio',   to: 3628453, amount: 25.00, desc: 'Bar Centrale - birre' },
    { from: 'Giorgio',   to: 3628453, amount: 48.50, desc: 'Pizzeria da Mario' },
    { from: 'Giorgio',   to: 3628491, amount: 34.00, desc: 'Taxi Uber - aeroporto' },
    { from: 'Giorgio',   to: 3628490, amount: 12.50, desc: 'Starbucks coffee' },

    // ── 2 days ago ────────────────────────────────────────────────────────────
    { from: 'Francesco', to: 3628489, amount: 92.00, desc: 'Cena Osteria del Porto' },
    { from: 'Francesco', to: 3628491, amount: 35.00, desc: 'Brunch Café Roma' },

    // ── 3 days ago — two aperitivo payments (ambiguous date test) ────────────
    { from: 'Diego',     to: 3628453, amount: 18.00, desc: 'Aperitivo Spritz Bar' },
    { from: 'Diego',     to: 3628490, amount: 22.00, desc: 'Aperitivo Bar Sport' },

    // ── 4 days ago ────────────────────────────────────────────────────────────
    { from: 'Vaggelis',  to: 3628453, amount: 67.30, desc: 'Supermercato Esselunga' },
    { from: 'Vaggelis',  to: 3628491, amount: 42.00, desc: 'Hackathon lunch - De Balie' },

    // ── 5 days ago ────────────────────────────────────────────────────────────
    { from: 'Francesco', to: 3628489, amount: 78.00, desc: 'Sushi restaurant Yoshimi' },
    { from: 'Diego',     to: 3628453, amount: 40.00, desc: 'Bowling The Alley' },

    // ── 6 days ago ────────────────────────────────────────────────────────────
    { from: 'Giorgio',   to: 3628491, amount: 55.00, desc: 'The Irish Pub - drinks' },

    // ── 7 days ago ────────────────────────────────────────────────────────────
    { from: 'Francesco', to: 3628489, amount: 120.00, desc: 'Cena ristorante La Pergola' },
    { from: 'Vaggelis',  to: 3628453, amount: 53.80,  desc: 'Grocery Jumbo supermarkt' },
  ]

  for (const s of scenarios) {
    try {
      await createPayment(s.from, s.to, s.amount, s.desc)
      await new Promise(r => setTimeout(r, 500))
    } catch (e) {
      console.error(`  ✗ Payment failed:`, e)
    }
  }

  console.log('\n✓ Seed completato! 15 transazioni create nel sandbox Bunq.')
  console.log('\nScenari disponibili per il test:')
  console.log('  • "Dividi le birre di ieri con Francesco e Diego"')
  console.log('  • "Split yesterday\'s pizza with Vaggelis"')
  console.log('  • "Ho pagato io la cena all\'Osteria 2 giorni fa, dividila con tutti"')
  console.log('  • "Dividi l\'aperitivo di 3 giorni fa con Francesco" → chiede quale bar')
  console.log('  • "Split the sushi from 5 days ago with Diego and Giorgio"')
  console.log('  • "Dividi la spesa di 4 giorni fa con Diego e Vaggelis"')
}

main().catch(console.error)
