'use client'

import { useState, useRef, useCallback } from 'react'
import type { SplitProposal, MessageTurn } from '@/types'

type AppState =
  | 'idle'
  | 'reasoning'
  | 'needs_input'
  | 'confirming'
  | 'acting'
  | 'done'

export default function BillSplitter() {
  const [appState, setAppState]     = useState<AppState>('idle')
  const [transcript, setTranscript] = useState('')
  const [listening, setListening]   = useState(false)
  const [question, setQuestion]     = useState('')
  const [answer, setAnswer]         = useState('')
  const [history, setHistory]       = useState<MessageTurn[]>([])
  const [proposal, setProposal]     = useState<SplitProposal | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [doneMsg, setDoneMsg]       = useState('')

  const recognitionRef = useRef<any>(null)

  // ── Voice recording ───────────────────────────────────────────────────────

  const startListening = useCallback((onDone?: (t: string) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Usa Chrome per il voice input'); return }
    const r = new SR()
    r.lang = 'it-IT'
    r.continuous = false
    r.interimResults = true
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((x: any) => x[0].transcript).join('')
      setTranscript(t)
    }
    r.onend = () => {
      setListening(false)
      if (onDone) {
        // grab latest transcript via ref trick — pass it directly
        const final = recognitionRef.current?._lastTranscript ?? ''
        onDone(final)
      }
    }
    r.onerror = () => setListening(false)
    recognitionRef.current = r
    r.start()
    setListening(true)
  }, [])

  const stopAndRun = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  // ── Agent call ────────────────────────────────────────────────────────────

  const callAgent = async (text: string, hist?: MessageTurn[]) => {
    setError(null)
    setAppState('reasoning')
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, history: hist }),
      })
      const data = await res.json()

      if (data.state === 'proposal') {
        setProposal(data.proposal)
        setAppState('confirming')
      } else if (data.state === 'needs_input') {
        setQuestion(data.question)
        setHistory(data.history)
        setAppState('needs_input')
      } else {
        setError(data.error ?? 'Errore sconosciuto')
        setAppState('idle')
      }
    } catch (e) {
      setError(String(e))
      setAppState('idle')
    }
  }

  // ── Confirm → Act ─────────────────────────────────────────────────────────

  const confirmAndPay = async () => {
    if (!proposal) return
    setAppState('acting')
    try {
      const requests = proposal.splits.map(s => ({
        recipientAlias: s.participant.bunqAlias ?? `${s.participant.name.toLowerCase()}@example.com`,
        amount: s.amount,
        currency: proposal.currency,
        description: proposal.paymentDescription,
      }))
      const res = await fetch('/api/bunq/request-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setDoneMsg(`✓ Richiesta inviata per "${proposal.paymentDescription}"`)
      setAppState('done')
    } catch (e) {
      setError(String(e))
      setAppState('confirming')
    }
  }

  const reset = () => {
    setAppState('idle')
    setTranscript('')
    setQuestion('')
    setAnswer('')
    setHistory([])
    setProposal(null)
    setError(null)
    setDoneMsg('')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#00a86b] to-[#004d31] p-4 flex items-start justify-center">
      <div className="w-full max-w-md pt-10">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-white tracking-tight">Split</h1>
          <p className="text-green-200 mt-1">Voice powered by Claude + Bunq</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-5">

          {/* ── IDLE / RECORDING ── */}
          {(appState === 'idle' || listening) && (
            <div className="text-center space-y-4">
              <button
                onClick={listening ? stopAndRun : () => startListening()}
                className={`w-24 h-24 rounded-full text-4xl shadow-lg transition-all mx-auto block ${
                  listening
                    ? 'bg-red-500 animate-pulse scale-110'
                    : 'bg-green-500 hover:bg-green-600 hover:scale-105'
                }`}
              >
                {listening ? '⏹' : '🎤'}
              </button>
              <p className="text-xs text-gray-400">
                {listening ? 'In ascolto… parla adesso' : 'Tocca per iniziare'}
              </p>

              {transcript && (
                <div className="bg-gray-50 rounded-xl p-4 text-left">
                  <p className="text-xs text-gray-400 mb-1">Hai detto:</p>
                  <p className="text-gray-800 text-sm italic">"{transcript}"</p>
                </div>
              )}

              {transcript && !listening && (
                <button
                  onClick={() => callAgent(transcript)}
                  className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold text-sm hover:bg-green-600 transition"
                >
                  Analizza
                </button>
              )}
            </div>
          )}

          {/* ── REASONING ── */}
          {appState === 'reasoning' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Claude sta cercando il pagamento…</p>
            </div>
          )}

          {/* ── NEEDS INPUT (disambiguation) ── */}
          {appState === 'needs_input' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-800 text-sm font-medium mb-1">Serve un chiarimento</p>
                <p className="text-gray-700 text-sm">{question}</p>
              </div>
              <input
                type="text"
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && answer.trim()) {
                    callAgent(answer.trim(), history)
                    setAnswer('')
                  }
                }}
                placeholder="Rispondi qui…"
                autoFocus
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none transition"
              />
              <button
                onClick={() => { callAgent(answer.trim(), history); setAnswer('') }}
                disabled={!answer.trim()}
                className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-green-600 transition"
              >
                Invia
              </button>
            </div>
          )}

          {/* ── CONFIRMING ── */}
          {appState === 'confirming' && proposal && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Pagamento trovato</p>
                <p className="font-semibold text-gray-800">{proposal.paymentDescription}</p>
                <p className="text-2xl font-bold text-green-600 mt-1">
                  {proposal.currency} {proposal.total.toFixed(2)}
                </p>
              </div>

              <div className="space-y-2">
                {proposal.splits.map((s, i) => (
                  <div key={i} className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
                    <span className="font-medium text-gray-800">{s.participant.name}</span>
                    <span className="text-lg font-bold text-green-600">
                      {proposal.currency} {s.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-500 font-semibold text-sm hover:border-gray-300 transition"
                >
                  ❌ Annulla
                </button>
                <button
                  onClick={confirmAndPay}
                  className="flex-2 flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold text-sm hover:bg-green-600 transition"
                >
                  ✅ Conferma e invia
                </button>
              </div>
            </div>
          )}

          {/* ── ACTING ── */}
          {appState === 'acting' && (
            <div className="text-center py-8">
              <div className="w-10 h-10 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Invio richieste su Bunq…</p>
            </div>
          )}

          {/* ── DONE ── */}
          {appState === 'done' && (
            <div className="text-center space-y-4 py-4">
              <p className="text-5xl">✅</p>
              <p className="text-gray-700 font-medium">{doneMsg}</p>
              <button
                onClick={reset}
                className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold text-sm hover:bg-green-600 transition"
              >
                Nuovo split
              </button>
            </div>
          )}

          {/* ── ERROR ── */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-600 text-sm">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-red-400 mt-1 underline">
                Chiudi
              </button>
            </div>
          )}

        </div>
      </div>
    </main>
  )
}
