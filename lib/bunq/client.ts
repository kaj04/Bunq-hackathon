// OWNER: Francesco
// Bunq Sandbox API client
// Docs: https://developer.bunq.com/en/

import type { BunqContact, PaymentRequest } from "@/types"

const BUNQ_API_URL = "https://public-api.sandbox.bunq.com/v1"
const API_KEY = process.env.BUNQ_API_KEY!

// TODO Francesco: implementa session token flow
// 1. POST /installation  → installation token
// 2. POST /device-server → registra device
// 3. POST /session-server → session token (usato per tutte le chiamate)

let sessionToken: string | null = null

async function getSessionToken(): Promise<string> {
  if (sessionToken) return sessionToken
  // TODO: implementa handshake Bunq
  throw new Error("Bunq session not initialized")
}

export async function getBunqContacts(): Promise<BunqContact[]> {
  const token = await getSessionToken()
  // TODO: GET /user/{userId}/monetary-account/{accountId}/schedule-payment
  return []
}

export async function createPaymentRequest(req: PaymentRequest): Promise<void> {
  const token = await getSessionToken()
  // TODO: POST /user/{userId}/monetary-account/{accountId}/request-inquiry
  // Body: { amount: { value: req.amount, currency: req.currency }, counterparty_alias: { type: "EMAIL", value: req.recipientAlias }, description: req.description }
}
