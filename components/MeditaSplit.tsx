'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Receipt, SplitProposal, AgentResponse } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'home' | 'groups' | 'group' | 'requests'

type Expense = {
  id: string; description: string; amount: number
  paidBy: string; category: string; date: string; imageUrl?: string
  splits?: { name: string; amount: number }[]
}

type Group = {
  id: string; name: string; emoji: string; color: string
  members: { name: string; alias: string }[]
  expenses: Expense[]
}

type Transaction = {
  id: number; amount: string; description: string
  type: 'in' | 'out'; counterparty: string; date: string; group?: string
}

type IncomingRequest = {
  id: number; amount: string; description: string; from: string; date: string
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const INITIAL_GROUPS: Group[] = [
  {
    id: 'rome', name: 'Rome Trip', emoji: '✈️', color: '#7c3aed',
    members: [
      { name: 'Giorgio',  alias: 'giorgio@sandbox.com' },
      { name: 'Vaggelis', alias: 'vaggelis@sandbox.com' },
      { name: 'Diego',    alias: 'diego@sandbox.com' },
    ],
    expenses: [
      { id: 'e1', description: 'Cena da Mario', amount: 85.50, paidBy: 'Francesco', category: 'Restaurant', date: '2026-04-24' },
      { id: 'e2', description: 'Aperitivo bar', amount: 48.00, paidBy: 'Giorgio',   category: 'Bar',        date: '2026-04-24' },
      { id: 'e3', description: 'Taxi aeroporto', amount: 52.00, paidBy: 'Vaggelis', category: 'Transport',  date: '2026-04-23' },
    ],
  },
  {
    id: 'hack', name: 'Hackathon', emoji: '💻', color: '#00a86b',
    members: [
      { name: 'Giorgio',  alias: 'giorgio@sandbox.com' },
      { name: 'Vaggelis', alias: 'vaggelis@sandbox.com' },
      { name: 'Diego',    alias: 'diego@sandbox.com' },
    ],
    expenses: [
      { id: 'e4', description: 'Pranzo team',   amount: 60.00, paidBy: 'Francesco', category: 'Restaurant', date: '2026-04-24' },
      { id: 'e5', description: 'Caffè e snacks', amount: 28.50, paidBy: 'Diego',    category: 'Bar',        date: '2026-04-24' },
    ],
  },
]

const CATEGORIES: Record<string, { emoji: string; color: string }> = {
  Restaurant: { emoji: '🍕', color: '#f59e0b' },
  Bar:        { emoji: '🍺', color: '#8b5cf6' },
  Transport:  { emoji: '🚕', color: '#3b82f6' },
  Food:       { emoji: '🛒', color: '#10b981' },
  Hotel:      { emoji: '🏨', color: '#f43f5e' },
  Other:      { emoji: '📌', color: '#6b7280' },
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MeditaSplit() {
  const [screen, setScreen] = useState<Screen>('home')
  const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS)
  const [activeGroup, setActiveGroup] = useState<Group | null>(null)
  const [balance, setBalance] = useState('1,500.00')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [accepting, setAccepting] = useState<Record<number, string>>({})
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog(l => [`${new Date().toLocaleTimeString()} — ${msg}`, ...l.slice(0, 19)])

  // Load live data
  useEffect(() => {
    fetch('/api/bunq/balance').then(r => r.json()).then(d => {
      if (d.success && d.data?.[0]?.balance) setBalance(parseFloat(d.data[0].balance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
    })
    fetch('/api/bunq/transactions').then(r => r.json()).then(d => {
      if (d.success) setTransactions(d.data)
    })
    fetch('/api/bunq/requests').then(r => r.json()).then(d => {
      if (d.success) setIncomingRequests(d.data)
    })
  }, [])

  const refreshData = useCallback(async () => {
    const [b, t, r] = await Promise.all([
      fetch('/api/bunq/balance').then(r => r.json()),
      fetch('/api/bunq/transactions').then(r => r.json()),
      fetch('/api/bunq/requests').then(r => r.json()),
    ])
    if (b.success && b.data?.[0]?.balance) setBalance(parseFloat(b.data[0].balance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
    if (t.success) setTransactions(t.data)
    if (r.success) setIncomingRequests(r.data)
  }, [])

  const acceptRequest = async (reqId: number, amount: string, desc: string) => {
    setAccepting(a => ({ ...a, [reqId]: 'paying…' }))
    addLog(`Paying request #${reqId}: €${amount} — ${desc}`)
    const res = await fetch('/api/bunq/requests/accept', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestResponseId: reqId }),
    })
    const data = await res.json()
    if (data.success) {
      setAccepting(a => ({ ...a, [reqId]: '✓' }))
      addLog(`✓ Payment accepted — €${amount} deducted from card`)
      setTimeout(() => {
        setIncomingRequests(r => r.filter(x => x.id !== reqId))
        refreshData()
      }, 1200)
    } else {
      setAccepting(a => ({ ...a, [reqId]: '✗' }))
      addLog(`✗ Payment failed: ${data.error}`)
    }
  }

  const openGroup = (g: Group) => { setActiveGroup(g); setScreen('group') }

  const addExpenseToGroup = (expense: Expense) => {
    if (!activeGroup) return
    setGroups(gs => gs.map(g => g.id === activeGroup.id ? { ...g, expenses: [expense, ...g.expenses] } : g))
    setActiveGroup(g => g ? { ...g, expenses: [expense, ...g.expenses] } : g)
  }

  const addGroup = (name: string, emoji: string, color: string) => {
    const newGroup: Group = {
      id: Date.now().toString(), name, emoji, color,
      members: [
        { name: 'Giorgio', alias: 'giorgio@sandbox.com' },
        { name: 'Vaggelis', alias: 'vaggelis@sandbox.com' },
        { name: 'Diego', alias: 'diego@sandbox.com' },
      ],
      expenses: [],
    }
    setGroups(g => [newGroup, ...g])
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      {/* Phone shell */}
      <div className="relative w-full max-w-[390px] h-[844px] bg-[#0d0d0d] overflow-hidden rounded-[40px] shadow-2xl border border-white/10 flex flex-col">

        {/* Status bar */}
        <div className="flex justify-between items-center px-8 pt-4 pb-2 text-white text-xs font-medium shrink-0">
          <span>9:41</span>
          <div className="flex gap-1 items-center">
            <span>●●●</span><span>WiFi</span><span>🔋</span>
          </div>
        </div>

        {/* Screen content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {screen === 'home' && (
            <HomeScreen balance={balance} transactions={transactions} requests={incomingRequests} accepting={accepting} onAccept={acceptRequest} log={log} />
          )}
          {screen === 'groups' && (
            <GroupsScreen groups={groups} onOpen={openGroup} onAddGroup={addGroup} showNew={showNewGroup} setShowNew={setShowNewGroup} />
          )}
          {screen === 'group' && activeGroup && (
            <GroupScreen group={activeGroup} onBack={() => setScreen('groups')} onAddExpense={addExpenseToGroup} addLog={addLog} refreshData={refreshData} />
          )}
          {screen === 'requests' && (
            <RequestsScreen requests={incomingRequests} accepting={accepting} onAccept={acceptRequest} />
          )}
        </div>

        {/* Bottom nav */}
        <BottomNav screen={screen} setScreen={setScreen} requestCount={incomingRequests.length} />
      </div>
    </div>
  )
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

function HomeScreen({ balance, transactions, requests, accepting, onAccept, log }: {
  balance: string
  transactions: Transaction[]
  requests: IncomingRequest[]
  accepting: Record<number, string>
  onAccept: (id: number, amount: string, desc: string) => void
  log: string[]
}) {
  return (
    <div className="px-5 pb-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 pt-2">
        <div>
          <p className="text-gray-400 text-sm">Good evening,</p>
          <h1 className="text-white text-2xl font-bold">Francesco</h1>
        </div>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold">F</div>
      </div>

      {/* Card */}
      <div className="relative rounded-3xl p-6 mb-6 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)' }}>
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #a78bfa, transparent)', transform: 'translate(30%, -30%)' }} />
        <p className="text-purple-300 text-xs font-semibold tracking-widest mb-1">MY CARD</p>
        <p className="text-white text-4xl font-bold mb-4">€{balance}</p>
        <div className="flex justify-between items-end">
          <p className="text-purple-300 text-sm font-mono tracking-widest">···· ···· ···· 1234</p>
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-red-500 border-2 border-[#312e81]" />
            <div className="w-8 h-8 rounded-full bg-yellow-400 border-2 border-[#312e81] opacity-80" />
          </div>
        </div>
      </div>

      {/* Pending requests */}
      {requests.length > 0 && (
        <div className="mb-5">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Pending requests</p>
          <div className="space-y-2">
            {requests.map(r => (
              <div key={r.id} className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between border border-red-500/20">
                <div>
                  <p className="text-white text-sm font-medium">{r.description}</p>
                  <p className="text-gray-400 text-xs">from {r.from}</p>
                  <p className="text-red-400 font-bold mt-0.5">-€{r.amount}</p>
                </div>
                <button
                  onClick={() => onAccept(r.id, r.amount, r.description)}
                  disabled={!!accepting[r.id]}
                  className="bg-[#00a86b] text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 transition"
                >
                  {accepting[r.id] ?? 'Pay'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transactions */}
      <div className="mb-5">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Transactions</p>
        {transactions.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t, i) => (
              <div key={t.id ?? i} className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${t.type === 'in' ? 'bg-green-900/50' : 'bg-red-900/30'}`}>
                    {t.type === 'in' ? '↙' : '↗'}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{t.description}</p>
                    <p className="text-gray-500 text-xs">{t.counterparty} · {t.date?.slice(0, 10)}</p>
                  </div>
                </div>
                <p className={`font-bold ${t.type === 'in' ? 'text-[#00a86b]' : 'text-red-400'}`}>
                  {t.type === 'in' ? '+' : '-'}€{Math.abs(parseFloat(t.amount ?? '0')).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dev log */}
      {log.length > 0 && (
        <div className="mb-4">
          <p className="text-gray-600 text-xs font-semibold uppercase tracking-wider mb-2">Dev log</p>
          <div className="bg-black rounded-2xl p-3 font-mono text-xs space-y-1 max-h-32 overflow-y-auto">
            {log.map((l, i) => <p key={i} className="text-green-400">{l}</p>)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Groups Screen ────────────────────────────────────────────────────────────

function GroupsScreen({ groups, onOpen, onAddGroup, showNew, setShowNew }: {
  groups: Group[]
  onOpen: (g: Group) => void
  onAddGroup: (name: string, emoji: string, color: string) => void
  showNew: boolean
  setShowNew: (v: boolean) => void
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✈️')
  const EMOJIS = ['✈️','💻','🏖️','🎉','🍕','🏕️','🎸','⚽']
  const COLORS = ['#7c3aed','#00a86b','#f59e0b','#3b82f6','#ec4899','#f43f5e']
  const [color, setColor] = useState(COLORS[0])

  const submit = () => {
    if (!name.trim()) return
    onAddGroup(name.trim(), emoji, color)
    setName(''); setShowNew(false)
  }

  return (
    <div className="px-5 pb-4">
      <div className="flex justify-between items-center mb-6 pt-2">
        <h1 className="text-white text-2xl font-bold">Groups</h1>
        <button onClick={() => setShowNew(!showNew)} className="bg-[#00a86b] text-white w-9 h-9 rounded-full flex items-center justify-center text-xl font-bold">+</button>
      </div>

      {showNew && (
        <div className="bg-[#1a1a1a] rounded-3xl p-5 mb-5 border border-white/10">
          <p className="text-white font-semibold mb-4">New Group</p>
          <div className="flex gap-2 mb-3 flex-wrap">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => setEmoji(e)} className={`text-2xl p-2 rounded-xl ${emoji === e ? 'bg-white/20' : ''}`}>{e}</button>
            ))}
          </div>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Group name..."
            className="w-full bg-[#0d0d0d] text-white rounded-xl px-4 py-3 text-sm mb-3 outline-none border border-white/10" />
          <div className="flex gap-2 mb-4">
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                style={{ background: c }} />
            ))}
          </div>
          <button onClick={submit} className="w-full bg-[#00a86b] text-white py-3 rounded-xl font-semibold text-sm">Create Group</button>
        </div>
      )}

      <div className="space-y-3">
        {groups.map(g => {
          const total = g.expenses.reduce((s, e) => s + e.amount, 0)
          const perPerson = total / (g.members.length + 1)
          return (
            <button key={g.id} onClick={() => onOpen(g)} className="w-full bg-[#1a1a1a] rounded-3xl p-5 flex items-center justify-between text-left hover:bg-[#222] transition">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: g.color + '30' }}>
                  {g.emoji}
                </div>
                <div>
                  <p className="text-white font-semibold text-base">{g.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{g.members.length + 1} members · {g.expenses.length} expenses</p>
                  <p className="text-gray-500 text-xs">~€{perPerson.toFixed(2)} each</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-bold text-lg">€{total.toFixed(0)}</p>
                <p className="text-gray-500 text-xs">total</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Group Detail Screen ──────────────────────────────────────────────────────

function GroupScreen({ group, onBack, onAddExpense, addLog, refreshData }: {
  group: Group
  onBack: () => void
  onAddExpense: (e: Expense) => void
  addLog: (msg: string) => void
  refreshData: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const total = group.expenses.reduce((s, e) => s + e.amount, 0)

  // Totals per category
  const byCategory = group.expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount
    return acc
  }, {})

  // Calculate balances: map name -> current +/- balance relative to the group
  // Positive mean they are owed money, negative means they owe money.
  const balances = group.expenses.reduce<Record<string, number>>((acc, e) => {
    const payer = e.paidBy === 'Me' ? 'Francesco' : e.paidBy
    acc[payer] = (acc[payer] || 0) + e.amount
    
    const splitArr = e.splits || [
      { name: 'Francesco', amount: e.amount / (group.members.length + 1) },
      ...group.members.map(m => ({ name: m.name, amount: e.amount / (group.members.length + 1) }))
    ]
    
    splitArr.forEach(s => {
      acc[s.name] = (acc[s.name] || 0) - s.amount
    })
    
    return acc
  }, {})

  const yourBalance = balances['Francesco'] || 0

  return (
    <div className="pb-4">
      {/* Header with color */}
      <div className="px-5 pt-4 pb-6 mb-4" style={{ background: `linear-gradient(180deg, ${group.color}40 0%, transparent 100%)` }}>
        <button onClick={onBack} className="text-gray-400 text-sm mb-3 flex items-center gap-1">← Back</button>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">{group.emoji}</span>
          <div>
            <h1 className="text-white text-2xl font-bold">{group.name}</h1>
            <p className="text-gray-400 text-sm">{group.members.length + 1} members</p>
          </div>
        </div>

        {/* Member avatars */}
        <div className="flex -space-x-2 mb-4">
          {['F', ...group.members.map(m => m.name[0])].map((initial, i) => (
            <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0d0d0d] flex items-center justify-center text-xs font-bold text-white"
              style={{ background: ['#7c3aed','#00a86b','#f59e0b','#3b82f6','#ec4899'][i % 5] }}>
              {initial}
            </div>
          ))}
        </div>

        {/* Total + Add buttons */}
        <div className="flex gap-3">
          <div className="flex-1 bg-white/10 rounded-2xl p-4">
            <p className="text-gray-400 text-xs mb-1">Total spent</p>
            <p className="text-white text-2xl font-bold">€{total.toFixed(2)}</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-2xl p-4 border border-white/5 relative overflow-hidden">
             <div className={`absolute top-0 right-0 w-12 h-12 rounded-full opacity-10 ${yourBalance >= 0 ? 'bg-green-400' : 'bg-red-400'}`} style={{ transform: 'translate(40%, -40%)' }} />
            <p className="text-gray-400 text-xs mb-1">{yourBalance >= 0 ? 'Owed to you' : 'You owe'}</p>
            <p className={`text-2xl font-bold ${yourBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              €{Math.abs(yourBalance).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5">
        {/* Balances list */}
        <div className="mb-5">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Group balances</p>
          <div className="bg-[#1a1a1a] rounded-3xl p-4 divide-y divide-white/5">
            {['Francesco', ...group.members.map(m => m.name)].map(name => {
              const bal = balances[name] || 0
              if (Math.abs(bal) < 0.01) return null
              return (
                <div key={name} className="flex justify-between items-center py-3 first:pt-0 last:pb-0">
                  <span className="text-gray-300 text-sm">{name === 'Francesco' ? 'Me' : name}</span>
                  <span className={`text-sm font-bold ${bal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {bal >= 0 ? '+' : '-'}€{Math.abs(bal).toFixed(2)}
                  </span>
                </div>
              )
            }).filter(Boolean)}
            {Object.keys(balances).length === 0 && <p className="text-gray-500 text-xs text-center py-2">Everyone is settled</p>}
          </div>
        </div>

        {/* Category grid */}
        {Object.keys(byCategory).length > 0 && (
          <div className="mb-5">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">By category</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(byCategory).map(([cat, amt]) => {
                const c = CATEGORIES[cat] ?? CATEGORIES.Other
                return (
                  <div key={cat} className="rounded-2xl p-4" style={{ background: c.color + '20', border: `1px solid ${c.color}30` }}>
                    <p className="text-2xl mb-1">{c.emoji}</p>
                    <p className="text-gray-300 text-xs">{cat}</p>
                    <p className="text-white font-bold text-lg">€{amt.toFixed(2)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Add expense */}
        <button onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl py-4 mb-5 font-semibold text-white flex items-center justify-center gap-2 text-sm"
          style={{ background: group.color }}>
          + Add expense
        </button>

        {/* Expenses list */}
        <div>
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Expenses</p>
          <div className="space-y-2">
            {group.expenses.map(e => {
              const c = CATEGORIES[e.category] ?? CATEGORIES.Other
              return (
                <div key={e.id} className="bg-[#1a1a1a] rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: c.color + '25' }}>
                      {c.emoji}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{e.description}</p>
                      <p className="text-gray-500 text-xs">Paid by {e.paidBy} · {e.date?.slice(5)}</p>
                    </div>
                  </div>
                  <p className="text-white font-bold">€{e.amount.toFixed(2)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Add expense modal */}
      {showAdd && (
        <AddExpenseModal
          group={group}
          onClose={() => setShowAdd(false)}
          onAdd={(expense) => { onAddExpense(expense); setShowAdd(false) }}
          addLog={addLog}
          refreshData={refreshData}
        />
      )}
    </div>
  )
}

// ─── Add Expense Modal ────────────────────────────────────────────────────────

function AddExpenseModal({ group, onClose, onAdd, addLog, refreshData }: {
  group: Group
  onClose: () => void
  onAdd: (e: Expense) => void
  addLog: (msg: string) => void
  refreshData: () => void
}) {
  type Step = 'input' | 'scanning' | 'scanned' | 'reasoning' | 'proposal' | 'done'
  const [step, setStep] = useState<Step>('input')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState('Restaurant')
  const [transcript, setTranscript] = useState('')
  const [agentHistory, setAgentHistory] = useState<any[]>([])
  const [agentQuestion, setAgentQuestion] = useState('')
  const [proposal, setProposal] = useState<SplitProposal | null>(null)
  const [sending, setSending] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Use Chrome for voice input'); return }
    const r = new SR()
    r.lang = 'it-IT'; r.continuous = false; r.interimResults = true
    r.onresult = (e: any) => setTranscript(Array.from(e.results).map((x: any) => x[0].transcript).join(''))
    r.onend = () => setListening(false)
    recognitionRef.current = r; r.start(); setListening(true)
  }
  const stopVoice = () => { recognitionRef.current?.stop(); setListening(false) }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setImagePreview(dataUrl)
      setStep('scanning')
      addLog('Scanning receipt with Claude Vision…')
      try {
        const res = await fetch('/api/receipt', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl.split(',')[1], mediaType: file.type }),
        })
        const data = await res.json()
        if (data.success) {
          setReceipt(data.data)
          addLog(`✓ Receipt: €${data.data.total} — ${data.data.items.length} items`)
          setStep('scanned')
        } else {
          addLog(`✗ Scan failed: ${data.error}`)
          setStep('input')
        }
      } catch (err) {
        addLog(`✗ Scan error: ${err}`)
        setStep('input')
      }
    }
    reader.readAsDataURL(file)
  }

  const callAgent = async (userMessage: string, history?: any[]) => {
    setStep('reasoning')
    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: userMessage, history }),
      })
      const data: AgentResponse = await res.json()
      if (data.state === 'proposal') {
        setProposal(data.proposal)
        setStep('proposal')
      } else if (data.state === 'needs_input') {
        setAgentQuestion(data.question)
        setAgentHistory(data.history)
        setTranscript('')
        setStep('scanned')
      } else {
        addLog(`✗ Agent: ${(data as any).error}`)
        setStep('scanned')
      }
    } catch (err) {
      addLog(`✗ Error: ${err}`)
      setStep('scanned')
    }
  }

  const handleSplit = () => {
    if (!receipt || !transcript.trim()) return
    addLog('Asking AI to compute split…')
    const itemList = receipt.items
      .map(i => `- ${i.name} ×${i.quantity} €${(i.price * i.quantity).toFixed(2)}`)
      .join('\n')
    const msg = `[RICEVUTA]\nArticoli:\n${itemList}\nTotale: €${receipt.total.toFixed(2)}\n\n${transcript}`
    callAgent(msg)
  }

  const handleFollowUp = () => {
    if (!transcript.trim()) return
    callAgent(transcript, agentHistory)
  }

  const sendRequests = async () => {
    if (!proposal) return
    setSending(true)
    addLog(`Sending ${proposal.splits.length} payment requests via Bunq…`)
    const requests = proposal.splits.map(s => ({
      recipientAlias: s.participant.bunqAlias ?? `${s.participant.name.toLowerCase()}@sandbox.com`,
      amount: s.amount,
      currency: proposal.currency,
      description: desc || proposal.paymentDescription,
    }))
    const res = await fetch('/api/bunq/request-batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    })
    const data = await res.json()
    if (data.success) {
      addLog(`✓ Sent to ${proposal.splits.length} people`)
      onAdd({
        id: Date.now().toString(),
        description: desc || proposal.paymentDescription,
        amount: proposal.total,
        paidBy: 'Me',
        category,
        date: new Date().toISOString().slice(0, 10),
        imageUrl: imagePreview ?? undefined,
        splits: proposal.splits.map(s => ({ name: s.participant.name, amount: s.amount })),
      })
      setStep('done')
      await refreshData()
    } else {
      addLog(`✗ Error: ${data.error}`)
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
      <div className="bg-[#1a1a1a] w-full rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white text-xl font-bold">Add Expense</h2>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>

        {/* Step: input — photo upload */}
        {step === 'input' && (
          <div className="space-y-4">
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Title (e.g. Dinner in Roma)"
              className="w-full bg-[#0d0d0d] text-white rounded-2xl px-5 py-4 text-sm outline-none border border-white/10 focus:border-[#7c3aed] transition" />

            <div onClick={() => fileRef.current?.click()}
              className="h-36 rounded-3xl border-2 border-dashed border-gray-700 hover:border-purple-600 flex flex-col items-center justify-center cursor-pointer transition gap-2">
              <p className="text-4xl">📷</p>
              <p className="text-gray-300 text-sm font-medium">Upload Receipt</p>
              <p className="text-gray-600 text-xs">Claude Vision will read the items</p>
            </div>

            <div className="flex gap-2">
              {Object.keys(CATEGORIES).map(c => (
                <button key={c} onClick={() => setCategory(c)} title={c}
                  className={`flex-1 rounded-xl py-3 text-center text-xl transition ${category === c ? 'bg-white/15 ring-1 ring-white/30' : 'bg-[#0d0d0d]'}`}>
                  {CATEGORIES[c].emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: scanning */}
        {step === 'scanning' && (
          <div className="flex flex-col items-center py-10 gap-4">
            {imagePreview && <img src={imagePreview} className="w-36 h-36 object-cover rounded-2xl opacity-60" />}
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white font-medium">Analyzing receipt…</p>
            <p className="text-gray-500 text-sm">Claude Vision is reading the items</p>
          </div>
        )}

        {/* Step: scanned — show items JSON + ask how to split */}
        {step === 'scanned' && receipt && (
          <div className="space-y-4">
            <div className="bg-[#0d0d0d] rounded-2xl p-4 border border-green-900/40">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-green-400 text-sm font-bold">✓ Bill analyzed!</span>
                <span className="text-gray-500 text-xs">{receipt.items.length} items · {receipt.currency}</span>
              </div>
              {receipt.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm py-1">
                  <span className="text-gray-300">{item.name} ×{item.quantity}</span>
                  <span className="text-white font-medium">€{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-gray-800 mt-2 pt-2 flex justify-between font-bold">
                <span className="text-gray-400">Total</span>
                <span className="text-white">€{receipt.total.toFixed(2)}</span>
              </div>
            </div>

            {agentQuestion && (
              <div className="bg-[#0d0d0d] rounded-2xl px-4 py-3 border border-purple-900/40">
                <p className="text-purple-300 text-[10px] font-bold uppercase tracking-wider mb-1">AI</p>
                <p className="text-gray-300 text-sm">{agentQuestion}</p>
              </div>
            )}

            <div>
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {agentQuestion ? 'Your reply' : 'Come vuoi dividerlo?'}
              </p>
              <div className="relative">
                <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
                  placeholder="E.g. &quot;Ho preso la margherita e una coca, Filippo ha preso la boscaiola e l'acqua&quot;"
                  className="w-full bg-[#0d0d0d] text-white rounded-2xl px-4 py-3 pr-12 text-sm outline-none border border-white/10 focus:border-[#7c3aed] transition min-h-[90px]" />
                <button onClick={listening ? stopVoice : startVoice}
                  className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all ${listening ? 'bg-red-500 animate-pulse' : 'bg-white/5 hover:bg-white/10'}`}>
                  {listening ? '⏹' : '🎤'}
                </button>
              </div>
            </div>

            <button
              onClick={agentQuestion ? handleFollowUp : handleSplit}
              disabled={!transcript.trim()}
              className="w-full bg-[#7c3aed] text-white py-4 rounded-2xl font-bold text-sm shadow-lg shadow-purple-500/30 disabled:opacity-40 transition active:scale-[0.98]">
              Split ✨
            </button>
          </div>
        )}

        {/* Step: reasoning */}
        {step === 'reasoning' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-white font-medium">Computing split…</p>
            <p className="text-gray-500 text-sm">Matching contacts and calculating amounts</p>
          </div>
        )}

        {/* Step: proposal */}
        {step === 'proposal' && proposal && (
          <div className="space-y-4">
            <div className="bg-[#0d0d0d] rounded-2xl p-4 border border-green-900/40">
              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2">Split proposal</p>
              <p className="text-white font-medium text-sm mb-3">{proposal.paymentDescription} · €{proposal.total.toFixed(2)}</p>
              {proposal.splits.map((s, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-t border-gray-800 first:border-0">
                  <div>
                    <span className="text-gray-200 text-sm font-medium">{s.participant.name}</span>
                    <span className="text-gray-600 text-xs ml-2">{s.participant.bunqAlias}</span>
                  </div>
                  <span className="text-green-400 font-bold">€{s.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Title (optional)"
              className="w-full bg-[#0d0d0d] text-white rounded-2xl px-4 py-3 text-sm outline-none border border-white/10" />

            <button onClick={sendRequests} disabled={sending}
              className="w-full bg-[#00a86b] text-white py-4 font-bold rounded-2xl shadow-xl shadow-green-500/20 active:scale-[0.98] transition">
              {sending ? 'Sending…' : `Confirm & Send ${proposal.splits.length} requests`}
            </button>
            <button onClick={() => setStep('scanned')} className="w-full text-gray-500 text-xs font-bold uppercase tracking-widest py-1">Edit</button>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div className="flex flex-col items-center py-12 gap-4">
            <p className="text-5xl">✅</p>
            <p className="text-white text-xl font-bold">All done!</p>
            <p className="text-gray-400 text-sm">Payment requests sent successfully</p>
            <button onClick={onClose} className="mt-4 bg-[#00a86b] text-white px-8 py-3 rounded-2xl font-semibold">Close</button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
      </div>
    </div>
  )
}

// ─── Requests Screen ──────────────────────────────────────────────────────────

function RequestsScreen({ requests, accepting, onAccept }: {
  requests: IncomingRequest[]
  accepting: Record<number, string>
  onAccept: (id: number, amount: string, desc: string) => void
}) {
  return (
    <div className="px-5 pb-4">
      <h1 className="text-white text-2xl font-bold mb-6 pt-2">Requests</h1>
      {requests.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">✅</p>
          <p className="text-white font-semibold">All clear!</p>
          <p className="text-gray-500 text-sm mt-1">No pending payment requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="bg-[#1a1a1a] rounded-3xl p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-white font-semibold">{r.description}</p>
                  <p className="text-gray-400 text-sm">from {r.from}</p>
                  <p className="text-gray-500 text-xs">{r.date?.slice(0, 10)}</p>
                </div>
                <p className="text-red-400 text-2xl font-bold">€{r.amount}</p>
              </div>
              <button onClick={() => onAccept(r.id, r.amount, r.description)}
                disabled={!!accepting[r.id]}
                className="w-full bg-[#00a86b] text-white py-3 rounded-xl font-semibold disabled:opacity-60">
                {accepting[r.id] ?? '✓ Accept & Pay'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

function BottomNav({ screen, setScreen, requestCount }: {
  screen: Screen
  setScreen: (s: Screen) => void
  requestCount: number
}) {
  const tabs = [
    { id: 'home' as Screen,     icon: '🏠', label: 'Home' },
    { id: 'groups' as Screen,   icon: '✈️',  label: 'Groups' },
    { id: 'requests' as Screen, icon: '💸', label: 'Pay', badge: requestCount },
  ]
  return (
    <div className="shrink-0 bg-[#111] border-t border-white/5 px-6 py-3 pb-6 flex justify-around items-center">
      {tabs.map(t => (
        <button key={t.id} onClick={() => setScreen(t.id)}
          className={`flex flex-col items-center gap-1 relative transition-all ${screen === t.id ? 'scale-110' : 'opacity-50'}`}>
          <span className="text-2xl">{t.icon}</span>
          <span className={`text-xs font-medium ${screen === t.id ? 'text-[#00a86b]' : 'text-gray-500'}`}>{t.label}</span>
          {t.badge && t.badge > 0 && (
            <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
