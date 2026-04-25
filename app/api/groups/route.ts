import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const STORE = path.join(process.cwd(), 'groups-store.json')

function read(): any[] {
  if (!fs.existsSync(STORE)) return []
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')) } catch { return [] }
}

function write(data: any[]) {
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2))
}

export async function GET() {
  return NextResponse.json({ success: true, data: read() })
}

export async function POST(req: NextRequest) {
  try {
    const group = await req.json()
    if (!group.id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })
    const groups = read()
    const idx = groups.findIndex((g: any) => g.id === group.id)
    if (idx >= 0) groups[idx] = group
    else groups.push(group)
    write(groups)
    return NextResponse.json({ success: true, data: group })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
