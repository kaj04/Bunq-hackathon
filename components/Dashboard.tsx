'use client'

import { useEffect, useState, useCallback } from 'react'
import BillSplitter from './BillSplitter'

type Transaction = {
  id: number; amount: string; currency: string
  description: string; type: 'in' | 'out'; counterparty: string; date: string
}

type Request = {
  id: number; amount: string; currency: string
  description: string; from: string; status: string; date: string
}

type Balance = { name: string; balance: string; currency: string }

export default function Dashboard() {
  const [balances, setBalances] = useState<Balance[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [accepting, setAccepting] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  // Split group form
  const [showSplit, setShowSplit] = useState(false)
  const [splitDesc, setSplitDesc] = useState('')
  const [splitTotal, setSplitTotal] = useState('')
  const [splitMembers, setSplitMembers] = useState('Giorgio, Vaggelis, Diego')
  const [splitting, setSplitting] = useState(false)
  const [splitMsg, setSplitMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [b, t, r] = await Promise.all([
      fetch('/api/bunq/balance').then(r => r.json()),
      fetch('/api/bunq/transactions').then(r => r.json()),
      fetch('/api/bunq/requests').then(r => r.json()),
    ])
    if (b.success) setBalances(b.data)
    if (t.success) setTransactions(t.data)
    if (r.success) setRequests(r.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const acceptRequest = async (reqId: number) => {
    setAccepting(a => ({ ...a, [reqId]: 'processing…' }))
    const res = await fetch('/api/bunq/requests/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestResponseId: reqId }),
    })
    const data = await res.json()
    setAccepting(a => ({ ...a, [reqId]: data.success ? '✓ Paid!' : '✗ Failed' }))
    if (data.success) setTimeout(load, 1500)
  }

  const doGroupSplit = async () => {
    if (!splitDesc || !splitTotal || !splitMembers) return
    setSplitting(true)
    setSplitMsg('')
    const names = splitMembers.split(',').map(n => n.trim()).filter(Boolean)
    const perPerson = parseFloat(splitTotal) / names.length
    const members = names.map(name => ({
      name,
      alias: `${name.toLowerCase()}@sandbox.com`,
      amount: Math.round(perPerson * 100) / 100,
    }))
    const res = await fetch('/api/bunq/split-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: splitDesc, totalAmount: parseFloat(splitTotal), members }),
    })
    const data = await res.json()
    setSplitMsg(data.success ? `✓ Richiesta inviata a ${names.length} persone (€${perPerson.toFixed(2)} ciascuno)` : `✗ ${data.error}`)
    setSplitting(false)
    if (data.success) { setSplitDesc(''); setSplitTotal(''); setShowSplit(false); setTimeout(load, 1000) }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#00a86b] to-[#004d31] px-6 py-5 text-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bunq Dashboard</h1>
          <p className="text-green-200 text-sm">Saldo, transazioni e richieste</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowSplit(!showSplit)}
            className="bg-white text-green-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-50 transition">
            + Split gruppo
          </button>
          <a href="/" className="bg-white/20 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/30 transition">
            ← App
          </a>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {loading && <p className="text-center text-gray-400 py-8">Caricamento…</p>}

        {/* ── Balance Cards ── */}
        {balances.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Saldo</h2>
            <div className="grid grid-cols-1 gap-3">
              {balances.map((b, i) => (
                <div key={i} className="bg-white rounded-2xl p-5 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{b.name ?? 'Account'}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      €{parseFloat(b.balance ?? '0').toFixed(2)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-2xl">💳</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Group Split Form ── */}
        {showSplit && (
          <div className="bg-white rounded-2xl shadow-sm p-5 border-2 border-green-200">
            <h2 className="font-bold text-gray-800 mb-4">Nuovo Split di Gruppo</h2>
            <div className="space-y-3">
              <input value={splitDesc} onChange={e => setSplitDesc(e.target.value)}
                placeholder="Descrizione (es. Cena Roma)"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none" />
              <input value={splitMembers} onChange={e => setSplitMembers(e.target.value)}
                placeholder="Membri (virgola separati)"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-green-500 focus:outline-none" />
              
              <div className="bg-gray-50 rounded-xl p-4 mt-2">
                <BillSplitter 
                  isEmbedded 
                  initialParticipants={splitMembers} 
                  onGroupSplit={async (cvSplits) => {
                    if (!splitDesc || !splitMembers) {
                      setSplitMsg('Inserisci la Descrizione e i Membri prima di confermare.')
                      return
                    }
                    setSplitting(true)
                    setSplitMsg('')
                    const totalAmount = cvSplits.reduce((acc, curr) => acc + curr.amount, 0)
                    const members = cvSplits.map(s => ({
                      name: s.participant.name,
                      alias: s.participant.bunqAlias ?? `${s.participant.name.toLowerCase()}@sandbox.com`,
                      amount: s.amount
                    }))

                    const res = await fetch('/api/bunq/split-group', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ description: splitDesc, totalAmount, members }),
                    })
                    const data = await res.json()
                    setSplitMsg(data.success ? `✓ Richieste di pagamento (Tot: €${totalAmount.toFixed(2)}) inviate a ${members.length} persone!` : `✗ ${data.error}`)
                    setSplitting(false)
                    if (data.success) { setTimeout(() => { setSplitDesc(''); setShowSplit(false); load(); }, 2000) }
                  }}
                />
              </div>
              {splitting && <p className="text-sm text-center text-gray-500 animate-pulse">Invio in corso al gruppo...</p>}
              {splitMsg && <p className="text-sm text-center font-medium text-green-700">{splitMsg}</p>}
            </div>
          </div>
        )}

        {/* ── Incoming Requests ── */}
        {requests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Richieste in arrivo ({requests.length})
            </h2>
            <div className="space-y-2">
              {requests.map(r => (
                <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{r.description}</p>
                    <p className="text-xs text-gray-400">da {r.from} · {r.date?.slice(0, 10)}</p>
                    <p className="text-xl font-bold text-red-500">€{r.amount}</p>
                  </div>
                  <button onClick={() => acceptRequest(r.id)}
                    disabled={!!accepting[r.id]}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition ${
                      accepting[r.id]
                        ? accepting[r.id].includes('✓') ? 'bg-gray-400' : 'bg-green-500'
                        : 'bg-[#00a86b] hover:bg-green-700'
                    }`}>
                    {accepting[r.id] ?? '✓ Paga ora'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Transactions ── */}
        {transactions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Ultime transazioni
            </h2>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {transactions.map((t, i) => (
                <div key={t.id ?? i}
                  className={`flex items-center justify-between px-5 py-3.5 ${i < transactions.length - 1 ? 'border-b border-gray-100' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                      t.type === 'in' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                    }`}>
                      {t.type === 'in' ? '↓' : '↑'}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-gray-800">{t.description}</p>
                      <p className="text-xs text-gray-400">{t.counterparty} · {t.date?.slice(0, 10)}</p>
                    </div>
                  </div>
                  <p className={`font-bold text-sm ${t.type === 'in' ? 'text-green-600' : 'text-red-500'}`}>
                    {t.type === 'in' ? '+' : ''}€{Math.abs(parseFloat(t.amount ?? '0')).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
