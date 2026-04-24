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
  voiceInput: string
) => `
The user wants to split a bill. Participants: ${participants.join(', ')}.

User said: "${voiceInput}"

Extract the total amount and split instructions from what the user said.
Return ONLY valid JSON:
{
  "splits": [
    { "participant": "name", "amount": number, "items": [] }
  ]
}
If amounts are unclear, split any mentioned total equally among all participants.
`
