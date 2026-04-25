'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Mic, Camera, Send, CheckCircle2 } from 'lucide-react'
import { Group, GroupExpense, ChatMessage } from '@/types/designer'

interface GroupChatProps {
  group: Group
  onBack: () => void
  onOpenAddExpense: () => void
  onExpenseAdded?: (expense: GroupExpense) => void
}

type PendingSplit = {
  splits: { name: string; alias: string; amount: number }[]
  description: string
  total: number
}

export const GroupChat: React.FC<GroupChatProps> = ({ group, onBack, onExpenseAdded }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'agent',
      text: `Ciao! Sono qui per aiutarti a dividere le spese di ${group.name}.\n\nPuoi dirmi cose come:\n• "Dividi la cena di ieri tra Giorgio e Diego"\n• "Abbiamo speso €80 al ristorante, dividi tra tutti"\n• Oppure scatta una foto dello scontrino 📷`,
      timestamp: new Date().toISOString(),
    },
  ])
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pendingSplit, setPendingSplit] = useState<PendingSplit | null>(null)
  const [isSending, setIsSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const addMessage = (sender: 'user' | 'agent', text: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), sender, text, timestamp: new Date().toISOString() }])
  }

  const handleSend = async () => {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    addMessage('user', text)
    await processText(text)
  }

  const processText = async (text: string) => {
    setIsProcessing(true)
    setPendingSplit(null)
    addMessage('agent', '⏳ Sto analizzando la tua richiesta...')
    try {
      // Recupera transazioni recenti per contesto ("spese di ieri" ecc.)
      const txRes = await fetch('/api/bunq/transactions')
      const txData = await txRes.json()
      const recentTransactions = txData.success ? txData.data : []

      const res = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: null,
          participants: group.members.map(m => m.name),
          voiceInput: text,
          recentTransactions,
        }),
      })
      const data = await res.json()

      if (data.success && data.data?.length > 0) {
        const splits = data.data
        const total = splits.reduce((s: number, x: any) => s + x.amount, 0)
        const description: string = data.description ?? text

        const splitText = splits.map((s: any) => `• ${s.participant.name}: €${s.amount.toFixed(2)}`).join('\n')

        setPendingSplit({
          splits: splits.map((s: any) => {
            const member = group.members.find(m => m.name === s.participant.name)
            return {
              name: s.participant.name,
              alias: member?.alias ?? `${s.participant.name.toLowerCase()}@sandbox.com`,
              amount: s.amount,
            }
          }),
          description,
          total,
        })

        setMessages(prev => prev.slice(0, -1))
        addMessage('agent', `Ecco la divisione per "${description}":\n${splitText}\n\nTotale: €${total.toFixed(2)}\n\n✅ Confermi e invio le richieste di pagamento via Bunq?`)
      } else {
        setMessages(prev => prev.slice(0, -1))
        addMessage('agent', 'Non ho capito bene. Prova con: "Dividi €60 per la cena tra Giorgio e Diego" oppure allega una foto dello scontrino.')
      }
    } catch {
      setMessages(prev => prev.slice(0, -1))
      addMessage('agent', 'Qualcosa è andato storto. Riprova.')
    }
    setIsProcessing(false)
  }

  const confirmSplit = async () => {
    if (!pendingSplit) return
    setIsSending(true)
    try {
      const members = pendingSplit.splits.filter(s => s.name !== 'Francesco')
      const res = await fetch('/api/bunq/split-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: pendingSplit.description,
          totalAmount: pendingSplit.total,
          members,
        }),
      })
      const data = await res.json()
      if (data.success) {
        addMessage('agent', `✅ Fatto! Ho inviato le richieste di pagamento a ${members.map(m => m.name).join(', ')} via Bunq.\n\nRiceveranno una notifica per accettare.${data.batchId ? `\n\n🔖 Batch ID: ${data.batchId}` : ''}`)
        if (onExpenseAdded) {
          onExpenseAdded({
            batchId: data.batchId ?? 0,
            description: pendingSplit.description,
            total: pendingSplit.total,
            date: new Date().toISOString().slice(0, 10),
            splits: members,
          })
        }
      } else {
        addMessage('agent', `⚠️ Errore nell'invio: ${data.error ?? 'unknown error'}`)
      }
    } catch {
      addMessage('agent', '⚠️ Errore di rete. Riprova.')
    }
    setPendingSplit(null)
    setIsSending(false)
  }

  const startVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Il riconoscimento vocale richiede Chrome'); return }
    const r = new SR()
    r.lang = 'it-IT'
    r.continuous = false
    r.interimResults = false
    r.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      addMessage('user', `🎤 "${transcript}"`)
      processText(transcript)
    }
    r.onerror = () => { setIsRecording(false); addMessage('agent', '⚠️ Non ho captato audio. Riprova.') }
    r.onend = () => setIsRecording(false)
    recognitionRef.current = r
    r.start()
    setIsRecording(true)
  }, [group])

  const stopVoice = () => { recognitionRef.current?.stop(); setIsRecording(false) }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    addMessage('user', `📷 Foto scontrino: ${file.name}`)
    addMessage('agent', '⏳ Sto leggendo lo scontrino con Claude Vision...')
    setIsProcessing(true)

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
          const { items, total } = data.data
          const itemList = items.map((i: any) => `• ${i.name}: €${i.price.toFixed(2)}`).join('\n')
          setMessages(prev => prev.slice(0, -1))
          addMessage('agent', `Scontrino letto!\n${itemList}\n\n**Totale: €${total.toFixed(2)}**\n\nCon chi devo dividere? (es. "dividi tra Giorgio e Diego")`)
        }
      } catch {
        setMessages(prev => prev.slice(0, -1))
        addMessage('agent', 'Non riesco a leggere lo scontrino. Prova con una foto più nitida.')
      }
      setIsProcessing(false)
    }
    reader.readAsDataURL(file)
    // Reset input so the same file can be re-uploaded
    e.target.value = ''
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] ml-64 bg-background">
      {/* Header — senza pulsante Add Expense, tutto passa dalla chat */}
      <div className="p-6 border-b border-zinc-800 bg-background/50 backdrop-blur-xl sticky top-0 z-10 flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition-all">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl bg-white/5 border border-zinc-800">
            {group.emoji}
          </div>
          <div>
            <h2 className="font-bold text-lg">{group.name}</h2>
            <p className="text-[10px] text-bunq font-bold uppercase tracking-widest">{group.memberCount} Membri</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-[10px] ${
                msg.sender === 'agent' ? 'bg-bunq text-black' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {msg.sender === 'agent' ? 'AI' : 'IO'}
              </div>
              <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                msg.sender === 'user'
                  ? 'bg-bunq/10 border border-bunq/20 text-white'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
              }`}>
                {msg.text}
                <p className="text-[8px] mt-2 opacity-30 font-bold uppercase">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Confirm button — appare sotto l'ultimo messaggio AI quando c'è un pending split */}
        {pendingSplit && !isProcessing && (
          <div className="flex justify-start pl-11">
            <button
              onClick={confirmSplit}
              disabled={isSending}
              className="flex items-center gap-2 bg-bunq text-black font-bold text-sm px-6 py-3 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-bunq/20 disabled:opacity-50"
            >
              <CheckCircle2 size={18} />
              {isSending ? 'Invio in corso...' : 'Conferma e invia via Bunq'}
            </button>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="p-6 pt-2">
        <div className="bg-card rounded-[28px] border border-zinc-800 p-2 pl-4 flex items-center gap-2 shadow-2xl">
          <button onClick={() => fileRef.current?.click()} className="p-3 text-zinc-500 hover:text-white transition-colors" title="Allega foto scontrino">
            <Camera size={20} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          <input
            type="text"
            placeholder="Descrivi la spesa o parla col microfono..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            disabled={isProcessing}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3 px-2 placeholder:text-zinc-600 disabled:opacity-40"
          />

          <div className="flex items-center gap-1">
            <button
              onClick={isRecording ? stopVoice : startVoice}
              disabled={isProcessing}
              className={`p-3 rounded-2xl transition-all ${
                isRecording ? 'bg-rose-500 text-white animate-pulse' : 'text-zinc-500 hover:text-bunq hover:bg-white/5'
              }`}
              title={isRecording ? 'Stop registrazione' : 'Registra messaggio vocale'}
            >
              <Mic size={20} />
            </button>
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isProcessing}
              className="w-12 h-12 bg-bunq text-black rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-bunq/20 disabled:opacity-40"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-zinc-600 mt-3 font-bold uppercase tracking-widest">
          🎤 Parla in italiano · 📷 Allega scontrino · ✍️ Scrivi
        </p>
      </div>
    </div>
  )
}
