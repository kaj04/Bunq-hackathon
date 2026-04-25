// POST /api/bunq/fund — aggiunge credito sandbox tramite il "sugar user" Bunq
// Il sugar user viene creato una volta e cachato per 25 minuti per evitare rate limit su /device-server
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { loadSugar, saveSugar } from '@/lib/bunq/session-store'

const BASE = 'https://public-api.sandbox.bunq.com/v1'

function sign(data: string, privateKey: string) {
  return crypto.createSign('SHA256').update(data).sign(privateKey, 'base64')
}

function makeHeaders(privateKey: string, token: string | null, method: string, path: string, body: string) {
  const h: Record<string, string> = {
    'Cache-Control': 'no-cache',
    'User-Agent': 'MeditaSplit/1.0',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'X-Bunq-Geolocation': '0 0 0 0 NL',
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'Content-Type': 'application/json',
  }
  if (token) h['X-Bunq-Client-Authentication'] = token
  // Bunq: sign ONLY the request body
  if (body) {
    h['X-Bunq-Client-Signature'] = sign(body, privateKey)
  }
  return h
}

async function sugarReq(privateKey: string, method: string, path: string, body: object | null, token: string | null) {
  const bodyStr = body ? JSON.stringify(body) : ''
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: makeHeaders(privateKey, token, method, path, bodyStr),
    body: bodyStr || undefined,
  })
  if (!r.ok) throw new Error(`Sugar ${method} ${path} → ${r.status}: ${await r.text()}`)
  return r.json()
}

async function getOrCreateSugarSession(): Promise<{ sessionToken: string; userId: number; accountId: number; privateKey: string }> {
  // Riusa sessione cachata (include privateKey ora)
  const cached = loadSugar()
  if (cached?.privateKey) {
    console.log('✓ Sugar user session restored from cache')
    return cached as { sessionToken: string; userId: number; accountId: number; privateKey: string }
  }

  // Crea un nuovo sugar user (ha API key propria, non usa la nostra)
  const sugarRes = await fetch(`${BASE}/sandbox-user-person`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'MeditaSplit/1.0',
      'X-Bunq-Language': 'en_US',
      'X-Bunq-Region': 'nl_NL',
      'X-Bunq-Geolocation': '0 0 0 0 NL',
      'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    },
    body: '',
  })
  const sugarData = await sugarRes.json()
  const sugarApiKey = sugarData.Response?.[0]?.ApiKey?.api_key
  if (!sugarApiKey) throw new Error('Could not create sugar user: ' + JSON.stringify(sugarData))

  // Genera keypair per il sugar user
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  // Handshake completo per il sugar user (usa la sua API key, non la nostra)
  const instRes = await sugarReq(privateKey, 'POST', '/installation', { client_public_key: publicKey }, null)
  const instToken = instRes.Response?.find((r: any) => r.Token)?.Token?.token
  if (!instToken) throw new Error('No installation token for sugar user')

  await sugarReq(privateKey, 'POST', '/device-server', {
    description: 'MeditaSplit-Sugar', secret: sugarApiKey, permitted_ips: ['*'],
  }, instToken)

  const sessRes = await sugarReq(privateKey, 'POST', '/session-server', { secret: sugarApiKey }, instToken)
  const sessionToken = sessRes.Response?.find((r: any) => r.Token)?.Token?.token
  const sugarUser = sessRes.Response?.find((r: any) => r.UserPerson || r.UserCompany)
  const userId = sugarUser?.UserPerson?.id ?? sugarUser?.UserCompany?.id
  if (!sessionToken || !userId) throw new Error('No sugar session/user')

  const accRes = await sugarReq(privateKey, 'GET', `/user/${userId}/monetary-account`, null, sessionToken)
  const accountId = accRes.Response?.[0]?.MonetaryAccountBank?.id
  if (!accountId) throw new Error('No sugar account')

  // Salva sessione con privateKey così il prossimo click non rifà il handshake
  saveSugar({ sessionToken, userId, accountId, privateKey })

  return { sessionToken, userId, accountId, privateKey }
}

export async function POST(req: Request) {
  try {
    const { amount = 500, iban, name } = await req.json()

    if (!iban || !name) {
      return NextResponse.json({ success: false, error: 'iban and name are required' }, { status: 400 })
    }

    const sugar = await getOrCreateSugarSession()

    // Paga dal sugar user → IBAN di Francesco
    await sugarReq(sugar.privateKey, 'POST', `/user/${sugar.userId}/monetary-account/${sugar.accountId}/payment`, {
      amount: { value: String(Number(amount).toFixed(2)), currency: 'EUR' },
      counterparty_alias: { type: 'IBAN', value: iban, name },
      description: 'MeditaSplit sandbox top-up',
    }, sugar.sessionToken)

    return NextResponse.json({ success: true, message: `Added €${amount} to ${iban}` })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
