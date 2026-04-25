import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const STORE = path.join(process.cwd(), 'groups-store.json')

function read(): any[] {
  if (!fs.existsSync(STORE)) return []
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')) } catch { return [] }
}

function write(data: any[]) {
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2))
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const patch = await req.json()
    const groups = read()
    const idx = groups.findIndex((g: any) => g.id === params.id)
    if (idx < 0) return NextResponse.json({ success: false, error: 'not found' }, { status: 404 })
    groups[idx] = { ...groups[idx], ...patch }
    write(groups)
    return NextResponse.json({ success: true, data: groups[idx] })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const groups = read().filter((g: any) => g.id !== params.id)
    write(groups)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
