// OWNER: Francesco
import { NextResponse } from 'next/server'
import { getTransactions } from '@/lib/bunq/client'

export async function GET() {
  try {
    const data = await getTransactions(20)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
