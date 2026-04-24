'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import type { Receipt, SplitResult } from '@/types'

export default function BillSplitter({ 
  isEmbedded = false, 
  initialParticipants = '', 
  onGroupSplit 
}: { 
  isEmbedded?: boolean; 
  initialParticipants?: string; 
  onGroupSplit?: (splits: SplitResult[]) => void; 
}) {
  const [tab, setTab] = useState<'voice' | 'image'>('voice')
  const [participants, setParticipants] = useState(initialParticipants)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [splits, setSplits] = useState<SplitResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [payStatus, setPayStatus] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialParticipants) setParticipants(initialParticipants)
  }, [initialParticipants])

  const recognitionRef = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const getParticipantList = () =>
    participants.split(',').map(p => p.trim()).filter(Boolean)

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Use Chrome for voice input'); return }

    const r = new SR()
    r.lang = 'it-IT'
    r.continuous = false
    r.interimResults = true
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((x: any) => x[0].transcript).join('')
      setTranscript(t)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    recognitionRef.current = r
    r.start()
    setListening(true)
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const doSplit = async (withReceipt: Receipt | null) => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: withReceipt,
          participants: getParticipantList(),
          voiceInput: transcript,
        }),
      })
      const data = await res.json()
      if (data.success) setSplits(data.data)
      else setError(data.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setReceipt(null)
    setSplits(null)
    setError(null)

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setImagePreview(dataUrl)
      const base64 = dataUrl.split(',')[1]

      setScanLoading(true)
      try {
        const res = await fetch('/api/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
        })
        const data = await res.json()
        if (data.success) setReceipt(data.data)
        else setError(data.error)
      } finally {
        setScanLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const sendPayment = async (split: SplitResult) => {
    const name = split.participant.name
    const alias = split.participant.bunqAlias ?? `${name.toLowerCase()}@example.com`
    setPayStatus(p => ({ ...p, [name]: 'sending…' }))
    try {
      const res = await fetch('/api/bunq/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientAlias: alias,
          amount: split.amount,
          currency: 'EUR',
          description: 'Bill split — Bunq Hackathon',
        }),
      })
      const data = await res.json()
      setPayStatus(p => ({ ...p, [name]: data.success ? '✓ Sent!' : '✗ Failed' }))
    } catch {
      setPayStatus(p => ({ ...p, [name]: '✗ Error' }))
    }
  }

    const Wrapper = isEmbedded ? 'div' : 'main'
    const wrapperClass = isEmbedded 
      ? "w-full" 
      : "min-h-screen bg-gradient-to-br from-[#00a86b] to-[#004d31] p-4 flex items-start justify-center"
    
    const innerClass = isEmbedded 
      ? "w-full" 
      : "w-full max-w-md pt-10"

  return (
    <Wrapper className={wrapperClass}>
      <div className={innerClass}>
        {/* Header */}
        {!isEmbedded && (
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white tracking-tight">Bill Splitter</h1>
            <p className="text-green-200 mt-1">Voice & photo powered by Claude + Bunq</p>
          </div>
        )}

        <div className={isEmbedded ? "space-y-5" : "bg-white rounded-3xl shadow-2xl p-6 space-y-5"}>

          {/* Participants */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Participants
            </label>
            <input
              type="text"
              value={participants}
              onChange={e => setParticipants(e.target.value)}
              placeholder="Francesco, Giorgio, Vaggelis, Diego"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none transition"
            />
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-2xl p-1">
            {(['voice', 'image'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setSplits(null); setError(null) }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold capitalize transition-all ${tab === t ? 'bg-white shadow text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {t === 'voice' ? '📝 Input' : '📷 Photo'}
              </button>
            ))}
          </div>

          {/* ── VOICE TAB ── */}
          {tab === 'voice' && (
            <div className="text-center space-y-4">
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder="e.g. 'I paid 50 euros for drinks for Giorgio and me'"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-green-500 focus:outline-none transition min-h-[100px]"
              />
              
              <div className="flex gap-2 items-center justify-center">
                <p className="text-xs text-gray-400">Or use your microphone:</p>
                <button
                  onClick={listening ? stopListening : startListening}
                  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition ${listening ? 'bg-red-500 animate-pulse' : 'bg-gray-400 hover:bg-gray-500'}`}
                >
                  {listening ? '⏹ Stop' : '🎤 Dictate'}
                </button>
              </div>

              <button
                onClick={() => doSplit(null)}
                disabled={!transcript || !getParticipantList().length || loading}
                className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-green-600 transition"
              >
                {loading ? 'Calculating…' : 'Split Bill'}
              </button>
            </div>
          )}

          {/* ── IMAGE TAB ── */}
          {tab === 'image' && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-green-400 transition"
              >
                {scanLoading ? (
                  <p className="text-green-500 font-semibold animate-pulse">Scanning receipt…</p>
                ) : imagePreview ? (
                  <img src={imagePreview} alt="Receipt" className="max-h-48 mx-auto rounded-lg object-contain" />
                ) : (
                  <>
                    <p className="text-4xl mb-2">📷</p>
                    <p className="text-gray-400 text-sm">Tap to upload receipt photo</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

              {receipt && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="font-semibold text-sm mb-2 text-gray-700">
                    Detected {receipt.items.length} items
                  </p>
                  <div className="space-y-1">
                    {receipt.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.name} ×{item.quantity}</span>
                        <span className="font-medium">€{item.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-gray-200">
                    <span>Total</span>
                    <span>€{receipt.total.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Optional voice instruction for image mode */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Optional: describe how to split</p>
                <div className="flex gap-2 items-start">
                  <button
                    onClick={listening ? stopListening : startListening}
                    title="Use microphone"
                    className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition ${listening ? 'bg-red-500 animate-pulse' : 'bg-gray-400 hover:bg-gray-500'}`}
                  >
                    {listening ? '⏹' : '🎤'}
                  </button>
                  <textarea
                    value={transcript}
                    onChange={e => setTranscript(e.target.value)}
                    placeholder="e.g. 'Split equally'"
                    className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-green-500 focus:outline-none transition min-h-[40px]"
                  />
                </div>
              </div>

              <button
                onClick={() => doSplit(receipt)}
                disabled={!receipt || !getParticipantList().length || loading}
                className="w-full bg-green-500 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-green-600 transition"
              >
                {loading ? 'Calculating…' : 'Split Bill'}
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* ── SPLIT RESULTS ── */}
          {splits && splits.length > 0 && (
            <div className="border-t pt-5">
              <h2 className="font-bold text-gray-800 mb-4">Split Result</h2>
              <div className="space-y-3">
                {splits.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                    <div>
                      <p className="font-semibold text-gray-800">{s.participant.name}</p>
                      <p className="text-2xl font-bold text-green-600">€{s.amount.toFixed(2)}</p>
                    </div>
                    {!onGroupSplit && (
                      <button
                        onClick={() => sendPayment(s)}
                        disabled={!!payStatus[s.participant.name]}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition ${
                          payStatus[s.participant.name]
                            ? payStatus[s.participant.name].includes('✓') ? 'bg-gray-400' : 'bg-red-400'
                            : 'bg-[#00a86b] hover:bg-green-700'
                        }`}
                      >
                        {payStatus[s.participant.name] ?? 'Request via Bunq'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              
              {onGroupSplit && (
                <button
                  onClick={() => onGroupSplit(splits)}
                  className="mt-4 w-full bg-[#00a86b] text-white py-3 rounded-xl font-bold text-sm hover:bg-green-700 transition"
                >
                  Conferma e Invia al Gruppo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Wrapper>
  )
}
