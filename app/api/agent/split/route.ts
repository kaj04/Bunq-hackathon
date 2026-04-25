import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

type ChatMessage = { role: 'user' | 'agent'; text: string }
type Tx = { id?: number; amount: number; description: string; type: string; counterparty: string; date: string; isSugarDaddy?: boolean }

const client = new Anthropic()

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'present_for_selection',
    description:
      'Show the user a list of matching transactions to choose from. ' +
      'ALWAYS use this when multiple transactions match — never pick for the user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'Friendly message, e.g. "I found these payments from yesterday evening. Which would you like to split?"',
        },
        transaction_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs of transactions to show',
        },
      },
      required: ['message', 'transaction_ids'],
    },
  },
  {
    name: 'compute_split',
    description:
      'Calculate an equal split for confirmed transactions among specified group members. ' +
      'Only call this once you know exactly which transactions and people are involved.',
    input_schema: {
      type: 'object' as const,
      properties: {
        transaction_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'IDs of the transactions to split',
        },
        split_among: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of group members to split among (must be from the group list)',
        },
        description: {
          type: 'string',
          description: 'Short label for this split, e.g. "Dinner at La Trattoria"',
        },
      },
      required: ['transaction_ids', 'split_among', 'description'],
    },
  },
  {
    name: 'reply',
    description:
      'Send a message back to the user — for clarification, errors, or when nothing matches.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
  },
]

export async function POST(req: NextRequest) {
  try {
    const {
      message,
      history = [],
      groupMembers,
      currentUser,
      transactions = [],
      selectedIds = [],
    } = await req.json()

    const memberNames: string[] = (groupMembers as any[]).map((m) =>
      typeof m === 'string' ? m : m.name
    )

    // Only outgoing, non-sugar-daddy transactions — assign stable index-based ID if missing
    const outgoing: (Tx & { id: number })[] = (transactions as Tx[])
      .filter(
        (tx) =>
          tx.type === 'outcome' &&
          !tx.isSugarDaddy &&
          !tx.counterparty?.toLowerCase().includes('sugar daddy')
      )
      .map((tx, i) => ({ ...tx, id: tx.id ?? i }))

    const txList = outgoing
      .map(
        (tx) =>
          `ID:${tx.id} | ${tx.date?.slice(0, 16)} | ${tx.description} | €${Number(tx.amount).toFixed(2)} → ${tx.counterparty}`
      )
      .join('\n')

    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const yday = new Date(now)
    yday.setDate(yday.getDate() - 1)
    const yesterday = yday.toISOString().slice(0, 10)

    const system = `You are a bill-splitting assistant for a group expense app.
Today: ${today}. Current time: ${now.toTimeString().slice(0, 5)}.
Logged-in user (the one who paid): ${currentUser ?? 'unknown'}.
Group members (ONLY these names are valid recipients): ${memberNames.join(', ')}

Time-of-day definitions: morning 06:00–12:00, afternoon 12:00–17:00, evening 17:00–23:00, night 23:00–06:00.
"yesterday" = ${yesterday}, "today" = ${today}.

Recent outgoing Bunq payments (these are the only splittable transactions):
${txList || '(no outgoing transactions found)'}

RULES — you MUST always call one of the three tools (present_for_selection, compute_split, or reply). Never respond with plain text.

1. UNKNOWN PERSON: If the user mentions any name that is NOT in the group members list above, immediately call reply. In the message, name the unknown person, list the actual group members, and ask who they meant.

2. NO MATCH: If no transactions match the requested time/description, call reply. Explain there are no matching outgoing payments and list the available dates or descriptions from the transaction list.

3. MULTIPLE MATCHES: If multiple transactions could match the user's request, call present_for_selection with all matching IDs. Never pick one yourself.

4. SINGLE MATCH: Even for a single unambiguous transaction, call present_for_selection to confirm before splitting.

5. USER CONFIRMED SELECTION: If the message contains "[User selected IDs: ...]", call compute_split immediately with exactly those IDs.

6. SPLIT AMONG: Only include names from the group members list in split_among. Always exclude ${currentUser ?? 'the logged-in user'} (they already paid).

7. COMPUTE SPLIT: Only call compute_split after you know exactly which transactions and which group members are involved.

8. Be concise and friendly in all reply messages.`

    // Build Claude messages from simplified history
    const claudeMessages: Anthropic.Messages.MessageParam[] = (history as ChatMessage[]).map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: h.text,
    }))

    const userContent =
      selectedIds.length > 0
        ? `${message}\n[User selected IDs: ${(selectedIds as number[]).join(', ')}]`
        : message

    claudeMessages.push({ role: 'user', content: userContent })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      tools: TOOLS,
      tool_choice: { type: 'any' as const },
      messages: claudeMessages,
    })

    const toolBlock = response.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
    )

    if (toolBlock) {
      const inp = toolBlock.input as any

      if (toolBlock.name === 'present_for_selection') {
        const ids: number[] = inp.transaction_ids
        const matched = outgoing.filter((tx) => ids.includes(tx.id))
        return NextResponse.json({ type: 'select', message: inp.message, transactions: matched })
      }

      if (toolBlock.name === 'reply') {
        return NextResponse.json({ type: 'message', message: inp.message })
      }

      if (toolBlock.name === 'compute_split') {
        const splitAmong: string[] = inp.split_among
        const invalid = splitAmong.filter((n) => !memberNames.includes(n))
        if (invalid.length > 0) {
          return NextResponse.json({
            type: 'message',
            message: `${invalid.join(', ')} ${invalid.length === 1 ? 'is' : 'are'} not in this group.`,
          })
        }

        const ids: number[] = inp.transaction_ids
        const selectedTxs = outgoing.filter((tx) => ids.includes(tx.id))
        if (selectedTxs.length === 0) {
          return NextResponse.json({ type: 'message', message: 'I couldn\'t find those transactions. Please try again.' })
        }

        const total = selectedTxs.reduce((s, tx) => s + Number(tx.amount), 0)
        const perPerson = total / splitAmong.length

        return NextResponse.json({
          type: 'split',
          splits: splitAmong.map((name) => ({ name, amount: perPerson.toFixed(2) })),
          total,
          description: inp.description,
          transactions: selectedTxs,
        })
      }
    }

    // Fallback to plain text
    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
    )
    return NextResponse.json({
      type: 'message',
      message: textBlock?.text ?? 'Could you clarify what you\'d like to split?',
    })
  } catch (err) {
    console.error('[/api/agent/split]', err)
    return NextResponse.json(
      { type: 'message', message: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
