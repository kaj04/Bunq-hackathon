// GET /api/bunq/setup — diagnostica e setup completo della sessione Bunq
// Chiamalo una volta dal browser per inizializzare tutto e vedere i log
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const BASE = 'https://public-api.sandbox.bunq.com/v1'
const API_KEY = process.env.BUNQ_API_KEY!
const DEVICE_FILE = path.join(process.cwd(), '.bunq-device.json')
const SESSION_FILE = path.join(process.cwd(), '.bunq-session.json')

const log: string[] = []
function step(msg: string) { log.push(msg); console.log('[setup]', msg) }

function sign(data: string, privateKey: string) {
  return crypto.createSign('SHA256').update(data).sign(privateKey, 'base64')
}

function headers(privateKey: string, token: string | null, method: string, path: string, body: string) {
  const h: Record<string, string> = {
    'Cache-Control': 'no-cache',
    'User-Agent': 'MeditaSplit-Setup/1.0',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'X-Bunq-Geolocation': '0 0 0 0 NL',
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'Content-Type': 'application/json',
  }
  if (token) h['X-Bunq-Client-Authentication'] = token
  // Bunq: sign ONLY the request body
  if (privateKey && body) {
    h['X-Bunq-Client-Signature'] = sign(body, privateKey)
  }
  return h
}

async function req(privateKey: string, method: string, path: string, body: object | null, token: string | null) {
  const bodyStr = body ? JSON.stringify(body) : ''
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(privateKey, token, method, path, bodyStr),
    body: bodyStr || undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text}`)
  return JSON.parse(text)
}

export async function GET() {
  try {
    step(`API_KEY: ${API_KEY?.slice(0, 20)}...`)

    // Step 1: genera nuove chiavi RSA
    step('Generating RSA-2048 keypair...')
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    step('✓ Keys generated')

    // Step 2: POST /installation
    step('POST /installation...')
    const instRes = await req(privateKey, 'POST', '/installation', { client_public_key: publicKey }, null)
    const installationToken = instRes.Response?.find((r: any) => r.Token)?.Token?.token
    if (!installationToken) throw new Error('No installation token: ' + JSON.stringify(instRes))
    step(`✓ Installation token: ${installationToken.slice(0, 20)}...`)

    // Step 3: POST /device-server
    step('POST /device-server...')
    await req(privateKey, 'POST', '/device-server', {
      description: 'MeditaSplit-Setup',
      secret: API_KEY,
      permitted_ips: ['*'],
    }, installationToken)
    step('✓ Device registered')

    // Step 4: POST /session-server
    step('POST /session-server...')
    const sessRes = await req(privateKey, 'POST', '/session-server', { secret: API_KEY }, installationToken)
    const sessionToken = sessRes.Response?.find((r: any) => r.Token)?.Token?.token
    const userObj = sessRes.Response?.find((r: any) => r.UserPerson || r.UserLight || r.UserApiKey)
    const userId = userObj?.UserPerson?.id ?? userObj?.UserLight?.id ?? parseInt(process.env.BUNQ_USER_ID ?? '0')
    if (!sessionToken) throw new Error('No session token: ' + JSON.stringify(sessRes.Response?.map((r: any) => Object.keys(r))))
    step(`✓ Session token: ${sessionToken.slice(0, 20)}... userId: ${userId}`)

    // Step 5: GET /monetary-account
    step('GET /monetary-account...')
    const accRes = await req(privateKey, 'GET', `/user/${userId}/monetary-account`, null, sessionToken)
    const account = accRes.Response?.[0]?.MonetaryAccountBank
    const accountId = account?.id
    const balance = account?.balance?.value
    const iban = account?.alias?.find((a: any) => a.type === 'IBAN')?.value
    if (!accountId) throw new Error('No account: ' + JSON.stringify(accRes.Response?.map((r: any) => Object.keys(r))))
    step(`✓ Account: id=${accountId} balance=${balance} IBAN=${iban}`)

    // Salva device e session su disco
    fs.writeFileSync(DEVICE_FILE, JSON.stringify({ privateKey, publicKey, installationToken, savedAt: Date.now() }, null, 2))
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ sessionToken, userId, accountId, savedAt: Date.now() }, null, 2))
    step('✓ Device and session saved to disk')

    return NextResponse.json({ success: true, log, userId, accountId, balance, iban })
  } catch (err) {
    step(`✗ ERROR: ${err}`)
    return NextResponse.json({ success: false, log, error: String(err) }, { status: 500 })
  }
}
