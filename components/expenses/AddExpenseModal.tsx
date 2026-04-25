'use client'
import React, { useState, useRef } from 'react'
import { X, Camera, Mic, Edit3, Send, CheckCircle2, Smartphone, Users } from 'lucide-react'
import { Group, ReceiptData, SplitResult } from '@/types/designer'
import type { AgentResponse } from '@/types'

interface AddExpenseModalProps {
  group: Group
  currentUser?: string
  onClose: () => void
  onConfirm: (description: string, total: number, splits: SplitResult[]) => void
}

type Step = 'select' | 'process' | 'voice-after-scan' | 'needs-input' | 'review'
type Mode = 'camera' | 'voice' | 'manual'

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ group, currentUser, onClose, onConfirm }) => {
  const [step, setStep] = useState<Step>('select')
  const [mode, setMode] = useState<Mode | null>(null)
  const [processingText, setProcessingText] = useState('AI is looking for details...')
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [splits, setSplits] = useState<SplitResult[]>([])
  const [manualDescription, setManualDescription] = useState('')
  const [manualTotal, setManualTotal] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isDescribeRecording, setIsDescribeRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [agentQuestion, setAgentQuestion] = useState('')
  const [agentHistory, setAgentHistory] = useState<any[]>([])
  const [followUpText, setFollowUpText] = useState('')
  const [isFollowUpRecording, setIsFollowUpRecording] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  const processReceiptImage = async (file: File) => {
    setMode('camera')
    setStep('process')
    const texts = ['Scanning receipt structure...', 'Extracting line items...', 'Identifying prices...', 'Finalizing...']
    let i = 0
    const interval = setInterval(() => { setProcessingText(texts[i]); i++; if (i >= texts.length) clearInterval(interval) }, 700)

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1]
      try {
        const res = await fetch('/api/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
        })
        const data = await res.json()
        clearInterval(interval)
        if (data.success) {
          setReceiptData(data.data)
          setStep('voice-after-scan')
        } else {
          setStep('select')
          alert('Could not read receipt. Please try again or use manual entry.')
        }
      } catch { clearInterval(interval); setStep('select') }
    }
    reader.readAsDataURL(file)
  }

  // ── Agent call — core of the agentic flow ────────────────────────────────────
  const callAgent = async (userMessage: string, history?: any[]) => {
    setStep('process')
    setProcessingText('Agent is thinking...')
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: userMessage, history }),
      })
      const data: AgentResponse = await res.json()
      if (data.state === 'proposal') {
        setSplits(data.proposal.splits.map(s => ({ name: s.participant.name, amount: s.amount.toFixed(2) })))
        if (receiptData) setReceiptData(prev => prev ? { ...prev, total: data.proposal.total } : prev)
        setStep('review')
      } else if (data.state === 'needs_input') {
        setAgentQuestion(data.question)
        setAgentHistory(data.history)
        setFollowUpText('')
        setStep('needs-input')
      } else {
        setStep('select')
        alert('Agent error. Try rephrasing.')
      }
    } catch {
      setStep('select')
      alert('Agent error. Try again.')
    }
  }

  // ── Web Speech API helper — used for all voice inputs ────────────────────────
  const startSpeech = (onFinal: (t: string) => void, setRecording: (v: boolean) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Use Chrome for voice input'); return }
    const r = new SR()
    r.lang = 'it-IT'; r.continuous = false; r.interimResults = true
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((x: any) => x[0].transcript).join('')
      if (e.results[e.results.length - 1].isFinal) onFinal(t)
    }
    r.onend = () => setRecording(false)
    recognitionRef.current = r; r.start(); setRecording(true)
  }
  const stopSpeech = () => recognitionRef.current?.stop()

  // ── Voice card (select screen): speak → agent directly ───────────────────────
  const startRecording = () => {
    setMode('voice')
    startSpeech((t) => { setTranscript(t); callAgent(t) }, setIsRecording)
  }
  const stopRecording = () => { stopSpeech(); setIsRecording(false) }

  // ── Describe recording (after receipt scan): speak → agent with receipt ───────
  const startDescribeRecording = () => {
    startSpeech((t) => {
      setTranscript(t)
      const itemList = receiptData!.items
        .map(i => `- ${i.name} ×${i.quantity ?? 1} €${(i.price * (i.quantity ?? 1)).toFixed(2)}`)
        .join('\n')
      callAgent(`[RICEVUTA]\nArticoli:\n${itemList}\nTotale: €${receiptData!.total.toFixed(2)}\n\n${t}`)
    }, setIsDescribeRecording)
  }
  const stopDescribeRecording = () => { stopSpeech(); setIsDescribeRecording(false) }

  // ── Equal split fallback (no agent needed) ────────────────────────────────────
  const splitEqually = (data: ReceiptData) => {
    const perPerson = data.total / group.members.length
    setSplits(group.members.map(m => ({ name: m.name, amount: perPerson.toFixed(2) })))
    setStep('review')
  }

  // ── Follow-up answer (needs-input step) ──────────────────────────────────────
  const handleFollowUp = (text: string) => { if (text.trim()) callAgent(text, agentHistory) }
  const startFollowUpSpeech = () => startSpeech((t) => { setFollowUpText(t); callAgent(t, agentHistory) }, setIsFollowUpRecording)

  // ── Manual mode ───────────────────────────────────────────────────────────────

  const handleManualSubmit = async () => {
    if (!manualDescription || !manualTotal) return
    setMode('manual'); setStep('process')
    setProcessingText('Calculating split...')
    const total = parseFloat(manualTotal)
    const perPerson = total / group.members.length
    setSplits(group.members.map(m => ({ name: m.name, amount: perPerson.toFixed(2) })))
    setReceiptData({ items: [{ name: manualDescription, price: total }], total })
    setStep('review')
  }

  const handleFinalConfirm = () => {
    const desc = mode === 'manual' ? manualDescription : mode === 'voice' ? (transcript || receiptData?.items[0]?.name || 'Voice expense') : 'Receipt expense'
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

          {/* ── Step: select mode ── */}
          {step === 'select' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                {[
                  { id: 'camera', icon: Camera, label: 'Camera', desc: 'Scan Receipt', color: 'bg-bunq' },
                  { id: 'voice',  icon: Mic,    label: 'Voice',  desc: 'Just describe it', color: 'bg-indigo-500' },
                  { id: 'manual', icon: Edit3,   label: 'Manual', desc: 'Enter details', color: 'bg-purple-500' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => m.id === 'camera' ? fileRef.current?.click() : m.id === 'voice' ? startRecording() : setMode('manual')}
                    className="flex flex-col items-center gap-6 p-8 bg-white/5 hover:bg-white/10 border border-white/5 border-dashed hover:border-white/20 rounded-[32px] transition-all group active:scale-95"
                  >
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
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) processReceiptImage(e.target.files[0]) }} />

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
                  <p className="text-white font-semibold">Recording... speak now</p>
                  <p className="text-xs text-zinc-500 mt-1">e.g. "Split yesterday's dinner with Giorgio and Diego"</p>
                  <button onClick={stopRecording}
                    className="mt-4 px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-full transition-colors">
                    Done talking
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step: AI processing ── */}
          {step === 'process' && (
            <div className="bg-[#1a1a1a] rounded-[24px] p-12 border-2 border-dashed border-bunq/40 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-16 h-16 bg-bunq/20 rounded-full flex items-center justify-center relative">
                <div className="absolute inset-0 bg-bunq/10 animate-ping opacity-20 rounded-full" />
                <Camera className="text-bunq" size={32} />
              </div>
              <div>
                <h4 className="text-xl font-bold mb-1">AI is processing...</h4>
                <p className="text-xs text-zinc-500 italic uppercase tracking-widest font-bold">{processingText}</p>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-bunq h-full animate-pulse w-3/4" />
              </div>
            </div>
          )}

          {/* ── Step: voice describe (after receipt scan) ── */}
          {step === 'voice-after-scan' && receiptData && (
            <div className="space-y-6">
              {/* Scanned receipt summary */}
              <div className="bg-white/5 rounded-[24px] p-6 border border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-xs font-bold text-white/40 uppercase tracking-[0.2em]">Receipt scanned</p>
                  <p className="text-bunq font-bold text-lg">€ {receiptData.total.toFixed(2)}</p>
                </div>
                <div className="space-y-2">
                  {receiptData.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-white/60">
                        {item.name}{item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''}
                      </span>
                      <span className="font-mono text-white/80">€ {item.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div className="text-center space-y-1">
                <h4 className="font-bold text-xl">Who ordered what?</h4>
                <p className="text-white/40 text-sm">
                  e.g. "Giorgio had the pizza, I had the pasta and the beer"
                </p>
              </div>

              {!isDescribeRecording ? (
                <div className="flex gap-3">
                  <button
                    onClick={startDescribeRecording}
                    className="flex-1 flex flex-col items-center gap-3 p-6 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-[24px] transition-all group active:scale-95"
                  >
                    <div className="w-14 h-14 bg-indigo-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Mic size={28} className="text-white" />
                    </div>
                    <span className="font-bold text-sm">Describe orders</span>
                  </button>
                  <button
                    onClick={() => splitEqually(receiptData)}
                    className="flex-1 flex flex-col items-center gap-3 p-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[24px] transition-all group active:scale-95"
                  >
                    <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Users size={28} className="text-white/60" />
                    </div>
                    <span className="font-bold text-sm text-white/60">Split equally</span>
                  </button>
                </div>
              ) : (
                <div className="text-center py-6 space-y-4">
                  <div className="w-16 h-16 bg-rose-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Mic size={32} className="text-white" />
                  </div>
                  <p className="text-white font-semibold">Listening... describe who ordered what</p>
                  <button
                    onClick={stopDescribeRecording}
                    className="px-8 py-3 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-full transition-colors"
                  >
                    Done talking
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step: agent needs more info ── */}
          {step === 'needs-input' && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 p-5 bg-indigo-500/10 rounded-[24px] border border-indigo-500/20">
                <CheckCircle2 size={18} className="text-indigo-400 mt-0.5 shrink-0" />
                <p className="text-sm text-indigo-200 leading-relaxed">{agentQuestion}</p>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Your reply</p>
                <div className="relative">
                  <textarea
                    value={followUpText}
                    onChange={e => setFollowUpText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFollowUp(followUpText) } }}
                    placeholder='e.g. "Giorgio had the pizza, I had the pasta"'
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-bunq min-h-[100px] resize-none"
                  />
                  <button
                    onClick={isFollowUpRecording ? () => stopSpeech() : startFollowUpSpeech}
                    className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center transition-all ${isFollowUpRecording ? 'bg-red-500 animate-pulse' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    <Mic size={18} className="text-white" />
                  </button>
                </div>
                <button
                  onClick={() => handleFollowUp(followUpText)}
                  disabled={!followUpText.trim()}
                  className="btn-primary w-full !py-4 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={18} /> Send
                </button>
              </div>
            </div>
          )}

          {/* ── Step: review split ── */}
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
                          {split.name?.charAt(0) ?? '?'}
                        </div>
                        <span className="font-semibold text-sm">{split.name}</span>
                      </div>
                      <span className="font-bold text-bunq text-sm">€ {split.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex flex-col gap-4">
                {transcript && (
                  <div className="flex items-start gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <Mic size={16} className="text-white/40 mt-0.5 shrink-0" />
                    <p className="text-xs text-white/60 italic">"{transcript}"</p>
                  </div>
                )}
                <div className="flex items-center gap-3 p-4 bg-bunq/5 rounded-2xl border border-bunq/20">
                  <CheckCircle2 className="text-bunq" size={20} />
                  <p className="text-xs text-white/70 italic">Calculated by MeditaSplit AI agent.</p>
                </div>
                <button onClick={handleFinalConfirm} className="btn-primary w-full !py-4 shadow-xl shadow-bunq/20">
                  <Send size={20} /> Send payment requests via Bunq
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
