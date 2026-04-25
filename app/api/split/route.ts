// OWNER: Vaggelis + Francesco
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { ApiResponse, SplitResult } from '@/types'
import { SPLIT_PROMPT_WITH_RECEIPT, SPLIT_PROMPT_VOICE_ONLY } from '@/lib/claude/prompts'

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<SplitResult[]>>> {
  try {
    const client = new Anthropic({ apiKey: process.env.APP_CLAUDE_KEY })
    const { receipt, participants, voiceInput, recentTransactions } = await req.json()

    const txContext = recentTransactions?.length
      ? recentTransactions.map((t: any) => `[${t.date?.slice(0, 10) ?? ''}] ${t.description} €${Math.abs(parseFloat(t.amount)).toFixed(2)} (${t.type === 'out' ? 'paid' : 'received'} — ${t.counterparty})`).join('\n')
      : undefined

    const prompt = receipt
      ? SPLIT_PROMPT_WITH_RECEIPT(JSON.stringify(receipt), participants, voiceInput ?? '')
      : SPLIT_PROMPT_VOICE_ONLY(participants, voiceInput ?? '', txContext)

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}')
    const splits = parsed.splits ?? []
    const description = parsed.description ?? voiceInput ?? 'Expense'

    const result: SplitResult[] = splits.map((s: any) => ({
      participant: { name: s.name },
      amount: parseFloat(s.amount),
      items: s.items ?? [],
    }))

    return NextResponse.json({ success: true, data: result, description })
  } catch (err) {
    console.error('Split Parse Error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
