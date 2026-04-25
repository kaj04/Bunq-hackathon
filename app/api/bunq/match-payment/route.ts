import { NextRequest, NextResponse } from 'next/server'
import { getBunqSession, bunqGetPublic } from '@/lib/bunq/client'
import { MOCK_PAYMENTS } from '@/lib/bunq/mock-data'
import { isMock } from '@/lib/mock-flag'

type MatchedPayment = {
  id: number
  amount: number
  description: string
  date: string
  counterparty: string
}


export async function POST(req: NextRequest) {
  try {
    const { amount } = await req.json()
    const target = parseFloat(amount)
    if (isNaN(target) || target <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 })
    }

    // Allow ±5% or ±€1.00, whichever is larger — covers OCR rounding and service charges
    const tolerance = Math.max(1.0, target * 0.05)

    let matches: MatchedPayment[]

    if (isMock()) {
      matches = MOCK_PAYMENTS
        .filter(p => {
          const v = parseFloat(p.amount.value)
          return Math.abs(v - target) <= tolerance
        })
        .map(p => ({
          id: p.id,
          amount: parseFloat(p.amount.value),
          description: p.description,
          date: p.created.slice(0, 10),
          counterparty: p.counterparty_alias.display_name,
        }))
    } else {
      const { userId, accountId } = await getBunqSession()

      // Paginate through up to 200 recent payments (same approach as searchRecentPayments)
      const PAGE_SIZE = 50
      const allPayments: any[] = []
      let olderId: number | null = null

      for (let page = 0; page < 4; page++) {
        let path = `/user/${userId}/monetary-account/${accountId}/payment?count=${PAGE_SIZE}`
        if (olderId !== null) path += `&older_id=${olderId}`
        const json = await bunqGetPublic(path)
        const page_payments: any[] = json.Response?.map((r: any) => r.Payment).filter(Boolean) ?? []
        if (page_payments.length === 0) break
        allPayments.push(...page_payments)
        olderId = page_payments[page_payments.length - 1].id
        if (page_payments.length < PAGE_SIZE) break
      }

      matches = allPayments
        .filter(p => {
          const v = parseFloat(p.amount?.value ?? '0')
          // Only outgoing payments (negative amount) — this excludes incoming Sugar Daddy funding
          const isOutgoing = v < 0
          const withinRange = Math.abs(Math.abs(v) - target) <= tolerance
          return isOutgoing && withinRange
        })
        .map(p => ({
          id: p.id,
          amount: Math.abs(parseFloat(p.amount.value)),
          description: p.description,
          date: p.created.slice(0, 10),
          counterparty: p.counterparty_alias?.display_name ?? 'Unknown',
        }))
    }

    // Sort by most recent first
    matches.sort((a, b) => b.date.localeCompare(a.date))

    return NextResponse.json({ success: true, data: matches })
  } catch (err) {
    console.error('[match-payment]', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
