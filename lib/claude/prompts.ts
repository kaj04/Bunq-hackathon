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
  voiceInput: string
) => `
Receipt JSON:
${receipt}

Participants: ${participants.join(', ')}

User instruction: "${voiceInput || 'split equally'}"

Follow the user instruction to split the bill. If no specific instruction, split equally.
Return ONLY valid JSON:
{
  "splits": [
    { "participant": "name", "amount": number, "items": ["item name"] }
  ]
}
Amounts must sum to the receipt total. Round to 2 decimal places.
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
