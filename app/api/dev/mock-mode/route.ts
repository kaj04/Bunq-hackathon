import { NextRequest, NextResponse } from 'next/server'
import { isMock, setMock } from '@/lib/mock-flag'

export async function GET() {
  return NextResponse.json({ mock: isMock() })
}

export async function POST(req: NextRequest) {
  const { mock } = await req.json()
  setMock(Boolean(mock))
  console.log(`[dev] Mock mode → ${isMock() ? 'ON (synthetic data)' : 'OFF (real Bunq)'}`)
  return NextResponse.json({ mock: isMock() })
}
