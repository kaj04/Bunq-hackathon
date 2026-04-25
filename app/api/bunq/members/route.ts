// GET /api/bunq/members — restituisce i 4 utenti sandbox con i loro alias email reali
import { NextResponse } from 'next/server'
import { resolveMemberAliases } from '@/lib/bunq/client'

export async function GET() {
  try {
    const members = await resolveMemberAliases()
    return NextResponse.json({ success: true, data: members })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
