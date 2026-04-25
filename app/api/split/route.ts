// OWNER: Vaggelis + Francesco
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import Fuse from 'fuse.js'
import type { ApiResponse, SplitResult } from '@/types'
import { SPLIT_PROMPT_RECEIPTS, splitAgentSystemPrompt, type HistoryEntry } from '@/lib/claude/prompts'
import { searchRecentPayments } from '@/lib/bunq/payments'

type Member = { name: string; alias: string }

function fuzzyMatchContact(nameHint: string, members: Member[]) {
  const fuse = new Fuse(members, {
    keys: ['name'],
    includeScore: true,
    threshold: 0.5,    // 0 = exact only, 1 = match anything
    ignoreLocation: true,
    minMatchCharLength: 2,
  })
  return fuse
    .search(nameHint)
    .slice(0, 3)
    .map(r => ({
      name: r.item.name,
      alias: r.item.alias,
      confidence: parseFloat((1 - (r.score ?? 0)).toFixed(2)),
    }))
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_payments',
    description:
      'Search recent Bunq payments by keyword and time range. Call this whenever the user refers to a past expense by name or date, to find the exact amount before splitting.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'Keywords matching the payment description (e.g. "pizza mario", "uber taxi", "birre bar"). Use short, distinctive terms. Separate alternatives with | (e.g. "birre|bar|pub").',
        },
        days: {
          type: 'number',
          description:
            'How many days back to search. 1 = yesterday, 2 = two days ago, 7 = last week. Round up if unsure.',
        },
      },
      required: ['query', 'days'],
    },
  },
  {
    name: 'match_contact',
    description:
      'Fuzzy-match a name as spoken by the user against the list of authorized group members. Always call this for every person named by the user — even seemingly obvious names — to get their canonical name and Bunq alias. Returns up to 3 ranked matches with confidence scores (0–1).',
    input_schema: {
      type: 'object' as const,
      properties: {
        name_hint: {
          type: 'string',
          description:
            'Name as spoken or typed by the user. May be a nickname, partial name, or approximate spelling (e.g. "Fran", "Giorg", "Vagge").',
        },
      },
      required: ['name_hint'],
    },
  },
]

