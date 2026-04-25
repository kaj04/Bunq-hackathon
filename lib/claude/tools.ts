import Anthropic from '@anthropic-ai/sdk'
import { searchRecentPayments } from '@/lib/bunq/payments'
import { getBunqContacts } from '@/lib/bunq/client'

// ── Tool definitions (JSON Schema for Claude) ────────────────────────────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_recent_payments',
    description:
      'Search the user\'s recent Bunq payments by keyword. Use pipe-separated synonyms for better recall (e.g. "birre|bar|pub"). Recurring subscriptions (Netflix, Spotify, etc.) are automatically excluded. Returns matching payments from the last N days.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Pipe-separated keywords to match against payment descriptions',
        },
        days: {
          type: 'number',
          description: 'How many days back to search. Start with 2-3 for "ieri/oggi", use 7 for "settimana scorsa", 30 for longer periods.',
        },
      },
      required: ['query', 'days'],
    },
  },
  {
    name: 'match_contact',
    description:
      'Find a Bunq contact by name. Returns all candidates with a confidence score and their Bunq alias. Confidence > 0.85 = safe to proceed automatically. Lower = ask user to choose. Empty candidates = contact not in Bunq, ask user for their email or phone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name_hint: {
          type: 'string',
          description: 'The name (or partial name) to look up',
        },
      },
      required: ['name_hint'],
    },
  },
  {
    name: 'compute_split',
    description:
      'Calculate how much each person owes. Returns validated splits that sum exactly to the total. Use exclude_payer when the user says they already paid ("ho pagato io", "l\'ho pagato io").',
    input_schema: {
      type: 'object' as const,
      properties: {
        total: { type: 'number', description: 'Total amount in EUR' },
        participants: {
          type: 'array',
          items: { type: 'string' },
          description: 'All people involved, including the payer',
        },
        exclude_payer: {
          type: 'string',
          description: 'Name of the person who already paid — excluded from the output (they owe nothing)',
        },
        assignments: {
          type: 'object',
          description: 'Optional: map of name → amount for non-equal splits. Must sum to total.',
          additionalProperties: { type: 'number' },
        },
      },
      required: ['total', 'participants'],
    },
  },
]

// ── Tool implementations ──────────────────────────────────────────────────────

type ToolInput = Record<string, any>

export async function executeTool(name: string, input: ToolInput): Promise<string> {
  switch (name) {
    case 'search_recent_payments': {
      const payments = await searchRecentPayments(input.query, input.days ?? 7)
      if (payments.length === 0) {
        return JSON.stringify({
          found: false,
          payments: [],
          suggestion: `No payments found in the last ${input.days} days. Try widening the search with more days or different keywords.`,
        })
      }
      // Flag if multiple payments share the same date — signal to Claude that disambiguation may be needed
      const byDate = payments.reduce<Record<string, typeof payments>>((acc, p) => {
        const day = p.created.slice(0, 10)
        ;(acc[day] ??= []).push(p)
        return acc
      }, {})
      const hasAmbiguousDate = Object.values(byDate).some(ps => ps.length > 1)
      return JSON.stringify({ found: true, payments, hasAmbiguousDate })
    }

    case 'match_contact': {
      const contacts = await getBunqContacts()
      const hint = (input.name_hint as string).toLowerCase().trim()

      const scored = contacts
        .map(c => {
          const nameLower = c.name.toLowerCase()
          let confidence = 0
          if (nameLower === hint) confidence = 1.0
          else if (nameLower.startsWith(hint) || hint.startsWith(nameLower)) confidence = 0.9
          else if (nameLower.includes(hint) || hint.includes(nameLower)) confidence = 0.75
          return { ...c, confidence }
        })
        .filter(c => c.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence)

      if (scored.length === 0) {
        return JSON.stringify({
          candidates: [],
          not_found: true,
          hint: `No contact named "${input.name_hint}" found. Ask the user for their Bunq email or phone number.`,
        })
      }

      // If top two have identical confidence, they're equally ambiguous — force disambiguation
      const top = scored[0]
      const second = scored[1]
      const forceDisambiguate = second && top.confidence === second.confidence

      return JSON.stringify({ candidates: scored, forceDisambiguate })
    }

    case 'compute_split': {
      const { total, participants, exclude_payer, assignments } = input as {
        total: number
        participants: string[]
        exclude_payer?: string
        assignments?: Record<string, number>
      }

      const debtors = exclude_payer
        ? participants.filter(p => p !== exclude_payer)
        : participants

      if (debtors.length === 0) {
        return JSON.stringify({ error: 'No debtors after excluding payer.' })
      }

      let splits: { name: string; amount: number }[]

      if (assignments && Object.keys(assignments).length > 0) {
        // Validate that provided assignments sum correctly
        const assignedSum = Object.values(assignments).reduce((a, b) => a + b, 0)
        const rounded = Math.round(assignedSum * 100) / 100
        const totalRounded = Math.round(total * 100) / 100
        if (Math.abs(rounded - totalRounded) > 0.02) {
          return JSON.stringify({
            error: `Assignments sum to ${rounded} but total is ${totalRounded}. Fix the assignments before proceeding.`,
          })
        }
        splits = debtors.map(p => ({ name: p, amount: assignments[p] ?? 0 }))
      } else {
        // Equal split with rounding absorbed by last person
        const each = Math.floor((total / debtors.length) * 100) / 100
        const remainder = Math.round((total - each * debtors.length) * 100) / 100
        splits = debtors.map((p, i) => ({
          name: p,
          amount: i === debtors.length - 1 ? Math.round((each + remainder) * 100) / 100 : each,
        }))
      }

      // Final sanity check — should never fail but catches floating point edge cases
      const sumCheck = Math.round(splits.reduce((a, s) => a + s.amount, 0) * 100) / 100
      const totalRounded = Math.round(total * 100) / 100
      if (Math.abs(sumCheck - totalRounded) > 0.02) {
        return JSON.stringify({
          error: `Split sum (${sumCheck}) doesn't match total (${totalRounded}). Recalculate.`,
        })
      }

      return JSON.stringify({ splits, total, excluded: exclude_payer ?? null })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}
