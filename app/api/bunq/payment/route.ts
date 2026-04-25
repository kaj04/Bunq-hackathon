// POST /api/bunq/payment — personal payment (simulated card spend)
import { NextRequest, NextResponse } from 'next/server'
import { makePayment } from '@/lib/bunq/client'

export async function POST(req: NextRequest) {
  try {
    const { amount, description, category, categoryEmoji, location, timestamp } = await req.json()
    if (!amount || !description) {
      return NextResponse.json({ success: false, error: 'amount and description are required' }, { status: 400 })
    }

    // Build enriched description for LLM context:
    // "[Food & Drink] Dinner at Mario's — Amsterdam, NL — 20:15"
    const time = timestamp
      ? new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const locationStr = location ? `${location.city}, ${location.country}` : null
    const categoryStr = category ? `[${category}]` : null

    const enrichedDescription = [
      categoryStr,
      description,
      locationStr ? `— ${locationStr}` : null,
      `— ${time}`,
    ].filter(Boolean).join(' ')

    const data = await makePayment(parseFloat(amount), enrichedDescription)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