async function runToolUseLoop(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  system: string,
  members: Member[],
): Promise<string> {
  for (let turn = 0; turn < 8; turn++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    })

    if (response.stop_reason === 'end_turn') {
      return response.content.find(b => b.type === 'text')?.text ?? ''
    }

    if (response.stop_reason !== 'tool_use') break

    messages.push({ role: 'assistant', content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      if (block.name === 'search_payments') {
        const { query, days } = block.input as { query: string; days: number }
        // Support pipe-separated alternatives: "birre|bar|pub"
        const terms = query.split('|').map(t => t.trim()).filter(Boolean)
        let payments: Awaited<ReturnType<typeof searchRecentPayments>> = []
        for (const term of terms) {
          const found = await searchRecentPayments(term, Math.ceil(days))
          payments.push(...found)
        }
        // Deduplicate by id
        const seen = new Set<number>()
        payments = payments.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true })

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content:
            payments.length > 0
              ? JSON.stringify(
                  payments.map(p => ({
                    id: p.id,
                    date: p.created.slice(0, 10),
                    time: p.created.slice(11, 16),
                    description: p.description,
                    amount: p.amount.value,
                    currency: p.amount.currency,
                    counterparty: p.counterparty_alias.display_name,
                    balance_after: p.balance_after_mutation?.value,
                  })),
                )
              : JSON.stringify({ message: 'No payments found for that query and time range.' }),
        })
      }

      if (block.name === 'match_contact') {
        const { name_hint } = block.input as { name_hint: string }
        const matches = fuzzyMatchContact(name_hint, members)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content:
            matches.length > 0
              ? JSON.stringify({ matches })
              : JSON.stringify({ message: `No group member found matching "${name_hint}". Available members: ${members.map(m => m.name).join(', ')}.` }),
        })
      }
    }

    messages.push({ role: 'user', content: toolResults })
  }

  return ''
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<SplitResult[]>>> {
  try {
    const client = new Anthropic({ apiKey: process.env.APP_CLAUDE_KEY })
    const { receipt, receiptName, receipts: multiReceipts, members: rawMembers, participants: rawParticipants, voiceInput, speaker, history } = await req.json()
    const typedHistory: HistoryEntry[] = Array.isArray(history) ? history : []

    // Accept both `members` (new, with aliases) and `participants` (legacy, names only)
    const members: Member[] = rawMembers?.length
      ? rawMembers
      : (rawParticipants ?? []).map((p: any) => ({
          name: typeof p === 'string' ? p : p.name,
          alias: '',
        }))

    // ── Receipt path: direct call (no tools needed — amounts & members are known) ──
    const allReceipts: { name: string; items: any[]; total: number }[] = []
    if (receipt) allReceipts.push({ name: receiptName ?? 'Receipt', items: receipt.items ?? [], total: receipt.total ?? 0 })
    if (Array.isArray(multiReceipts)) multiReceipts.forEach(r => allReceipts.push(r))

    let finalText: string

    if (allReceipts.length > 0) {
      const prompt = SPLIT_PROMPT_RECEIPTS(allReceipts, members, voiceInput ?? '', speaker)
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      })
      finalText = response.content.find(b => b.type === 'text')?.text ?? ''
    } else {
      // ── Voice-only path: agentic loop with search_payments + match_contact ──
      const userMessage = [
        `Authorized group members (ONLY these people can be included in a split):`,
        members.map(m => `  - ${m.name} (alias: ${m.alias || 'unknown'})`).join('\n'),
        speaker ? `Current user (resolve "I"/"me" to this name): ${speaker}` : '',
        `User said: "${voiceInput}"`,
      ]
        .filter(Boolean)
        .join('\n')

      finalText = await runToolUseLoop(
        client,
        [{ role: 'user', content: userMessage }],
        splitAgentSystemPrompt(typedHistory),
        members,
      )
    }

    const jsonMatch = finalText.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}')
    const widgets = Array.isArray(parsed.suggestions) ? parsed.suggestions : []

    // ── Question from agent (needs clarification) ─────────────────────────────
    if (parsed.question) {
      return NextResponse.json({ success: false, error: parsed.question, isQuestion: true, widgets })
    }

    // ── Hard error ────────────────────────────────────────────────────────────
    if (parsed.error) {
      return NextResponse.json({ success: false, error: parsed.error, widgets })
    }

    const splits = parsed.splits ?? []
    const description: string = parsed.description ?? voiceInput ?? 'Expense'

    if (splits.length === 0) {
      return NextResponse.json({
        success: false,
        error: parsed.message ?? "I couldn't determine who to split with. Please name group members or provide an amount.",
        widgets,
      })
    }

    const result: SplitResult[] = splits
      .map((s: any) => {
        const name = typeof s.participant === 'string' ? s.participant : (s.participant?.name ?? s.name ?? '')
        // Resolve alias: prefer what Claude returned (from match_contact), fallback to members list
        const resolvedAlias =
          s.alias ||
          members.find(m => m.name.toLowerCase() === name.toLowerCase())?.alias ||
          ''
        return {
          participant: { name },
          alias: resolvedAlias,
          amount: parseFloat(s.amount) || 0,
          items: s.items ?? [],
        }
      })
      .filter((s: any) => s.participant.name)

    const agentSummary = `Split €${parsed.total?.toFixed(2) ?? '?'} for "${description}" → ${result.map(r => `${r.participant.name}: €${r.amount.toFixed(2)}`).join(', ')}`
    return NextResponse.json({ success: true, data: result, description, agentSummary, widgets })
  } catch (err) {
    console.error('Split Agent Error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
