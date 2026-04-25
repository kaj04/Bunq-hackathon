// OWNER: Francesco
// Invia richieste di pagamento a più persone in una sola chiamata (travel group split)
import { NextRequest, NextResponse } from 'next/server'
import { createGroupSplit } from '@/lib/bunq/client'

export type GroupSplitBody = {
  description: string
  totalAmount: number
  members: { name: string; alias: string; amount: number }[]
}

export async function POST(req: NextRequest) {
  try {
    const { description, totalAmount, members }: GroupSplitBody = await req.json()

    const requests = members.map(m => ({
      recipientAlias: m.alias,
      amount: m.amount,
      currency: 'EUR' as const,
      description,
    }))

    const data = await createGroupSplit(requests)
    const batchId: number = data.batchId ?? 0
    return NextResponse.json({ success: true, data, batchId, totalAmount, memberCount: members.length })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
