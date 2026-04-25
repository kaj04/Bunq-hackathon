import { NextResponse } from 'next/server'
import { loadSession } from '@/lib/bunq/session-store'
import { SANDBOX_USERS } from '@/lib/bunq/client'

export async function GET() {
  const session = loadSession()
  const userId = session?.userId ?? null
  const sandboxUser = userId ? SANDBOX_USERS.find(u => u.userId === userId) : null
  const name = sandboxUser?.name ?? process.env.BUNQ_USER_NAME ?? 'Me'
  return NextResponse.json({ success: true, data: { name, userId } })
}
