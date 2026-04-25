// OWNER: Diego

export const RECEIPT_VISION_PROMPT = `
Analyze this receipt image. Return ONLY valid JSON, no extra text:
{
  "items": [{ "name": "string", "price": number, "quantity": number }],
  "total": number,
  "currency": "EUR"
}
If a value is unclear, use the most likely estimate.
`

export const SPLIT_PROMPT_WITH_RECEIPT = (
  receipt: string,
  participants: string[],
  voiceInput: string,
  speaker?: string
) => `
You are a bill-splitting assistant. Split the receipt based on who ordered what.

Receipt JSON:
${receipt}

People at the table: ${participants.join(', ')}
${speaker ? `\nThe person describing the orders is: ${speaker}. When they say "I", "me", or "my", they mean "${speaker}".` : ''}

${voiceInput
  ? `Voice description: "${voiceInput}"

Rules for assigning items:
1. Map each mentioned person to items they ordered.
2. "I"/"me"/"my" always refers to ${speaker ?? 'the speaker'}.
3. QUANTITY MATH: When a receipt item has quantity > 1 (e.g. "Americano ×5: €10.00"), the unit price is total ÷ quantity = €2.00 each. If someone says they had 2, assign 2 × €2.00 = €4.00 to them, and distribute the remaining units to whoever else ordered them (or split equally among unnamed people if not specified).
4. Phrases like "X got the rest" mean X ordered all remaining units of that item not claimed by others.
5. If an item is shared, divide its cost equally among those sharing it.
6. Only include people who actually ordered something — omit people with €0.`
  : 'No description — split the total equally among all participants.'}

The sum of all amounts MUST equal the receipt total exactly. Adjust the largest share by any rounding difference if needed.

Return ONLY valid JSON, no explanation:
{
  "splits": [
    { "participant": "name", "amount": number, "items": ["item: €price"] }
  ]
}
`

export const SPLIT_PROMPT_VOICE_ONLY = (
  participants: string[],
  voiceInput: string,
  recentTransactions?: string
) => `
You are a bill-splitting assistant. The user may speak Italian or English.
Today's date: ${new Date().toISOString().split('T')[0]}

${recentTransactions ? `Recent transactions (last 20):\n${recentTransactions}\n` : ''}
Participants in this group: ${participants.join(', ')}

User said: "${voiceInput}"

Instructions:
- If the user refers to "ieri" (yesterday), "le spese di ieri" (yesterday's expenses), "stamattina" (this morning), etc., find matching transactions in the recent transactions list by date and description.
- If the user mentions a specific amount, use that amount.
- Split among the participants mentioned, or all group members if none specified.
- The amounts must sum to the total. Round to 2 decimal places.

Return ONLY valid JSON:
{
  "total": number,
  "description": "brief description of what was split",
  "splits": [
    { "participant": "name", "amount": number }
  ]
}
`
