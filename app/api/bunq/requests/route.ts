// OWNER: Francesco
// GET  → richieste di pagamento in arrivo (da accettare)
import { NextResponse } from 'next/server'
import { getIncomingRequests } from '@/lib/bunq/client'

export async function GET() {
  try {
    const data = await getIncomingRequests()
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
