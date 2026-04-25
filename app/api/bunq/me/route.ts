import { NextResponse } from 'next/server'
import { loadSession } from '@/lib/bunq/session-store'

export async function GET() {
  const name = process.env.BUNQ_USER_NAME ?? 'Me'
  const session = loadSession()
  return NextResponse.json({ success: true, data: { name, userId: session?.userId ?? null } })
}
