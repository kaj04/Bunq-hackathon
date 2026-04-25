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
        <div className="w-[540px] h-[200px] rounded-[28px] relative overflow-hidden shadow-2xl select-none"
          style={{ background: '#1a8fe3' }}>

          {/* colorful vertical stripes — right third of card */}
          <div className="absolute right-0 top-0 h-full flex" style={{ width: '42%' }}>
            {['#e63946','#f4722b','#f9c74f','#90be6d','#43aa8b','#277da1','#6a0572','#c77dff'].map((c, i) => (
              <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
            ))}
          </div>

          {/* subtle overlay to blend stripes */}
          <div className="absolute right-0 top-0 h-full w-[42%] bg-black/10" />

          {/* bunq wordmark + type */}
          <div className="absolute top-6 left-7">
            <p className="text-white font-black text-2xl tracking-[-0.05em] leading-none">bunq</p>
            <p className="text-white/70 text-xs font-semibold mt-0.5">credit</p>
          </div>


          {/* balance */}
          <div className="absolute bottom-14 left-7">
            <p className="text-white/60 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Balance</p>
            <p className="text-white text-4xl font-bold tracking-tight">€ {balance}</p>
          </div>

          {/* card number + mastercard */}
          <div className="absolute bottom-5 left-7 right-7 flex items-center justify-between z-10">
            <p className="text-white/80 text-sm font-mono tracking-[0.18em]">•••• •••• •••• 1234</p>
            {/* Mastercard circles */}
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-full bg-[#eb001b] opacity-90 -mr-3" />
              <div className="w-7 h-7 rounded-full bg-[#f79e1b] opacity-90" />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Add Expense — coral pastel with diagonal dot pattern */}
          <button
            onClick={onAddExpense}
            className="h-[160px] w-36 rounded-[24px] flex flex-col items-center justify-center gap-3 transition-all hover:scale-105 active:scale-95 shadow-lg group relative overflow-hidden"
            style={{ background: '#fddde6' }}
          >
            {/* dot grid pattern */}
            <div className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(circle, #e63946 1.5px, transparent 1.5px)',
                backgroundSize: '14px 14px',
              }} />
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="p-3 rounded-2xl" style={{ background: 'rgba(230,57,70,0.15)' }}>
                <ArrowUpRight className="w-8 h-8" style={{ color: '#c0394a' }} />
              </div>
              <span className="font-bold text-sm tracking-tight" style={{ color: '#9b2233' }}>Add Expense</span>
            </div>
          </button>

          {/* Add Funds — mint pastel with diagonal stripe pattern */}
          <button
            onClick={handleAddFunds}
            disabled={funding}
            className="h-[160px] w-36 rounded-[24px] flex flex-col items-center justify-center gap-3 transition-all hover:scale-105 active:scale-95 shadow-lg group relative overflow-hidden disabled:opacity-60"
            style={{ background: '#d4f5ed' }}
          >
            {/* diagonal stripe pattern */}
            <div className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, #43aa8b 0px, #43aa8b 1.5px, transparent 1.5px, transparent 12px)',
              }} />
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="p-3 rounded-2xl" style={{ background: 'rgba(67,170,139,0.15)' }}>
                {funding
                  ? <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#2d8a6e', borderTopColor: 'transparent' }} />
                  : <Plus className="w-8 h-8" style={{ color: '#2d7a62' }} />
                }
              </div>
              <span className="text-sm font-bold tracking-tight text-center leading-tight px-1" style={{ color: '#1e5c49' }}>
                {fundingStatus ?? 'Add Funds'}
              </span>
            </div>
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
                {transactions.length > 0 ? transactions.map((tx, idx) => {
                  const isTopUp = tx.type === 'income' && tx.isSugarDaddy

                  // Parse enriched description: "[Category] Title — City, Country — HH:MM"
                  let title = tx.description || tx.counterparty
                  let location: string | null = null
                  let time: string | null = null
                  let categoryEmoji: string | null = null

                  if (!isTopUp && tx.description) {
                    // Extract category bracket
                    const catMatch = tx.description.match(/^\[([^\]]+)\]\s*/)
                    if (catMatch) {
                      title = tx.description.slice(catMatch[0].length)
                      const catMap: Record<string, string> = {
                        'Food & Drink': '🍕', 'Transport': '🚗', 'Shopping': '🛍️',
                        'Entertainment': '🎬', 'Home': '🏠', 'Health': '💊',
                        'Travel': '✈️', 'Other': '📦',
                      }
                      categoryEmoji = catMap[catMatch[1]] ?? '📦'
                    }
                    // Extract time: last "— HH:MM"
                    const timeMatch = title.match(/\s*—\s*(\d{2}:\d{2})\s*$/)
                    if (timeMatch) {
                      time = timeMatch[1]
                      title = title.slice(0, title.length - timeMatch[0].length)
                    }
                    // Extract location: remaining "— City, Country"
                    const locMatch = title.match(/\s*—\s*(.+)$/)
                    if (locMatch) {
                      location = locMatch[1]
                      title = title.slice(0, title.length - locMatch[0].length).trim()
                    }
                  }

                  return (
                  <tr key={idx} className="hover:bg-zinc-800/30 transition-colors group cursor-default border-b border-zinc-800/50 last:border-0">
                    <td className="py-4 px-4">
                      <p className="font-bold text-zinc-200 group-hover:text-white transition-colors">
                        {isTopUp ? tx.counterparty : title}
                      </p>
                      {isTopUp
                        ? <p className="text-[10px] text-zinc-500 font-medium mt-0.5">{tx.description}</p>
                        : location && <p className="text-[10px] text-zinc-500 font-medium mt-0.5">{location}</p>
                      }
                    </td>
                    <td className="py-4 px-4 text-zinc-400 text-xs font-medium whitespace-nowrap">
                      {isTopUp
                        ? <span className="opacity-50 italic">Top-up</span>
                        : <span className="flex items-center gap-1.5">
                            {categoryEmoji && <span className="text-base leading-none">{categoryEmoji}</span>}
                            {time && <span className="opacity-60">{time}</span>}
                            {!categoryEmoji && !time && <span className="opacity-40 italic">{tx.groupName || 'Direct'}</span>}
                          </span>
                      }
                    </td>
                    <td className={`py-4 px-4 text-right font-bold tabular-nums ${tx.type === 'income' ? 'text-bunq' : 'text-rose-500'}`}>
                      {tx.type === 'income' ? '+' : '-'} € {Math.abs(tx.amount).toFixed(2)}
                    </td>
                  </tr>
                  )
                }) : (
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
