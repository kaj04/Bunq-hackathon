import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const STORE = path.join(process.cwd(), 'chat-store.json')
const MAX_MESSAGES = 200

function read(): Record<string, any[]> {
  if (!fs.existsSync(STORE)) return {}
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')) } catch { return {} }
}

function write(data: Record<string, any[]>) {
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2))
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const store = read()
  return NextResponse.json({ success: true, data: store[params.id] ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const message = await req.json()
    if (!message.id || !message.text) return NextResponse.json({ success: false, error: 'id and text required' }, { status: 400 })
    const store = read()
    const messages = store[params.id] ?? []
    if (!messages.some((m: any) => m.id === message.id)) {
      messages.push(message)
      if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES)
      store[params.id] = messages
      write(store)
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const store = read()
    delete store[params.id]
    write(store)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
