'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Mic, Camera, Send, CheckCircle2, Settings, X, UserPlus, Trash2 } from 'lucide-react'
import { Group, GroupExpense, ChatMessage, GroupMember, Widget } from '@/types/designer'
import type { HistoryEntry } from '@/lib/claude/prompts'

interface GroupChatProps {
  group: Group
  onBack: () => void
  onOpenAddExpense: () => void
  availableContacts?: GroupMember[]
  onUpdateGroup?: (updated: Group) => void
  onDeleteGroup?: () => void
  onExpenseAdded?: (expense: GroupExpense) => void
  currentUser?: string
  currentUserAlias?: string | null
}

type PendingSplit = {
  splits: { name: string; alias: string; amount: number }[]
  description: string
  total: number
}

const WELCOME = (groupName: string): ChatMessage => ({
  id: 'welcome',
  sender: 'agent',
  senderName: 'AI',
  text: `Hey! I'm here to help you split expenses in ${groupName}.\n\nYou can say things like:\n• "Split last night's dinner between Giorgio and Diego"\n• "We spent €80 at the restaurant, split between everyone"\n• Or attach a photo of the receipt 📷`,
  timestamp: new Date().toISOString(),
})

export const GroupChat: React.FC<GroupChatProps> = ({
  group, onBack, onOpenAddExpense,
  availableContacts = [], onUpdateGroup, onDeleteGroup,
  onExpenseAdded, currentUser, currentUserAlias,
}) => {
  const [showSettings, setShowSettings] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME(group.name)])
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`history_${group.id}`)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [pendingSplit, setPendingSplit] = useState<PendingSplit | null>(null)
  const [pendingReceipt, setPendingReceipt] = useState<{ items: any[]; total: number } | null>(null)
  const [isSending, setIsSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<any>(null)
  const msgIdRef = useRef(0)
  const knownIdsRef = useRef<Set<string>>(new Set(['welcome']))

  // Load chat from server on mount
  const fetchChat = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${group.id}/chat`)
      const data = await res.json()
      if (!data.success || !data.data.length) return
      const incoming: ChatMessage[] = data.data
      setMessages(prev => {
        const existingIds = new Set(prev.map((m: ChatMessage) => m.id))
        const newOnes = incoming.filter((m: ChatMessage) => !existingIds.has(m.id))
        return newOnes.length ? [...prev, ...newOnes] : prev
      })
      incoming.forEach((m: ChatMessage) => knownIdsRef.current.add(m.id))
    } catch { /* ignore */ }
  }, [group.id])

  useEffect(() => { fetchChat() }, [fetchChat])

  // Poll every 3s for real-time sync
  useEffect(() => {
    const interval = setInterval(fetchChat, 3000)
    return () => clearInterval(interval)
  }, [fetchChat])

  // Persist history to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem(`history_${group.id}`, JSON.stringify(history)) } catch {}
  }, [history, group.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const addMessage = (sender: 'user' | 'agent', text: string, persist = true, widgets?: Widget[]): ChatMessage => {
    const msg: ChatMessage = {
      id: String(++msgIdRef.current),
      sender,
      senderName: sender === 'user' ? currentUser : 'AI',
      text,
      timestamp: new Date().toISOString(),
      ...(widgets?.length ? { widgets } : {}),
    }
    setMessages(prev => [...prev, msg])
    knownIdsRef.current.add(msg.id)
    if (persist) {
      fetch(`/api/groups/${group.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(() => {})
    }
    return msg
  }

  const handleWidgetClick = (value: string) => {
    if (isProcessing) return
    addMessage('user', value)
    processText(value)
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
    addMessage('agent', '⏳ Thinking...', false)
    try {
      const res = await fetch('/api/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: group.members.map(m => ({ name: m.name, alias: m.alias })),
          voiceInput: text,
          speaker: currentUser,
          history,
          ...(pendingReceipt ? { receipt: pendingReceipt } : {}),
        }),
      })
      const data = await res.json()
      const widgets: Widget[] = Array.isArray(data.widgets) && data.widgets.length > 0 ? data.widgets : []

      if (data.success && data.data?.length > 0) {
        const splits = data.data
        const total = splits.reduce((s: number, x: any) => s + x.amount, 0)
        const description: string = data.description ?? text
        const splitText = splits.map((s: any) => `• ${s.participant.name}: €${s.amount.toFixed(2)}`).join('\n')

        setPendingSplit({
          splits: splits.map((s: any) => ({
            name: s.participant.name,
            alias: s.alias || group.members.find(m => m.name === s.participant.name)?.alias || `${s.participant.name.toLowerCase()}@sandbox.com`,
            amount: s.amount,
          })),
          description,
          total,
        })

        setMessages(prev => prev.slice(0, -1))
        addMessage('agent', `Here's the split for "${description}":\n${splitText}\n\nTotal: €${total.toFixed(2)}\n\n✅ Confirm to send payment requests via Bunq.`, true, widgets)
        setHistory(prev => [...prev, { userText: text, agentSummary: data.agentSummary ?? description }])
        setPendingReceipt(null)
      } else {
        setMessages(prev => prev.slice(0, -1))
        const responseText = data.error ?? (pendingReceipt
          ? 'Could not assign items. Try: "Francesco gets the burger, Diego gets the pasta"'
          : "I didn't quite get that. Try: \"Split €60 for dinner between Giorgio and Diego\" or attach a photo of the receipt.")
        addMessage('agent', responseText, true, widgets)
        setHistory(prev => [...prev, { userText: text, agentSummary: `${data.isQuestion ? 'Question' : 'Error'}: ${responseText}` }])
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
      // Exclude current user by alias (exact) or name (fallback)
      const recipients = pendingSplit.splits.filter(s => {
        if (currentUserAlias && s.alias === currentUserAlias) return false
        if (!currentUserAlias && s.name === currentUser) return false
        return true
      })
      const res = await fetch('/api/bunq/split-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: pendingSplit.description,
          totalAmount: pendingSplit.total,
          members: recipients,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const sentTo = recipients.map(m => m.name).join(', ')
        addMessage('agent', `✅ Done! Payment requests sent to ${sentTo} via Bunq.\n\nThey'll receive a notification to accept.${data.batchId ? `\n\n🔖 Batch ID: ${data.batchId}` : ''}`)
        setHistory(prev => [...prev, {
          userText: '(confirmed split)',
          agentSummary: `Sent Bunq requests for "${pendingSplit.description}" €${pendingSplit.total.toFixed(2)} → ${sentTo}. Batch ID: ${data.batchId ?? 'n/a'}`,
        }])
        if (onExpenseAdded) {
          onExpenseAdded({
            batchId: data.batchId ?? 0,
            description: pendingSplit.description,
            total: pendingSplit.total,
            date: new Date().toISOString().slice(0, 10),
            splits: recipients,
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
    addMessage('agent', '⏳ Reading receipt with Claude Vision...', false)
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
          setPendingReceipt({ items, total })
          const itemList = items.map((i: any) => `• ${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}: €${i.price.toFixed(2)}`).join('\n')
          const memberNames = group.members.map(m => m.name)
          const receiptWidgets: Widget[] = [
            { label: `✂️ Split equally among all (${memberNames.join(', ')})`, value: `Split the receipt equally among ${memberNames.join(', ')}` },
            { label: '📋 I\'ll describe who ordered what', value: 'Let me tell you who ordered what from this receipt' },
            ...(memberNames.length > 2
              ? [{ label: '👥 Split between some members', value: 'Who should split this receipt?' }]
              : [])
          ]
          setMessages(prev => prev.slice(0, -1))
          addMessage('agent', `Receipt scanned! 🧾\n\n${itemList}\n\nTotal: €${total.toFixed(2)}\n\nHow should I split this?`, true, receiptWidgets)
        }
      } catch {
        setMessages(prev => prev.slice(0, -1))
        addMessage('agent', 'Could not read the receipt. Try a clearer photo.')
      }
      setIsProcessing(false)
    }
    reader.readAsDataURL(file)
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
        <div className="flex items-center gap-2">
          <button onClick={onOpenAddExpense} className="btn-primary !py-2 !px-4 text-sm">
            + Add Expense
          </button>
          {onUpdateGroup && (
            <button
              onClick={() => { setShowSettings(true); setConfirmDelete(false) }}
              className="p-2 hover:bg-white/5 rounded-xl transition-all text-zinc-400 hover:text-white"
            >
              <Settings size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && onUpdateGroup && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)} />
          <div className="relative w-80 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-bold text-lg">Group Settings</h3>
              <button onClick={() => setShowSettings(false)} className="p-1.5 hover:bg-white/5 rounded-lg transition-all text-zinc-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Current members */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Members ({group.members.length})</p>
                <div className="space-y-2">
                  {group.members.map((m) => (
                    <div key={m.name} className="flex items-center justify-between bg-zinc-800/50 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                          {m.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{m.name}</p>
                          <p className="text-[10px] text-zinc-500 truncate max-w-[140px]">{m.alias}</p>
                        </div>
                      </div>
                      {group.members.length > 1 && (
                        <button
                          onClick={() => {
                            const updated = { ...group, members: group.members.filter(x => x.name !== m.name), memberCount: group.members.length - 1 }
                            onUpdateGroup(updated)
                          }}
                          className="p-1.5 hover:bg-rose-500/20 rounded-lg transition-all text-zinc-600 hover:text-rose-400"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add members */}
              {availableContacts.filter(c => !group.members.some(m => m.name === c.name)).length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Add Members</p>
                  <div className="space-y-2">
                    {availableContacts
                      .filter(c => !group.members.some(m => m.name === c.name))
                      .map((c) => (
                        <div key={c.name} className="flex items-center justify-between bg-zinc-800/30 border border-dashed border-zinc-700 rounded-2xl px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                              {c.name.charAt(0)}
                            </div>
                            <p className="text-sm font-semibold text-zinc-400">{c.name}</p>
                          </div>
                          <button
                            onClick={() => {
                              const updated = { ...group, members: [...group.members, c], memberCount: group.members.length + 1 }
                              onUpdateGroup(updated)
                            }}
                            className="p-1.5 hover:bg-bunq/20 rounded-lg transition-all text-zinc-600 hover:text-bunq"
                          >
                            <UserPlus size={14} />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* Delete group */}
              {onDeleteGroup && (
                <div className="pt-4 border-t border-zinc-800">
                  {!confirmDelete ? (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 transition-all text-sm font-semibold"
                    >
                      <Trash2 size={16} /> Delete Group
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-400 text-center">Delete this group and its chat history?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="flex-1 py-2.5 rounded-2xl border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-all text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { setShowSettings(false); onDeleteGroup() }}
                          className="flex-1 py-2.5 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-all text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => {
          const isAgent = msg.sender === 'agent'
          const isOwnMessage = msg.sender === 'user' && msg.senderName === currentUser
          return (
            <div key={msg.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-[10px] ${
                  isAgent ? 'bg-bunq text-black' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {isAgent ? 'AI' : (msg.senderName?.charAt(0) ?? '?')}
                </div>
                <div className="flex flex-col gap-2">
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    isOwnMessage
                      ? 'bg-bunq/10 border border-bunq/20 text-white'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                  }`}>
                    {!isAgent && !isOwnMessage && msg.senderName && (
                      <p className="text-[10px] font-bold text-bunq uppercase tracking-widest mb-1">{msg.senderName}</p>
                    )}
                    {msg.text}
                    <p className="text-[8px] mt-2 opacity-30 font-bold uppercase">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {/* Widget buttons — clickable choices from the agent */}
                  {isAgent && msg.widgets && msg.widgets.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {msg.widgets.map((w, i) => (
                        <button
                          key={i}
                          onClick={() => handleWidgetClick(w.value)}
                          disabled={isProcessing}
                          className="text-left px-4 py-2.5 rounded-2xl border border-bunq/30 bg-bunq/10 text-bunq text-xs font-semibold hover:bg-bunq/20 hover:border-bunq/50 active:scale-[0.98] transition-all disabled:opacity-40 shadow-sm"
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

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
        {pendingReceipt && (
          <div className="flex items-center justify-between bg-bunq/10 border border-bunq/30 rounded-2xl px-4 py-2.5">
            <span className="text-xs text-bunq font-semibold">🧾 Receipt loaded — tell me who gets what</span>
            <button onClick={() => setPendingReceipt(null)} className="text-zinc-500 hover:text-white transition-colors ml-3">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Mic button — standalone, bunq-branded */}
        <div className="flex justify-center">
          <button
            onClick={isRecording ? stopVoice : startVoice}
            disabled={isProcessing}
            title={isRecording ? 'Stop recording' : 'Tap to speak'}
            className="relative flex flex-col items-center gap-2 group disabled:opacity-40 transition-all"
          >
            {isRecording && (
              <span className="absolute inset-0 rounded-full animate-ping bg-bunq/30 scale-150" />
            )}
            <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-all overflow-hidden relative
              ${isRecording ? 'scale-110 shadow-rose-500/40' : 'hover:scale-110 active:scale-95 shadow-bunq/30'}`}
            >
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
