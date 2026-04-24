import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse, SplitResult } from '@/types'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'

const execAsync = promisify(exec)

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<SplitResult[]>>> {
  let tmpTxtPath = ""
  let tmpJsonPath = ""
  try {
    const { receipt, participants, voiceInput } = await req.json()

    // 1. Construct the natural language text for divider_agent
    const textLines = []
    if (receipt && receipt.items) {
      textLines.push("Receipt details:")
      receipt.items.forEach((i: any) => {
         textLines.push(`- ${i.quantity}x ${i.name} at ${i.price} each`)
      })
      textLines.push(`Total: ${receipt.currency} ${receipt.total}`)
      textLines.push("")
    }
    
    // Add "Me" to participants to mimic what Claude parses inside divider_agent
    const allParticipants = participants ? [...participants] : []
    if (!allParticipants.includes("Me") && !allParticipants.includes("me")) {
       allParticipants.push("Me")
    }

    textLines.push(`Participants: ${allParticipants.join(', ')}.`)
    textLines.push(`Instruction: Assume 'Me' paid the entire bill unless stated otherwise. ${voiceInput || "Split everything equally among participants."}`)

    const textPayload = textLines.join("\n")

    // 2. Write to temp file
    const uniqueId = Date.now().toString()
    tmpTxtPath = path.join(os.tmpdir(), `split_input_${uniqueId}.txt`)
    tmpJsonPath = path.join(os.tmpdir(), `split_output_${uniqueId}.json`)

    await fs.writeFile(tmpTxtPath, textPayload, 'utf-8')

    // 3. Exec divider_agent python script
    const scriptDir = path.join(process.cwd(), "BUNQ_DIEGO", "divider_agent")

    const cmd = `python main.py --file "${tmpTxtPath}" -o "${tmpJsonPath}"`
    const { stdout } = await execAsync(cmd, { cwd: scriptDir })

    // 4. Parse result
    let parsed: any = { settlements: [] }
    try {
      const resultRaw = await fs.readFile(tmpJsonPath, "utf-8")
      parsed = JSON.parse(resultRaw)
    } catch {
      if (stdout.includes("settled up") || stdout.includes("No debts")) {
          // It's perfectly balanced, python intentionally didn't write the file.
          return NextResponse.json({ success: true, data: [] })
      }
      throw new Error(`Python processing failed: ${stdout}`)
    }

    // parsed.settlements: [{ from: string, to: string, amount: number }]
    // we map to SplitResult[] - assuming from owes the 'Me' participant
    const result: SplitResult[] = (parsed.settlements || []).map((s: any) => ({
      participant: { name: s.from },
      amount: s.amount,
      items: []
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error("Split Parse Error:", err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  } finally {
    try { if (tmpTxtPath) await fs.unlink(tmpTxtPath).catch(() => {}) } catch(e){}
    try { if (tmpJsonPath) await fs.unlink(tmpJsonPath).catch(() => {}) } catch(e){}
  }
}
