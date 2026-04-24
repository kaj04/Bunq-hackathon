import { NextResponse } from 'next/server'
export async function GET() {
  // Print all env vars that match our pattern
  const keys = Object.keys(process.env).filter(k => k.includes('ANTHROPIC') || k.includes('BUNQ') || k.includes('NEXT'))
  const env: Record<string, string> = {}
  for (const k of keys) {
    env[k] = (process.env[k] ?? '').slice(0, 20)
  }
  return NextResponse.json({ env, totalEnvKeys: Object.keys(process.env).length })
}
