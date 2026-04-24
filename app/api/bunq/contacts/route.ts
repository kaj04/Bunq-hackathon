// OWNER: Francesco
// GET /api/bunq/contacts — restituisce lista contatti Bunq dell'utente

import { NextResponse } from "next/server"
import { getBunqContacts } from "@/lib/bunq/client"
import type { ApiResponse, BunqContact } from "@/types"

export async function GET(): Promise<NextResponse<ApiResponse<BunqContact[]>>> {
  try {
    const contacts = await getBunqContacts()
    return NextResponse.json({ success: true, data: contacts })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
