import Anthropic from '@anthropic-ai/sdk'
import { TOOL_DEFINITIONS, executeTool } from './tools'
import type { AgentResponse, SplitProposal } from '@/types'

function buildSystem(): string {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.setDate(now.getDate() - 1)).toISOString().slice(0, 10)

  return `You are a smart payment-splitting assistant for Bunq. Communicate with the user in Italian.

DATE CONTEXT:
- Today is ${today}.
- "ieri" = ${yesterday}. "2 giorni fa" = ${new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)}, etc.
- When the user says a relative date ("ieri", "l'altro ieri", "settimana scorsa"), compute the exact calendar date
  and use an appropriate 'days' value for search_recent_payments:
  "oggi" → days=1, "ieri" → days=2, "2/3 giorni fa" → days=4, "settimana scorsa" → days=10.
- If search returns multiple payments across different dates, only consider those matching the intended date.

WORKFLOW — follow this order strictly:
1. Call search_recent_payments using relevant keywords AND the correct 'days' window.
   - If found=false: retry once with double the days, then tell the user nothing was found.
   - If multiple results on DIFFERENT dates: filter to the intended date before proceeding.
   - If multiple results on the SAME date (hasAmbiguousDate=true): list them and ask which one.
   - If only one result: proceed automatically without asking.
2. Call match_contact for each person mentioned.
   - confidence > 0.85 → proceed automatically.
   - confidence ≤ 0.85 OR forceDisambiguate=true → list candidates with alias, ask the user.
   - not_found=true → ask the user for their Bunq email or phone.
3. Call compute_split.
   - Use exclude_payer when user says "ho pagato io" / "l'ho pagato io" / "ho già pagato".
   - If compute_split returns an error, fix inputs and retry.
4. When payment, contacts, and split are all resolved: output ONLY the JSON below.

OUTPUT FORMAT (only when everything is confirmed — no extra text, no markdown):
{
  "paymentDescription": "<merchant + date, e.g. Bar Centrale 23/04>",
  "total": <number>,
  "currency": "EUR",
  "splits": [
    { "name": "<contact name>", "alias": "<bunq alias>", "amount": <number> }
  ]
}

RULES:
- Never invent amounts or aliases.
- Never ask for confirmation on things you already know with high confidence.
- The splits cover only debtors (exclude the payer when applicable).`
}

export async function runAgent(
  transcript: string,
  prevHistory?: any[],
): Promise<AgentResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const messages: Anthropic.MessageParam[] = prevHistory
    ? [...prevHistory, { role: 'user', content: transcript }]
    : [{ role: 'user', content: transcript }]

  while (true) {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystem(),
      tools: TOOL_DEFINITIONS,
      messages,
    })

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const result = await executeTool(block.name, block.input as Record<string, any>)
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    const textBlock = response.content.find(
      (b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text',
    )
    const text = textBlock?.text.trim() ?? ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.splits && parsed.total !== undefined) {
          const proposal: SplitProposal = {
            paymentDescription: parsed.paymentDescription ?? '',
            total: parsed.total,
            currency: parsed.currency ?? 'EUR',
            splits: parsed.splits.map((s: any) => ({
              participant: { name: s.name, bunqAlias: s.alias },
              amount: s.amount,
            })),
          }
          return { state: 'proposal', proposal }
        }
      } catch {
        // fall through
      }
    }

    return { state: 'needs_input', question: text, history: messages }
  }
}
