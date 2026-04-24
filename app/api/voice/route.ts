import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import type { ApiResponse } from '@/types'
import { getBunqContacts, getTransactions } from '@/lib/bunq/client'

const execAsync = promisify(exec)

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  const tmpFiles: string[] = []
  try {
    const { audioBase64, mediaType = 'audio/wav', speaker = 'User' } = await req.json()

    if (!audioBase64) {
      return NextResponse.json({ success: false, error: 'audioBase64 is required' }, { status: 400 })
    }

    const id = Date.now().toString()
    const ext = mediaType.includes('webm') ? 'webm'
              : mediaType.includes('mp4')  ? 'mp4'
              : mediaType.includes('ogg')  ? 'ogg'
              : 'wav'

    const tmpAudio    = path.join(os.tmpdir(), `voice_${id}.${ext}`)
    const tmpContacts = path.join(os.tmpdir(), `contacts_${id}.json`)
    const tmpPayments = path.join(os.tmpdir(), `payments_${id}.json`)
    const tmpOutput   = path.join(os.tmpdir(), `intent_${id}.json`)
    tmpFiles.push(tmpAudio, tmpContacts, tmpPayments, tmpOutput)

    // Write audio file
    await fs.writeFile(tmpAudio, Buffer.from(audioBase64, 'base64'))

    // Fetch contacts from Bunq (returns mock list when BUNQ_MOCK=true)
    let contacts: { name: string; email: string; phone: string }[] = []
    try {
      const bunqContacts = await getBunqContacts()
      contacts = bunqContacts.map(c => ({ name: c.name, email: c.alias, phone: '' }))
    } catch (e) {
      console.warn('[/api/voice] getBunqContacts failed, using empty list:', e)
    }
    await fs.writeFile(tmpContacts, JSON.stringify(contacts))

    // Fetch recent transactions and map to payment format voice_nlu expects
    let payments: any[] = []
    try {
      const txList = await getTransactions(30)
      payments = (txList as any[])
        .filter(t => parseFloat(t.amount) < 0)   // only outgoing (expenses I paid)
        .map((t, i) => ({
          id: t.id ?? i + 1,
          amount: Math.abs(parseFloat(t.amount)),
          description: t.description ?? '',
          date: (t.date ?? '').split('T')[0],
          counterparty: t.counterparty ?? '',
        }))
    } catch (e) {
      console.warn('[/api/voice] getTransactions failed, using empty list:', e)
    }
    await fs.writeFile(tmpPayments, JSON.stringify(payments))

    // Call voice_nlu.py in batch mode using system Python
    const script = path.join(process.cwd(), 'voice_nlu.py')
    const cmd = [
      'python', `"${script}"`,
      '--batch',
      '--audio-file',    `"${tmpAudio}"`,
      '--contacts-file', `"${tmpContacts}"`,
      '--payments-file', `"${tmpPayments}"`,
      '--speaker',       `"${speaker}"`,
      '--output',        `"${tmpOutput}"`,
    ].join(' ')

    await execAsync(cmd)

    const raw    = await fs.readFile(tmpOutput, 'utf-8')
    const intent = JSON.parse(raw)

    return NextResponse.json({ success: true, data: intent })
  } catch (err) {
    console.error('[/api/voice] error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  } finally {
    for (const f of tmpFiles) {
      await fs.unlink(f).catch(() => {})
    }
  }
}
