import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse, Receipt } from "@/types"
import { exec } from "child_process"
import { promisify } from "util"
import path from "path"
import os from "os"
import fs from "fs/promises"

const execAsync = promisify(exec)

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Receipt>>> {
  let tmpImgPath = ""
  let tmpJsonPath = ""
  
  try {
    const { imageBase64, mediaType } = await req.json()
    // 1. Decode base64 to temp file
    const uniqueId = Date.now().toString()
    tmpImgPath = path.join(os.tmpdir(), `receipt_${uniqueId}.jpg`)
    tmpJsonPath = path.join(os.tmpdir(), `result_${uniqueId}.json`)
    
    // remove data:image/jpeg;base64, if it's there
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "")
    await fs.writeFile(tmpImgPath, base64Data, 'base64')

    // 2. Run the python cv_preprocessing + extraction pipeline
    // We execute it in BUNQ_DIEGO/receipt_parser directory
    // using the newly created venv python
    const scriptDir = path.join(process.cwd(), "BUNQ_DIEGO", "receipt_parser")
    const pythonExe = path.join(process.cwd(), "BUNQ_DIEGO", ".venv", "Scripts", "python.exe")
    
    // Command calls python main.py <img_path> -o <json_path>
    const cmd = `"${pythonExe}" main.py "${tmpImgPath}" -o "${tmpJsonPath}"`
    
    await execAsync(cmd, { cwd: scriptDir })

    // 3. Read the output json
    const resultRaw = await fs.readFile(tmpJsonPath, "utf-8")
    const parsed = JSON.parse(resultRaw)

    // 4. Map to Next.js Receipt type
    const receipt: Receipt = {
      items: (parsed.items || []).map((item: any) => ({
        name: item.name,
        price: item.unit_price,
        quantity: item.quantity
      })),
      total: parsed.total || parsed.subtotal || 0,
      currency: parsed.currency || "EUR"
    }

    return NextResponse.json({ success: true, data: receipt })
  } catch (err) {
    console.error("Receipt Parse Error:", err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  } finally {
    // Cleanup temporary files
    try { if (tmpImgPath) await fs.unlink(tmpImgPath).catch(() => {}) } catch(e){}
    try { if (tmpJsonPath) await fs.unlink(tmpJsonPath).catch(() => {}) } catch(e){}
  }
}
