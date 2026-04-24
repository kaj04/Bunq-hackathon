// OWNER: Francesco
import { NextRequest, NextResponse } from 'next/server'
import { createPaymentRequest } from '@/lib/bunq/client'
import type { ApiResponse, PaymentRequest } from '@/types'

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<{ mock?: boolean }>>> {
  // BUNQ_MOCK=true bypassa le chiamate reali — utile durante lo sviluppo
  if (process.env.BUNQ_MOCK === 'true') {
    const body: PaymentRequest = await req.json()
    console.log(`[MOCK] Payment request: €${body.amount} → ${body.recipientAlias}`)
    return NextResponse.json({ success: true, data: { mock: true } })
  }

  try {
    const body: PaymentRequest = await req.json()
    await createPaymentRequest(body)
    return NextResponse.json({ success: true, data: {} })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
