// OWNER: Diego
// POST /api/split — riceve scontrino + partecipanti + input vocale, restituisce split

import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { SPLIT_PROMPT } from "@/lib/claude/prompts"
import type { ApiResponse, SplitResult } from "@/types"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<SplitResult[]>>> {
  try {
    const { receipt, participants, voiceInput } = await req.json()

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: SPLIT_PROMPT(JSON.stringify(receipt), participants, voiceInput ?? ""),
        },
      ],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : "{}"
    const { splits } = JSON.parse(text)
    return NextResponse.json({ success: true, data: splits })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
