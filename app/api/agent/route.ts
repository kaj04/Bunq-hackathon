import { NextRequest, NextResponse } from 'next/server'
import { runAgent } from '@/lib/claude/agent'
import type { AgentResponse } from '@/types'

export async function POST(req: NextRequest): Promise<NextResponse<AgentResponse>> {
  try {
    const { transcript, history } = await req.json()
    const result = await runAgent(transcript, history)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ state: 'error', error: String(err) })
  }
}
