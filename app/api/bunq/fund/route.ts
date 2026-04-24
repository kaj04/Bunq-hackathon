// Adds sandbox credit via Bunq's "sugar user" (has unlimited funds)
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const BASE = 'https://public-api.sandbox.bunq.com/v1'

export async function POST(req: Request) {
  try {
    const { amount = 500, iban, name } = await req.json()

    if (!iban || !name) {
      return NextResponse.json({ success: false, error: 'iban and name are required' }, { status: 400 })
    }

    // Step 1: Create a Bunq sandbox "sugar" user with unlimited funds
    const sugarRes = await fetch(`${BASE}/sandbox-user-person`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'MeditaSplit/1.0', 'X-Bunq-Language': 'en_US', 'X-Bunq-Region': 'nl_NL', 'X-Bunq-Geolocation': '0 0 0 0 NL', 'X-Bunq-Client-Request-Id': crypto.randomUUID() },
      body: '',
    })
    const sugarData = await sugarRes.json()
    const sugarApiKey = sugarData.Response?.[0]?.ApiKey?.api_key
    if (!sugarApiKey) throw new Error('Could not create sugar user: ' + JSON.stringify(sugarData))

    // Step 2: Handshake for sugar user (installation → device-server → session)
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    function sign(data: string) {
      return crypto.createSign('SHA256').update(data).sign(privateKey, 'base64')
    }

    function headers(token: string | null, method: string, path: string, body: string) {
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
      if (path !== '/installation') {
        const headerStr = Object.entries(h)
          .filter(([k]) => k.startsWith('X-Bunq-') || k === 'Cache-Control' || k === 'User-Agent')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')
        h['X-Bunq-Client-Signature'] = sign(`${method} /v1${path}\n\n${headerStr}\n\n${body}`)
      }
      return h
    }

    async function req2(method: string, path: string, body: object | null, token: string | null) {
      const bodyStr = body ? JSON.stringify(body) : ''
      const r = await fetch(`${BASE}${path}`, {
        method,
        headers: headers(token, method, path, bodyStr),
        body: bodyStr || undefined,
      })
      if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${await r.text()}`)
      return r.json()
    }

    // Installation
    const instRes = await req2('POST', '/installation', { client_public_key: publicKey }, null)
    const instToken = instRes.Response?.find((r: any) => r.Token)?.Token?.token
    if (!instToken) throw new Error('No installation token')

    // Device server
    await req2('POST', '/device-server', { description: 'MeditaSplit-Sugar', secret: sugarApiKey, permitted_ips: ['*'] }, instToken)

    // Session
    const sessRes = await req2('POST', '/session-server', { secret: sugarApiKey }, instToken)
    const sugarSession = sessRes.Response?.find((r: any) => r.Token)?.Token?.token
    const sugarUser = sessRes.Response?.find((r: any) => r.UserPerson || r.UserCompany)
    const sugarUserId = sugarUser?.UserPerson?.id ?? sugarUser?.UserCompany?.id
    if (!sugarSession || !sugarUserId) throw new Error('No sugar session/user')

    // Get sugar user's first account
    const accRes = await req2('GET', `/user/${sugarUserId}/monetary-account`, null, sugarSession)
    const sugarAccount = accRes.Response?.[0]?.MonetaryAccountBank
    const sugarAccountId = sugarAccount?.id
    if (!sugarAccountId) throw new Error('No sugar account')

    // Step 3: Make payment from sugar → target IBAN
    await req2('POST', `/user/${sugarUserId}/monetary-account/${sugarAccountId}/payment`, {
      amount: { value: String(amount), currency: 'EUR' },
      counterparty_alias: { type: 'IBAN', value: iban, name },
      description: 'MeditaSplit sandbox top-up',
    }, sugarSession)

    return NextResponse.json({ success: true, message: `Added €${amount} to ${iban}` })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
