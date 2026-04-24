'use client'
import React, { useState, useRef } from 'react'
import { X, Camera, Mic, Edit3, Send, CheckCircle2, Smartphone } from 'lucide-react'
import { Group, ReceiptData, SplitResult } from '@/types/designer'

interface AddExpenseModalProps {
  group: Group
  onClose: () => void
  onConfirm: (description: string, total: number, splits: SplitResult[]) => void
}

type Step = 'select' | 'process' | 'review'
type Mode = 'camera' | 'voice' | 'manual'

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ group, onClose, onConfirm }) => {
  const [step, setStep] = useState<Step>('select')
  const [mode, setMode] = useState<Mode | null>(null)
  const [processingText, setProcessingText] = useState('AI is looking for details...')
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null)
  const [splits, setSplits] = useState<SplitResult[]>([])
  const [manualDescription, setManualDescription] = useState('')
  const [manualTotal, setManualTotal] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  const processReceiptImage = async (file: File) => {
    setMode('camera')
    setStep('process')
    const texts = ['Scanning receipt structure...', 'Extracting line items...', 'Identifying prices...', 'Finalizing split...']
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
        if (data.success) {
          clearInterval(interval)
          setReceiptData(data.data)
          await getSplits(data.data.total)
        }
      } catch { clearInterval(interval); setStep('select') }
    }
    reader.readAsDataURL(file)
  }

  const getSplits = async (total: number, voiceInput = '') => {
    const res = await fetch('/api/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receipt: receiptData,
        participants: group.members,
        voiceInput,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setSplits(data.data.map((s: any) => ({ name: s.participant.name, amount: s.amount.toFixed(2) })))
    }
    setStep('review')
  }

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Voice requires Chrome'); return }
    const r = new SR()
    r.lang = 'en-US'; r.continuous = false; r.interimResults = false
    r.onresult = async (e: any) => {
      const t = e.results[0][0].transcript
      setTranscript(t)
      setIsRecording(false)
      setMode('voice'); setStep('process')
      setProcessingText('Processing voice input...')
      await getSplits(0, t)
    }
    r.onend = () => setIsRecording(false)
    recognitionRef.current = r
    r.start(); setIsRecording(true)
  }

  const handleManualSubmit = async () => {
    if (!manualDescription || !manualTotal) return
    setMode('manual'); setStep('process')
    setProcessingText('Calculating split...')
    const total = parseFloat(manualTotal)
    const perPerson = total / group.members.length
    setSplits(group.members.map(m => ({ name: m, amount: perPerson.toFixed(2) })))
    setReceiptData({ items: [{ name: manualDescription, price: total }], total })
    setStep('review')
  }

  const handleFinalConfirm = () => {
    const desc = mode === 'manual' ? manualDescription : mode === 'voice' ? (transcript || 'Voice expense') : 'Receipt expense'
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
          {step === 'select' && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                {[
                  { id: 'camera', icon: Camera, label: 'Camera', desc: 'Scan Receipt', color: 'bg-bunq' },
                  { id: 'voice', icon: Mic, label: 'Voice', desc: 'Just describe it', color: 'bg-indigo-500' },
                  { id: 'manual', icon: Edit3, label: 'Manual', desc: 'Enter details', color: 'bg-purple-500' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => m.id === 'camera' ? fileRef.current?.click() : m.id === 'voice' ? startVoice() : setMode('manual')}
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
                  <p className="text-white font-semibold">Listening... speak now</p>
                  <button onClick={() => { recognitionRef.current?.stop(); setIsRecording(false) }}
                    className="mt-3 text-xs text-zinc-500 hover:text-white">Stop</button>
                </div>
              )}
            </div>
          )}

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
                  <p className="text-xs text-white/70 italic">Calculated automatically by MeditaSplit AI.</p>
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
