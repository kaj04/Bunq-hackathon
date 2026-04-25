'use client'
import React, { useState } from 'react'
import { ArrowUpRight, Plus } from 'lucide-react'
import { Transaction, PaymentRequest } from '@/types/designer'

interface DashboardProps {
  balance: string
  transactions: Transaction[]
  requests: PaymentRequest[]
  onAcceptRequest: (id: string) => void
  onAddExpense: () => void
  onRefresh?: () => void
}

export const Dashboard: React.FC<DashboardProps> = ({ balance, transactions, requests, onAcceptRequest, onAddExpense, onRefresh }) => {
  const [funding, setFunding] = useState(false)
  const [fundingStatus, setFundingStatus] = useState<string | null>(null)

  const handleAddFunds = async () => {
    setFunding(true)
    setFundingStatus('Requesting funds...')
    try {
      const res = await fetch('/api/bunq/fund-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 500 }),
      })
      const data = await res.json()
      if (!data.success) { alert('Fund error: ' + data.error); return }

      // Poll every 3s until balance changes (Bunq sugar daddy accepts async, ~10-15s)
      setFundingStatus('Waiting for Bunq to credit...')
      const startBalance = parseFloat(balance.replace(/,/g, ''))
      let attempts = 0
      const poll = async () => {
        attempts++
        onRefresh?.()
        // Balance state is updated by parent — we rely on the button label changing
        if (attempts < 8) setTimeout(poll, 3000)
        else { setFunding(false); setFundingStatus(null) }
      }
      setTimeout(poll, 3000)
    } catch (e) {
      alert('Fund failed: ' + e)
      setFunding(false)
      setFundingStatus(null)
    }
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ml-64 max-w-[1240px]">

      {/* Top section */}
      <div className="flex justify-between items-start gap-8">
        {/* Bunq card */}
        <div className="w-[540px] h-[200px] rounded-[28px] relative overflow-hidden shadow-2xl shadow-bunq/30 select-none"
          style={{ background: 'linear-gradient(135deg, #00a86b 0%, #007a4d 50%, #004d31 100%)' }}>

          {/* decorative circles */}
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/5" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute top-6 right-6 w-24 h-24 rounded-full bg-white/5" />

          {/* bunq wordmark */}
          <div className="absolute top-6 left-6 text-white font-black text-2xl tracking-[-0.05em]">bunq</div>

          {/* chip SVG */}
          <svg className="absolute top-6 right-6 opacity-80" width="38" height="30" viewBox="0 0 38 30">
            <rect width="38" height="30" rx="4" fill="#d4a843" />
            <rect x="13" y="0" width="12" height="30" fill="#c49b35" />
            <rect x="0" y="9" width="38" height="12" fill="#c49b35" />
            <rect x="13" y="9" width="12" height="12" fill="#b8882a" />
          </svg>

          {/* balance */}
          <div className="absolute bottom-14 left-6">
            <p className="text-white/50 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Balance</p>
            <p className="text-white text-4xl font-bold tracking-tight">€ {balance}</p>
          </div>

          {/* card number + name */}
          <div className="absolute bottom-5 left-6 right-6 flex items-end justify-between">
            <p className="text-white/70 text-sm font-mono tracking-[0.15em]">•••• •••• •••• 4829</p>
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Francesco</p>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onAddExpense}
            className="h-[160px] w-36 bg-bunq text-black rounded-[24px] flex flex-col items-center justify-center gap-3 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-bunq/20 group"
          >
            <div className="p-3 bg-black/10 rounded-2xl group-hover:bg-black/20 transition-colors">
              <ArrowUpRight className="w-8 h-8" />
            </div>
            <span className="font-bold text-sm tracking-tight">Add Expense</span>
          </button>
          <button
            onClick={handleAddFunds}
            disabled={funding}
            className="h-[160px] w-36 bg-card border border-zinc-800 rounded-[24px] flex flex-col items-center justify-center gap-3 hover:bg-zinc-800/50 transition-all active:scale-95 group disabled:opacity-50"
          >
            <div className="p-3 bg-white/5 rounded-2xl group-hover:bg-white/10 transition-colors">
              {funding
                ? <div className="w-8 h-8 border-2 border-bunq border-t-transparent rounded-full animate-spin" />
                : <Plus className="w-8 h-8 text-bunq" />
              }
            </div>
            <span className="text-sm font-bold text-zinc-300 tracking-tight text-center leading-tight px-1">
              {fundingStatus ?? 'Add Funds'}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Activity */}
        <section className="space-y-6">
          <h2 className="text-lg font-bold tracking-tight">Recent Activity</h2>
          <div className="bg-card rounded-[24px] border border-zinc-800 overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left border-separate border-spacing-0">
              <tbody>
                {transactions.length > 0 ? transactions.map((tx, idx) => (
                  <tr key={idx} className="hover:bg-zinc-800/30 transition-colors group cursor-default border-b border-zinc-800/50 last:border-0">
                    <td className="py-4 px-4">
                      <p className="font-bold text-zinc-200 group-hover:text-white transition-colors">{tx.description || tx.counterparty}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">{tx.counterparty}</p>
                    </td>
                    <td className="py-4 px-4 text-zinc-500 text-xs italic opacity-60 font-medium">{tx.groupName || 'Direct'}</td>
                    <td className={`py-4 px-4 text-right font-bold tabular-nums ${tx.type === 'income' ? 'text-bunq' : 'text-rose-500'}`}>
                      {tx.type === 'income' ? '+' : '-'} € {Math.abs(tx.amount).toFixed(2)}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-zinc-600 italic">No transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Incoming Requests */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold tracking-tight">Incoming Requests</h2>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">{requests.length} Pending</span>
          </div>
          <div className="space-y-3">
            {requests.length > 0 ? requests.map((req) => (
              <div key={req.id} className="bg-card p-5 rounded-[20px] flex items-center justify-between border border-zinc-800 hover:border-zinc-700 transition-all shadow-sm group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center font-bold text-sm text-zinc-400 group-hover:text-bunq transition-colors">
                    {req.from.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{req.from}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">{req.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold tabular-nums">€ {Number(req.amount).toFixed(2)}</span>
                  <button
                    onClick={() => onAcceptRequest(req.id)}
                    className="bg-bunq text-black text-[10px] font-bold px-5 py-2.5 rounded-full active:scale-95 transition-all shadow-md shadow-bunq/10 hover:shadow-bunq/20"
                  >
                    Pay
                  </button>
                </div>
              </div>
            )) : (
              <div className="p-6 border border-dashed border-zinc-800 rounded-[20px] text-center text-zinc-600 text-xs italic">
                No pending requests.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
