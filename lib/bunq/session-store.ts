// Persiste il session token su file — evita re-handshake ad ogni restart
import fs from 'fs'
import path from 'path'

const STORE = path.join(process.cwd(), '.bunq-session.json')
const SESSION_TTL_MS = 55 * 60 * 1000 // 55 minuti (Bunq scade dopo 1h)

export type StoredSession = {
  privateKey: string
  publicKey: string
  installationToken: string
  sessionToken: string
  userId: number
  accountId: number
  savedAt: number
}

export function loadSession(): StoredSession | null {
  try {
    if (!fs.existsSync(STORE)) return null
    const data: StoredSession = JSON.parse(fs.readFileSync(STORE, 'utf8'))
    if (Date.now() - data.savedAt > SESSION_TTL_MS) { clearSession(); return null }
    return data
  } catch { return null }
}

export function saveSession(data: Omit<StoredSession, 'savedAt'>) {
  fs.writeFileSync(STORE, JSON.stringify({ ...data, savedAt: Date.now() }, null, 2))
}

export function clearSession() {
  try { fs.unlinkSync(STORE) } catch {}
}
