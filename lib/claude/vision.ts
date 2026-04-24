// OWNER: Vaggelis
// Claude Vision — legge gli scontrini dalle immagini

import Anthropic from "@anthropic-ai/sdk"
import { RECEIPT_VISION_PROMPT } from "./prompts"
import type { Receipt } from "@/types"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function scanReceipt(imageBase64: string, mediaType: string): Promise<Receipt> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data: imageBase64 },
          },
          { type: "text", text: RECEIPT_VISION_PROMPT },
        ],
      },
    ],
  })

  const text = response.content[0].type === "text" ? response.content[0].text : ""
  return JSON.parse(text) as Receipt
}
