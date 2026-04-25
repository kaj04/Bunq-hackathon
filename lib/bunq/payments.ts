import { getBunqSession, bunqGetPublic } from './client'
import { MOCK_PAYMENTS } from './mock-data'
import { isMock } from '@/lib/mock-flag'
import type { BunqPayment } from '@/types'

const PAGE_SIZE = 50

// Payments matching these patterns are personal subscriptions, not group expenses
const RECURRING_KEYWORDS = [
  'netflix', 'spotify', 'prime', 'disney', 'hbo', 'apple music', 'youtube premium',
  'abbonamento', 'affitto', 'mutuo', 'assicurazione', 'rata', 'canone',
  'palestra', 'gym', 'icloud', 'google one',
]

function isRecurring(payment: any): boolean {
  if (payment.type === 'DIRECT_DEBIT') return true
  const desc = (payment.description ?? '').toLowerCase()
  return RECURRING_KEYWORDS.some(k => desc.includes(k))
}

export async function searchRecentPayments(query: string, days: number): Promise<BunqPayment[]> {
  if (isMock()) {
    return filterMockPayments(MOCK_PAYMENTS, query, days)
  }
  const { userId, accountId } = await getBunqSession()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const allPayments: BunqPayment[] = []
  let olderId: number | null = null

  outer: while (true) {
    let path = `/user/${userId}/monetary-account/${accountId}/payment?count=${PAGE_SIZE}`
    if (olderId !== null) path += `&older_id=${olderId}`

    const json = await bunqGetPublic(path)
    const page: any[] = json.Response?.map((r: any) => r.Payment).filter(Boolean) ?? []

    if (page.length === 0) break

    for (const p of page) {
      if (new Date(p.created) < cutoff) break outer
      if (isRecurring(p)) continue  // skip subscriptions/recurring before any other check
      allPayments.push({
        id: p.id,
        description: p.description,
        amount: p.amount,
        created: p.created,
        counterparty_alias: p.counterparty_alias,
      })
    }

    olderId = page[page.length - 1].id
    if (page.length < PAGE_SIZE) break
  }

  const terms = query.toLowerCase().split(/[|\s,]+/).filter(Boolean)
  return allPayments.filter(p =>
    terms.some(t => p.description.toLowerCase().includes(t)),
  )
}

function filterMockPayments(payments: any[], query: string, days: number): BunqPayment[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  cutoff.setHours(0, 0, 0, 0) // snap to start-of-day so whole days are included
  const terms = query.toLowerCase().split(/[|\s,]+/).filter(Boolean)
  return payments
    .filter(p => !isRecurring(p))
    .filter(p => new Date(p.created) >= cutoff)
    .filter(p => terms.some(t => p.description.toLowerCase().includes(t)))
}
