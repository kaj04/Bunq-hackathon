import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import type { ApiResponse, Receipt } from "@/types"

const client = new Anthropic({ apiKey: process.env.APP_CLAUDE_KEY ?? process.env.ANTHROPIC_API_KEY })

const PROMPT = `You are an expert OCR system for restaurant receipts.
Extract the receipt data and return ONLY valid JSON, no markdown, no extra text.

JSON schema:
{
  "currency": "3-letter code (EUR/USD/GBP/CHF etc)",
  "items": [
    { "name": "item name", "quantity": 1, "unit_price": 0.00 }
  ],
  "total": 0.00
}

RULES:
- Read EXACT prices from the receipt, do not round or approximate.
- Use EXACT currency shown on the receipt.
- total must match the printed total.
- Split bundled items (e.g. "2x Beer 9.00" → quantity: 2, unit_price: 4.50).
- Return ONLY valid JSON matching the schema above.`

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Receipt>>> {
  try {
    const { imageBase64, mediaType = "image/jpeg" } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ success: false, error: "imageBase64 is required" }, { status: 400 })
    }

    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    const safeType = validTypes.includes(mediaType) ? mediaType : "image/jpeg"

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: safeType as any, data: imageBase64 },
          },
          { type: "text", text: PROMPT },
        ],
      }],
    })

    let raw = (response.content[0] as any).text?.trim() ?? ""
    if (raw.startsWith("```json")) raw = raw.slice(7)
    else if (raw.startsWith("```")) raw = raw.slice(3)
    if (raw.endsWith("```")) raw = raw.slice(0, -3)
    raw = raw.trim()

    const parsed = JSON.parse(raw)

    const receipt: Receipt = {
      items: (parsed.items ?? []).map((item: any) => ({
        name: item.name,
        price: item.unit_price ?? item.price ?? 0,
        quantity: item.quantity ?? 1,
      })),
      total: parsed.total ?? 0,
      currency: parsed.currency ?? "EUR",
    }

    return NextResponse.json({ success: true, data: receipt })
  } catch (err) {
    console.error("[/api/receipt] error:", err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
