// OWNER: Francesco
import { NextRequest, NextResponse } from 'next/server'
import { createPaymentRequest } from '@/lib/bunq/client'
import type { ApiResponse, PaymentRequest } from '@/types'

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<null>>> {
  try {
    const body: PaymentRequest = await req.json()
    await createPaymentRequest(body)
    return NextResponse.json({ success: true, data: null })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
