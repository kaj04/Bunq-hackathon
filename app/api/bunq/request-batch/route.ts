import { NextRequest, NextResponse } from 'next/server'
import { createPaymentRequestBatch } from '@/lib/bunq/client'
import type { ApiResponse, PaymentRequest } from '@/types'

export async function POST(
  req: NextRequest,
): Promise<NextResponse<ApiResponse<{ mock?: boolean }>>> {
  if (process.env.BUNQ_MOCK === 'true') {
    const { requests }: { requests: PaymentRequest[] } = await req.json()
    console.log(`[MOCK] Batch: ${requests.length} requests`)
    requests.forEach(r => console.log(`  → €${r.amount} to ${r.recipientAlias}`))
    return NextResponse.json({ success: true, data: { mock: true } })
  }

  try {
    const { requests }: { requests: PaymentRequest[] } = await req.json()
    if (!requests?.length) {
      return NextResponse.json({ success: false, error: 'No requests provided' }, { status: 400 })
    }
    const result = await createPaymentRequestBatch(requests)
    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
