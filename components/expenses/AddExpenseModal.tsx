'use client'
import React, { useState, useRef } from 'react'
import { X, Camera, Mic, Edit3, Send, CheckCircle2, Smartphone, Users } from 'lucide-react'
import { Group, ReceiptData, SplitResult } from '@/types/designer'

interface AddExpenseModalProps {
  group: Group
  currentUser?: string
  onClose: () => void
  onConfirm: (description: string, total: number, splits: SplitResult[]) => void
}

type Step = 'select' | 'process' | 'voice-after-scan' | 'review'
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
  const [clarification, setClarification] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePrompt, setImagePrompt] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const describeRecorderRef = useRef<MediaRecorder | null>(null)
  const describeChunksRef = useRef<Blob[]>([])

  const blobToBase64 = (blob: Blob): Promise<string> => new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = ev => resolve((ev.target?.result as string).split(',')[1])
    reader.readAsDataURL(blob)
  })

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setMode('camera')
  }

  const processReceiptWithPrompt = async () => {
    if (!selectedFile) return
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
          body: JSON.stringify({ imageBase64: base64, mediaType: selectedFile.type }),
        })
        const data = await res.json()
        clearInterval(interval)
        if (data.success) {
          setReceiptData(data.data)
          if (imagePrompt.trim()) {
            await getSplits(data.data.total, imagePrompt, data.data)
          } else {
            setStep('voice-after-scan')
          }
        } else {
          setStep('select')
          alert('Could not read receipt. Please try again or use manual entry.')
        }
      } catch { clearInterval(interval); setStep('select') }
    }
    reader.readAsDataURL(selectedFile)
  }

  const getSplits = async (total: number, voiceInput = '', receiptOverride?: ReceiptData | null) => {
    setStep('process')
    setProcessingText('Calculating split...')
    const res = await fetch('/api/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receipt: receiptOverride ?? receiptData,
        participants: group.members,
        voiceInput,
        speaker: currentUser,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setSplits(data.data.map((s: any) => ({ name: s.participant.name, amount: s.amount.toFixed(2) })))
    }
    setStep('review')
  }

  // ── Initial voice mode (no receipt) ──────────────────────────────────────────

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
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch {
      alert('Could not access microphone. Please allow mic permissions.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
    setMode('voice')
    setStep('process')
    setProcessingText('Transcribing audio...')
  }

  const processVoiceAudio = async (blob: Blob, mimeType: string) => {
    const base64 = await blobToBase64(blob)
    try {
      setProcessingText('Understanding your request...')
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mediaType: mimeType, speaker: 'Me' }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      const intent = data.data
      setTranscript(intent.transcript ?? '')
      setClarification(intent.clarification_needed ?? null)

      if (intent.matched_payments?.length) {
        setReceiptData({
          items: intent.matched_payments.map((p: any) => ({ name: p.description, price: p.amount, quantity: 1 })),
          total: intent.amount ?? intent.matched_payments.reduce((s: number, p: any) => s + p.amount, 0),
          currency: intent.currency ?? 'EUR',
        })
      } else if (intent.amount) {
        setReceiptData({
          items: [{ name: intent.description || 'Voice expense', price: intent.amount, quantity: 1 }],
          total: intent.amount,
          currency: intent.currency ?? 'EUR',
        })
      }

      if (intent.splits?.length) {
        setSplits(intent.splits.map((s: any) => ({ name: s.name, amount: s.owes.toFixed(2) })))
      } else {
        const total = intent.amount ?? 0
        const perPerson = total / group.members.length
        setSplits(group.members.map(m => ({ name: m.name, amount: perPerson.toFixed(2) })))
      }

      setStep('review')
    } catch (err) {
      console.error('Voice processing failed:', err)
      setStep('select')
      alert('Voice processing failed. Please try again.')
    }
  }

  // ── Describe recording (after receipt scan) ───────────────────────────────────

  const startDescribeRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      describeChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) describeChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        processDescribeAudio(new Blob(describeChunksRef.current, { type: mimeType }), mimeType)
      }
      describeRecorderRef.current = recorder
      recorder.start()
      setIsDescribeRecording(true)
    } catch {
      alert('Could not access microphone. Please allow mic permissions.')
    }
  }

  const stopDescribeRecording = () => {
    describeRecorderRef.current?.stop()
    setIsDescribeRecording(false)
    setProcessingText('Understanding who ordered what...')
  }

  const processDescribeAudio = async (blob: Blob, mimeType: string) => {
    setStep('process')
    setProcessingText('Calculating personalised split...')
    const base64 = await blobToBase64(blob)
    try {
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mediaType: mimeType, speaker: 'Me' }),
      })
      const data = await res.json()
      const voiceTranscript = data.success ? (data.data?.transcript ?? '') : ''
      setTranscript(voiceTranscript)
      await getSplits(receiptData!.total, voiceTranscript, receiptData)
    } catch (err) {
      console.error('Describe recording failed:', err)
      await getSplits(receiptData!.total, '', receiptData)
    }
  }

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
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }} />

              {selectedFile && mode === 'camera' && (
                <div className="space-y-4 pt-4 border-t border-zinc-800">
                  <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <div className="w-12 h-12 bg-bunq/20 rounded-xl flex items-center justify-center text-bunq">
                      <Camera size={24} />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-bold truncate">{selectedFile.name}</p>
                      <p className="text-xs text-white/40">Ready to scan</p>
                    </div>
                    <button onClick={() => setSelectedFile(null)} className="text-white/20 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                  <input 
                    value={imagePrompt} 
                    onChange={e => setImagePrompt(e.target.value)}
                    placeholder="Add context (e.g. 'Mario paid for the pizza')"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-bunq" 
                  />
                  <button onClick={processReceiptWithPrompt} className="btn-primary w-full !py-4 shadow-xl shadow-bunq/20">
                    Scan and Split with AI
                  </button>
                </div>
              )}

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
                    onClick={() => getSplits(receiptData.total, '', receiptData)}
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
                {clarification && (
                  <div className="flex items-start gap-3 p-4 bg-yellow-500/10 rounded-2xl border border-yellow-500/20">
                    <CheckCircle2 size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-yellow-200">{clarification}</p>
                  </div>
                )}
                {!clarification && (
                  <div className="flex items-center gap-3 p-4 bg-bunq/5 rounded-2xl border border-bunq/20">
                    <CheckCircle2 className="text-bunq" size={20} />
                    <p className="text-xs text-white/70 italic">Calculated automatically by MeditaSplit AI.</p>
                  </div>
                )}
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
