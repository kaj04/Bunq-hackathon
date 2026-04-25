// POST /api/bunq/fund-me — ricarica il saldo tramite Sugar Daddy (sistema ufficiale Bunq sandbox)
// Invia una request-inquiry a sugardaddy@bunq.com — Bunq accredita automaticamente fino a €500
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const BASE = 'https://public-api.sandbox.bunq.com/v1'
const _suffix = process.env.BUNQ_USER_NAME ? `-${process.env.BUNQ_USER_NAME}` : ''
const DEVICE_FILE = path.join(process.cwd(), `.bunq-device${_suffix}.json`)
const SESSION_FILE = path.join(process.cwd(), `.bunq-session${_suffix}.json`)

function sign(body: string, privateKey: string) {
  return crypto.createSign('SHA256').update(body).sign(privateKey, 'base64')
}

function makeHeaders(privateKey: string, token: string, body: string) {
  const h: Record<string, string> = {
    'Cache-Control': 'no-cache',
    'User-Agent': 'MeditaSplit/1.0',
    'X-Bunq-Client-Request-Id': crypto.randomUUID(),
    'X-Bunq-Geolocation': '0 0 0 0 NL',
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'Content-Type': 'application/json',
    'X-Bunq-Client-Authentication': token,
  }
  if (body) h['X-Bunq-Client-Signature'] = sign(body, privateKey)
  return h
}

export async function POST(req: NextRequest) {
  try {
    const { amount = 500 } = await req.json().catch(() => ({}))

    if (!fs.existsSync(SESSION_FILE) || !fs.existsSync(DEVICE_FILE)) {
      return NextResponse.json({ success: false, error: 'Session not initialized. Run node scripts/bunq-setup.mjs first.' }, { status: 400 })
    }

    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
    const device = JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf8'))

    const body = JSON.stringify({
      amount_inquired: { value: Number(amount).toFixed(2), currency: 'EUR' },
      counterparty_alias: { type: 'EMAIL', value: 'sugardaddy@bunq.com' },
      description: 'MeditaSplit sandbox top-up',
      allow_bunqme: false,
    })

    const res = await fetch(`${BASE}/user/${session.userId}/monetary-account/${session.accountId}/request-inquiry`, {
      method: 'POST',
      headers: makeHeaders(device.privateKey, session.sessionToken, body),
      body,
    })

    const text = await res.text()
    if (!res.ok) throw new Error(`request-inquiry → ${res.status}: ${text}`)

    return NextResponse.json({ success: true, message: `Requested €${amount} from Sugar Daddy` })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
