'use client'
import React, { useState, useRef } from 'react'
import { X, Camera, Mic, Edit3, Send, CheckCircle2, Smartphone } from 'lucide-react'
import { Group, ReceiptData, SplitResult } from '@/types/designer'
import type { AgentResponse } from '@/types'

interface AddExpenseModalProps {
  group: Group
  onClose: () => void
  onConfirm: (description: string, total: number, splits: SplitResult[]) => void
}

type Step = 'select' | 'scanning' | 'describe' | 'reasoning' | 'review'
type Mode = 'camera' | 'voice' | 'manual'

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ group, onClose, onConfirm }) => {
  const [step, setStep] = useState<Step>('select')
  const [mode, setMode] = useState<Mode | null>(null)
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [splits, setSplits] = useState<SplitResult[]>([])
  const [splitDesc, setSplitDesc] = useState('')
  const [agentQuestion, setAgentQuestion] = useState('')
  const [agentHistory, setAgentHistory] = useState<any[]>([])
  const [manualDescription, setManualDescription] = useState('')
  const [manualTotal, setManualTotal] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [listening, setListening] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // ── Web Speech API (describe step) ───────────────────────────────────────
  const startSpeech = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Use Chrome for voice input'); return }
    const r = new SR()
    r.lang = 'it-IT'; r.continuous = false; r.interimResults = true
    r.onresult = (e: any) => setSplitDesc(Array.from(e.results).map((x: any) => x[0].transcript).join(''))
    r.onend = () => setListening(false)
    recognitionRef.current = r; r.start(); setListening(true)
  }
  const stopSpeech = () => { recognitionRef.current?.stop(); setListening(false) }

  // ── Receipt scan ─────────────────────────────────────────────────────────
  const processReceiptImage = async (file: File) => {
    setMode('camera'); setStep('scanning')
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1]
      try {
        const res = await fetch('/api/receipt', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
        })
        const data = await res.json()
        if (data.success) { setReceiptData(data.data); setStep('describe') }
        else { setStep('select'); alert('Could not read receipt. Try again or use manual entry.') }
      } catch { setStep('select') }
    }
    reader.readAsDataURL(file)
  }

  // ── Agent split ──────────────────────────────────────────────────────────
  const callAgent = async (userMessage: string, history?: any[]) => {
    setStep('reasoning')
    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: userMessage, history }),
      })
      const data: AgentResponse = await res.json()
      if (data.state === 'proposal') {
        setSplits(data.proposal.splits.map(s => ({ name: s.participant.name, amount: s.amount.toFixed(2) })))
        setReceiptData(prev => prev ? { ...prev, total: data.proposal.total } : prev)
        setStep('review')
      } else if (data.state === 'needs_input') {
        setAgentQuestion(data.question); setAgentHistory(data.history)
        setSplitDesc(''); setStep('describe')
      } else {
        setStep('describe'); alert('Agent error. Try rephrasing.')
      }
    } catch { setStep('describe') }
  }

  const handleAgentSplit = () => {
    if (!receiptData || !splitDesc.trim()) return
    const itemList = receiptData.items
      .map(i => `- ${i.name} ×${i.quantity ?? 1} €${(i.price * (i.quantity ?? 1)).toFixed(2)}`)
      .join('\n')
    callAgent(`[RICEVUTA]\nArticoli:\n${itemList}\nTotale: €${receiptData.total.toFixed(2)}\n\n${splitDesc}`)
  }

  const handleFollowUp = () => { if (splitDesc.trim()) callAgent(splitDesc, agentHistory) }

  // ── Manual entry ─────────────────────────────────────────────────────────
  const handleManualSubmit = () => {
    if (!manualDescription || !manualTotal) return
    setMode('manual')
    const total = parseFloat(manualTotal)
    const perPerson = total / group.members.length
    setSplits(group.members.map(m => ({ name: m.name, amount: perPerson.toFixed(2) })))
    setReceiptData({ items: [{ name: manualDescription, price: total }], total })
    setStep('review')
  }

  // ── Voice recording (select screen) ─────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        processVoiceAudio(new Blob(audioChunksRef.current, { type: mimeType }), mimeType)
      }
      mediaRecorderRef.current = recorder; recorder.start(); setIsRecording(true)
    } catch { alert('Could not access microphone.') }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop(); setIsRecording(false)
    setMode('voice'); setStep('scanning')
  }

  const processVoiceAudio = async (blob: Blob, mimeType: string) => {
    const base64 = await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = ev => resolve((ev.target?.result as string).split(',')[1])
      reader.readAsDataURL(blob)
    })
    try {
      const res = await fetch('/api/voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mediaType: mimeType, speaker: 'Me' }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      const intent = data.data
      if (intent.splits?.length) {
        setSplits(intent.splits.map((s: any) => ({ name: s.name, amount: s.owes.toFixed(2) })))
      } else {
        const total = intent.amount ?? 0
        const perPerson = total / group.members.length
        setSplits(group.members.map(m => ({ name: m.name, amount: perPerson.toFixed(2) })))
      }
      if (intent.amount) {
        setReceiptData({ items: [{ name: intent.description || 'Voice expense', price: intent.amount }], total: intent.amount })
      }
      setStep('review')
    } catch { setStep('select'); alert('Voice processing failed. Try again.') }
  }

  const handleFinalConfirm = () => {
    const desc = mode === 'manual' ? manualDescription : receiptData?.items[0]?.name ?? 'Expense'
    const total = receiptData?.total ?? parseFloat(manualTotal) ?? 0
    onConfirm(desc, total, splits)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-2xl rounded-[40px] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 pb-4 flex justify-between items-center bg-white/[0.02] border-b border-white/5">
          <div>
            <h3 className="text-2xl font-bold">Add Expense</h3>
            <p className="text-white/40 text-sm">To <span className="text-white font-semibold">{group.name}</span></p>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-full transition-colors text-white/30 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">

          {/* ── Select ── */}
          {step === 'select' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                {[
                  { id: 'camera', icon: Camera, label: 'Camera',  desc: 'Scan Receipt',     color: 'bg-bunq' },
                  { id: 'voice',  icon: Mic,    label: 'Voice',   desc: 'Just describe it', color: 'bg-indigo-500' },
                  { id: 'manual', icon: Edit3,  label: 'Manual',  desc: 'Enter details',    color: 'bg-purple-500' },
                ].map(m => (
                  <button key={m.id}
                    onClick={() => m.id === 'camera' ? fileRef.current?.click() : m.id === 'voice' ? startRecording() : setMode('manual')}
                    className="flex flex-col items-center gap-6 p-8 bg-white/5 hover:bg-white/10 border border-white/5 border-dashed hover:border-white/20 rounded-[32px] transition-all group active:scale-95">
                    <div className={`w-20 h-20 ${m.color} rounded-3xl flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform`}>
                      <m.icon size={40} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-lg text-white">{m.label}</p>
                      <p className="text-xs uppercase tracking-widest font-bold text-white/30">{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) processReceiptImage(e.target.files[0]) }} />

              {mode === 'manual' && (
                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <input value={manualDescription} onChange={e => setManualDescription(e.target.value)}
                    placeholder="Description (e.g. Dinner at Mario's)"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-bunq" />
                  <input value={manualTotal} onChange={e => setManualTotal(e.target.value)}
                    placeholder="Total amount (€)" type="number" step="0.01"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-bunq" />
                  <button onClick={handleManualSubmit} className="btn-primary w-full">Calculate Split</button>
                </div>
              )}

              {isRecording && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-rose-500 rounded-full flex items-center justify-center mx-auto animate-pulse mb-3">
                    <Mic size={32} className="text-white" />
                  </div>
                  <p className="text-white font-semibold">Recording… speak now</p>
                  <button onClick={stopRecording}
                    className="mt-4 px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-full transition-colors">
                    Done talking
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Scanning / reasoning ── */}
          {(step === 'scanning' || step === 'reasoning') && (
            <div className="bg-[#1a1a1a] rounded-[24px] p-12 border-2 border-dashed border-bunq/40 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-16 h-16 bg-bunq/20 rounded-full flex items-center justify-center relative">
                <div className="absolute inset-0 bg-bunq/10 animate-ping opacity-20 rounded-full" />
                <Camera className="text-bunq" size={32} />
              </div>
              <div>
                <h4 className="text-xl font-bold mb-1">
                  {step === 'scanning' ? 'Reading receipt…' : 'Computing split…'}
                </h4>
                <p className="text-xs text-zinc-500 italic uppercase tracking-widest font-bold">
                  {step === 'scanning' ? 'Claude Vision is extracting items' : 'Matching contacts and calculating amounts'}
                </p>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-bunq h-full animate-pulse w-3/4" />
              </div>
            </div>
          )}

          {/* ── Describe: show receipt + ask how to split ── */}
          {step === 'describe' && receiptData && (
            <div className="space-y-6">
              <div className="bg-white/5 rounded-[24px] p-6 border border-white/10">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs font-bold text-bunq uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
                      <CheckCircle2 size={14} /> Bill analyzed!
                    </p>
                    <p className="text-white/40 text-xs">{receiptData.items.length} items detected</p>
                  </div>
                  <p className="text-2xl font-bold text-bunq">€ {receiptData.total.toFixed(2)}</p>
                </div>
                <div className="border-t border-white/5 pt-4 space-y-2">
                  {receiptData.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-white/60">{item.name}{item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
                      <span className="font-mono text-white">€ {item.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <details className="mt-4">
                  <summary className="text-xs text-white/20 cursor-pointer hover:text-white/40 uppercase tracking-widest">JSON</summary>
                  <pre className="mt-2 text-[10px] text-green-400/70 font-mono overflow-x-auto bg-black/40 rounded-xl p-3">
                    {JSON.stringify(receiptData, null, 2)}
                  </pre>
                </details>
              </div>

              {agentQuestion && (
                <div className="flex items-start gap-3 p-4 bg-purple-500/10 rounded-2xl border border-purple-500/20">
                  <CheckCircle2 size={16} className="text-purple-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-purple-200">{agentQuestion}</p>
                </div>
              )}

              <div className="space-y-3">
                <p className="text-sm font-bold text-white/60 uppercase tracking-widest">
                  {agentQuestion ? 'Your reply' : 'Come vuoi dividerlo?'}
                </p>
                <div className="relative">
                  <textarea value={splitDesc} onChange={e => setSplitDesc(e.target.value)}
                    placeholder={'E.g. "Ho preso la margherita e una coca, Filippo ha preso la boscaiola"'}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-bunq min-h-[100px] resize-none" />
                  <button onClick={listening ? stopSpeech : startSpeech}
                    className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center transition-all ${listening ? 'bg-red-500 animate-pulse' : 'bg-white/5 hover:bg-white/10'}`}>
                    <Mic size={18} className="text-white" />
                  </button>
                </div>
                <button onClick={agentQuestion ? handleFollowUp : handleAgentSplit} disabled={!splitDesc.trim()}
                  className="btn-primary w-full !py-4 disabled:opacity-40 disabled:cursor-not-allowed">
                  Split ✨
                </button>
              </div>
            </div>
          )}

          {/* ── Review ── */}
          {step === 'review' && (
            <div className="space-y-8">
              {receiptData && (
                <div className="bg-white/5 rounded-[32px] p-8 border border-white/10">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Receipt</p>
                      <h4 className="text-2xl font-bold">{group.name} Expense</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Total</p>
                      <p className="text-3xl font-bold text-bunq">€ {receiptData.total.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-2 gap-3">
                    {receiptData.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-white/50">{item.name}</span>
                        <span className="font-mono">€ {item.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h5 className="font-bold">Proposed Split</h5>
                <div className="grid grid-cols-2 gap-3">
                  {splits.map((split, idx) => (
                    <div key={idx} className="bg-card p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-bold text-xs">
                          {split.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-sm">{split.name}</span>
                      </div>
                      <span className="font-bold text-bunq text-sm">€ {split.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-4">
                <div className="flex items-center gap-3 p-4 bg-bunq/5 rounded-2xl border border-bunq/20">
                  <CheckCircle2 className="text-bunq" size={20} />
                  <p className="text-xs text-white/70 italic">Calculated by MeditaSplit AI.</p>
                </div>
                <button onClick={handleFinalConfirm} className="btn-primary w-full !py-4 shadow-xl shadow-bunq/20">
                  <Send size={20} /> Send payment requests via Bunq
                </button>
                <button onClick={() => setStep('describe')}
                  className="text-center text-[10px] text-white/20 uppercase tracking-widest hover:text-white/40 transition-colors">
                  Edit split
                </button>
                <p className="text-center text-[10px] text-white/20 uppercase tracking-widest flex items-center justify-center gap-2">
                  <Smartphone size={12} /> Secure transaction via Sandbox API
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
