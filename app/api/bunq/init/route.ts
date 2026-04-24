// Test endpoint — verifica che il Bunq handshake funzioni
import { NextResponse } from 'next/server'
import { initBunq } from '@/lib/bunq/client'

export async function GET() {
  try {
    await initBunq()
    return NextResponse.json({ success: true, message: 'Bunq session initialized' })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
