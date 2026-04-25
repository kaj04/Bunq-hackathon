import { NextResponse } from 'next/server'
import { loadSession } from '@/lib/bunq/session-store'
import { resolveMemberAliases } from '@/lib/bunq/client'

export async function GET() {
  const session = loadSession()
  const userId = session?.userId ?? null
  const members = await resolveMemberAliases()
  const me = userId ? members.find(u => u.userId === userId) : null
  const name = me?.name ?? process.env.BUNQ_USER_NAME ?? 'Me'
  const alias = me?.alias ?? null
  return NextResponse.json({ success: true, data: { name, userId, alias } })
}
