import fs from 'fs'
import path from 'path'

const _suffix = process.env.BUNQ_USER_NAME ? `-${process.env.BUNQ_USER_NAME}` : ''
const DEVICE_STORE = path.join(process.cwd(), `.bunq-device${_suffix}.json`)
const SESSION_STORE = path.join(process.cwd(), `.bunq-session${_suffix}.json`)
const SUGAR_STORE = path.join(process.cwd(), `.bunq-sugar${_suffix}.json`)

const DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30 giorni
const SESSION_TTL_MS = 55 * 60 * 1000             // 55 minuti
const SUGAR_TTL_MS = 25 * 60 * 1000               // 25 minuti

export type DeviceRegistration = {
  privateKey: string
  publicKey: string
  installationToken: string
  savedAt: number
}

export type SessionData = {
  sessionToken: string
  userId: number
  accountId: number
  savedAt: number
}

export type SugarSession = {
  sessionToken: string
  userId: number
  accountId: number
  privateKey: string
  savedAt: number
}

function readJson<T>(filePath: string, ttlMs: number): T | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as T & { savedAt: number }
    if (Date.now() - data.savedAt > ttlMs) { fs.unlinkSync(filePath); return null }
    return data
  } catch { return null }
}

function writeJson(filePath: string, data: object) {
  fs.writeFileSync(filePath, JSON.stringify({ ...data, savedAt: Date.now() }, null, 2))
}

function deleteJson(filePath: string) {
  try { fs.unlinkSync(filePath) } catch {}
}

// ─── Device registration (installation + keypair) — quasi permanente ──────────

export function loadDevice(): DeviceRegistration | null {
  return readJson<DeviceRegistration>(DEVICE_STORE, DEVICE_TTL_MS)
}

export function saveDevice(data: Omit<DeviceRegistration, 'savedAt'>) {
  writeJson(DEVICE_STORE, data)
}

export function clearDevice() {
  deleteJson(DEVICE_STORE)
}

// ─── Session token — si rinnova ogni ora senza rifare device-server ───────────

export function loadSession(): SessionData | null {
  return readJson<SessionData>(SESSION_STORE, SESSION_TTL_MS)
}

export function saveSession(data: Omit<SessionData, 'savedAt'>) {
  writeJson(SESSION_STORE, data)
}

export function clearSession() {
  deleteJson(SESSION_STORE)
}

// ─── Sugar user session — evita handshake ripetuti su ogni fund ──────────────

export function loadSugar(): SugarSession | null {
  return readJson<SugarSession>(SUGAR_STORE, SUGAR_TTL_MS)
}

export function saveSugar(data: Omit<SugarSession, 'savedAt'>) {
  writeJson(SUGAR_STORE, data)
}

export function clearSugar() {
  deleteJson(SUGAR_STORE)
}
