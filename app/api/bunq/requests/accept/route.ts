// OWNER: Francesco
// POST → accetta una richiesta di pagamento con un click (sottrae i soldi dalla tua carta)
import { NextRequest, NextResponse } from 'next/server'
import { acceptPaymentRequest } from '@/lib/bunq/client'

export async function POST(req: NextRequest) {
  try {
    const { requestResponseId } = await req.json()
    const data = await acceptPaymentRequest(Number(requestResponseId))
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
