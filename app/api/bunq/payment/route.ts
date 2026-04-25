// POST /api/bunq/payment — crea un pagamento diretto (spesa personale, non split)
// Simula "ho pagato X" — appare nelle transazioni come uscita
import { NextRequest, NextResponse } from 'next/server'
import { makePayment } from '@/lib/bunq/client'

export async function POST(req: NextRequest) {
  try {
    const { amount, description, counterpartyUserId } = await req.json()
    if (!amount || !description) {
      return NextResponse.json({ success: false, error: 'amount and description are required' }, { status: 400 })
    }
    const data = await makePayment(parseFloat(amount), description)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
