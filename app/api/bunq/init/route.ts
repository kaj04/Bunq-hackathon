// Test endpoint — verifica che il Bunq handshake funzioni
import { NextResponse } from 'next/server'
import { initBunq } from '@/lib/bunq/client'

export async function GET() {
  if (process.env.BUNQ_MOCK === 'true') {
    return NextResponse.json({ success: true, message: 'Bunq in MOCK mode — pagamenti simulati' })
  }
  try {
    await initBunq()
    return NextResponse.json({ success: true, message: 'Bunq session initialized' })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
