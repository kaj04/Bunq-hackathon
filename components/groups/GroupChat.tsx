'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Mic, Camera, Send, CheckCircle2 } from 'lucide-react'
import { Group, GroupExpense, ChatMessage } from '@/types/designer'

interface GroupChatProps {
  group: Group
  onBack: () => void
  onExpenseAdded?: (expense: GroupExpense) => void
}

type PendingSplit = {
  splits: { name: string; alias: string; amount: number }[]
  description: string
  total: number
}

const STORAGE_KEY = (groupId: string) => `meditasplit_chat_${groupId}`

const WELCOME_MESSAGE = (groupName: string): ChatMessage => ({
  id: 'welcome',
  sender: 'agent',
  text: `Hey! I'm here to help you split expenses in ${groupName}.\n\nYou can say things like:\n• "Split last night's dinner between Giorgio and Diego"\n• "We spent €80 at the restaurant, split between everyone"\n• Or attach a photo of the receipt 📷`,
  timestamp: new Date().toISOString(),
})

export const GroupChat: React.FC<GroupChatProps> = ({ group, onBack, onExpenseAdded }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(group.id))
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return [WELCOME_MESSAGE(group.name)]
  })
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

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY(group.id), JSON.stringify(messages)) } catch { /* ignore */ }
  }, [messages, group.id])

  // Builds a compact text summary of past AI messages for LLM context
  const buildChatContext = (): string | undefined => {
    const agentMessages = messages
      .filter(m => m.sender === 'agent' && m.id !== 'welcome' && !m.text.startsWith('⏳'))
      .slice(-10) // last 10 AI messages
    if (!agentMessages.length) return undefined
    return agentMessages
      .map(m => `[${m.timestamp.slice(0, 10)}] ${m.text.slice(0, 300)}`)
      .join('\n---\n')
  }

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
    addMessage('agent', '⏳ Analysing your request...')
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
          chatHistory: buildChatContext(),
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
        addMessage('agent', `Here's the split for "${description}":\n${splitText}\n\nTotal: €${total.toFixed(2)}\n\n✅ Confirm and I'll send the payment requests via Bunq.`)
      } else {
        setMessages(prev => prev.slice(0, -1))
        addMessage('agent', 'I didn\'t quite get that. Try: "Split €60 for dinner between Giorgio and Diego" or attach a photo of the receipt.')
      }
    } catch {
      setMessages(prev => prev.slice(0, -1))
      addMessage('agent', 'Something went wrong. Please try again.')
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
        addMessage('agent', `✅ Done! Payment requests sent to ${members.map(m => m.name).join(', ')} via Bunq.\n\nThey'll receive a notification to accept.${data.batchId ? `\n\n🔖 Batch ID: ${data.batchId}` : ''}`)
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
        addMessage('agent', `⚠️ Failed to send: ${data.error ?? 'unknown error'}`)
      }
    } catch {
      addMessage('agent', '⚠️ Network error. Please try again.')
    }
    setPendingSplit(null)
    setIsSending(false)
  }

  const startVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Voice recognition requires Chrome'); return }
    const r = new SR()
    r.lang = 'en-US'
    r.continuous = false
    r.interimResults = false
    r.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      addMessage('user', `🎤 "${transcript}"`)
      processText(transcript)
    }
    r.onerror = () => { setIsRecording(false); addMessage('agent', '⚠️ No audio detected. Please try again.') }
    r.onend = () => setIsRecording(false)
    recognitionRef.current = r
    r.start()
    setIsRecording(true)
  }, [group])

  const stopVoice = () => { recognitionRef.current?.stop(); setIsRecording(false) }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    addMessage('user', `📷 Receipt photo: ${file.name}`)
    addMessage('agent', '⏳ Reading receipt with Claude Vision...')
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
          addMessage('agent', `Receipt scanned!\n${itemList}\n\n**Total: €${total.toFixed(2)}**\n\nWho should I split this between? (e.g. "split between Giorgio and Diego")`)
        }
      } catch {
        setMessages(prev => prev.slice(0, -1))
        addMessage('agent', 'Could not read the receipt. Try a clearer photo.')
      }
      setIsProcessing(false)
    }
    reader.readAsDataURL(file)
    // Reset input so the same file can be re-uploaded
    e.target.value = ''
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] ml-64 bg-background">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800 bg-background/50 backdrop-blur-xl sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition-all">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl bg-white/5 border border-zinc-800">
              {group.emoji}
            </div>
            <div>
              <h2 className="font-bold text-lg">{group.name}</h2>
              <p className="text-[10px] text-bunq font-bold uppercase tracking-widest">{group.memberCount} Members</p>
            </div>
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
              {isSending ? 'Sending...' : 'Confirm & send via Bunq'}
            </button>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-6 pt-2 space-y-3">

        {/* Mic button — prominent, standalone, bunq-branded */}
        <div className="flex justify-center">
          <button
            onClick={isRecording ? stopVoice : startVoice}
            disabled={isProcessing}
            title={isRecording ? 'Stop recording' : 'Tap to speak'}
            className={`relative flex flex-col items-center gap-2 group disabled:opacity-40 transition-all`}
          >
            {/* outer glow ring when recording */}
            {isRecording && (
              <span className="absolute inset-0 rounded-full animate-ping bg-bunq/30 scale-150" />
            )}
            <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-all overflow-hidden relative
              ${isRecording ? 'scale-110 shadow-rose-500/40' : 'hover:scale-110 active:scale-95 shadow-bunq/30'}`}
            >
              {/* stripes background */}
              {!isRecording && (
                <div className="absolute inset-0 flex">
                  {['#e63946','#f4722b','#f9c74f','#90be6d','#43aa8b','#277da1','#6a0572','#c77dff'].map((c, i) => (
                    <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
              {isRecording && <div className="absolute inset-0 bg-rose-500" />}
              <Mic size={26} className="text-white relative z-10 drop-shadow-md" />
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${
              isRecording ? 'text-rose-400' : 'text-bunq'
            }`}>
              {isRecording ? '● Recording...' : 'Speak'}
            </span>
          </button>
        </div>

        {/* Text + camera + send bar */}
        <div className="bg-card rounded-[28px] border border-zinc-800 p-2 pl-4 flex items-center gap-2 shadow-2xl">
          <button onClick={() => fileRef.current?.click()} className="p-3 text-zinc-500 hover:text-white transition-colors" title="Attach receipt photo">
            <Camera size={20} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

          <input
            type="text"
            placeholder="Or type the expense..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            disabled={isProcessing}
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-3 px-2 placeholder:text-zinc-600 disabled:opacity-40"
          />

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isProcessing}
            className="w-12 h-12 bg-bunq text-black rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-lg shadow-bunq/20 disabled:opacity-40"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  )
}
