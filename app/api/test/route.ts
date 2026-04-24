import { NextResponse } from 'next/server'
import { getBalance, getTransactions, getIncomingRequests } from '@/lib/bunq/client'
import Anthropic from '@anthropic-ai/sdk'

export async function GET() {
  const results: Record<string, any> = {}

  try { results.balance = await getBalance() }
  catch (e) { results.balance = { error: String(e) } }

  try { results.transactions = await getTransactions(3) }
  catch (e) { results.transactions = { error: String(e) } }

  try { results.requests = await getIncomingRequests() }
  catch (e) { results.requests = { error: String(e) } }

  try {
    const client = new Anthropic({ apiKey: process.env.APP_CLAUDE_KEY })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Reply only with: OK' }],
    })
    results.claude = { ok: true, response: (msg.content[0] as any).text }
  } catch (e) { results.claude = { error: String(e) } }

  const allOk = Object.values(results).every((r: any) => !r?.error)
  return NextResponse.json({ ok: allOk, mock: process.env.BUNQ_MOCK === 'true', results })
}
