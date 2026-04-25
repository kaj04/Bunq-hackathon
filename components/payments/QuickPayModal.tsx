'use client'
import React, { useState } from 'react'
import { X, CreditCard, Send, Loader2 } from 'lucide-react'

interface QuickPayModalProps {
  onClose: () => void
  onSuccess: () => void
}

export const QuickPayModal: React.FC<QuickPayModalProps> = ({ onClose, onSuccess }) => {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePay = async () => {
    if (!description.trim() || !amount || parseFloat(amount) <= 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bunq/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount), description: description.trim() }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error ?? 'Payment failed')
      onSuccess()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-sm">
      <div className="bg-card w-full max-w-md rounded-[40px] border border-white/10 shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-8 pb-4 flex justify-between items-center bg-white/[0.02] border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-bunq/10 rounded-2xl flex items-center justify-center">
              <CreditCard className="text-bunq" size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold">Quick Pay</h3>
              <p className="text-white/40 text-xs">Simulate a card payment</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-full transition-colors text-white/30 hover:text-white">
            <X size={22} />
          </button>
        </div>

        {/* Form */}
        <div className="p-8 space-y-5">
          {/* Amount — big and prominent like Apple Pay */}
          <div className="text-center py-4">
            <p className="text-white/30 text-xs font-bold uppercase tracking-widest mb-3">Amount</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-bold text-white/30">€</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="w-40 text-5xl font-bold bg-transparent border-none outline-none text-center text-white tabular-nums placeholder:text-white/20 focus:ring-0"
              />
            </div>
          </div>

          {/* Description */}
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePay()}
            placeholder="e.g. Dinner at Mario's Restaurant"
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-bunq placeholder:text-white/30"
          />

          {error && (
            <p className="text-rose-400 text-xs text-center">{error}</p>
          )}

          {/* Pay button */}
          <button
            onClick={handlePay}
            disabled={!description.trim() || !amount || parseFloat(amount) <= 0 || loading}
            className="btn-primary w-full !py-4 shadow-xl shadow-bunq/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? <><Loader2 size={20} className="animate-spin" /> Processing...</>
              : <><Send size={20} /> Pay € {parseFloat(amount || '0').toFixed(2)}</>
            }
          </button>

          <p className="text-center text-[10px] text-white/20 uppercase tracking-widest">
            Charged to your Bunq Sandbox account
          </p>
        </div>
      </div>
    </div>
  )
}
