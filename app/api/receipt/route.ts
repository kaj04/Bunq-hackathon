// OWNER: Vaggelis
// POST /api/receipt — riceve immagine scontrino, restituisce JSON strutturato

import { NextRequest, NextResponse } from "next/server"
import { scanReceipt } from "@/lib/claude/vision"
import type { ApiResponse, Receipt } from "@/types"

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Receipt>>> {
  try {
    const { imageBase64, mediaType } = await req.json()
    const receipt = await scanReceipt(imageBase64, mediaType)
    return NextResponse.json({ success: true, data: receipt })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
