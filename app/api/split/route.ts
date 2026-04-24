// OWNER: Diego
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SPLIT_PROMPT_WITH_RECEIPT, SPLIT_PROMPT_VOICE_ONLY } from '@/lib/claude/prompts'
import type { ApiResponse, SplitResult } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<SplitResult[]>>> {
  try {
    const { receipt, participants, voiceInput } = await req.json()

    const prompt = receipt
      ? SPLIT_PROMPT_WITH_RECEIPT(JSON.stringify(receipt), participants, voiceInput ?? '')
      : SPLIT_PROMPT_VOICE_ONLY(participants, voiceInput ?? '')

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const { splits } = JSON.parse(jsonMatch?.[0] ?? '{}')

    const result: SplitResult[] = splits.map((s: any) => ({
      participant: { name: s.participant },
      amount: s.amount,
      items: s.items ?? [],
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
