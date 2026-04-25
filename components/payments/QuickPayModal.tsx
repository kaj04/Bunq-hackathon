'use client'
import React, { useState, useEffect } from 'react'
import { X, CreditCard, Send, Loader2, MapPin, Clock, Pencil } from 'lucide-react'

const CATEGORIES = [
  { emoji: '🍕', label: 'Food & Drink' },
  { emoji: '🚗', label: 'Transport' },
  { emoji: '🛒', label: 'Shopping' },
  { emoji: '🎟', label: 'Entertainment' },
  { emoji: '🏠', label: 'Home' },
  { emoji: '💊', label: 'Health' },
  { emoji: '✈️', label: 'Travel' },
  { emoji: '📦', label: 'Other' },
]

interface Location {
  city: string
  country: string
  latitude: number
  longitude: number
}

interface QuickPayModalProps {
  onClose: () => void
  onSuccess: () => void
}

export const QuickPayModal: React.FC<QuickPayModalProps> = ({ onClose, onSuccess }) => {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [location, setLocation] = useState<Location | null>(null)
  const [locLoading, setLocLoading] = useState(false)
  const [editingLocation, setEditingLocation] = useState(false)
  const [manualCity, setManualCity] = useState('')
  const [datetime, setDatetime] = useState(() => {
    const now = new Date()
    now.setSeconds(0, 0)
    return now.toISOString().slice(0, 16)
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    setLocLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const city = data.address?.city ?? data.address?.town ?? data.address?.village ?? 'Unknown city'
          const country = data.address?.country_code?.toUpperCase() ?? 'NL'
          setLocation({ city, country, latitude, longitude })
        } catch {
          setLocation({ city: 'Amsterdam', country: 'NL', latitude, longitude })
        }
        setLocLoading(false)
      },
      () => {
        setLocation({ city: 'Amsterdam', country: 'NL', latitude: 52.37, longitude: 4.89 })
        setLocLoading(false)
      },
      { timeout: 5000 }
    )
  }, [])

  const handlePay = async () => {
    if (!description.trim() || !amount || parseFloat(amount) <= 0) return
    setLoading(true)
    setError(null)
    try {
      const cityOverride = manualCity.trim()
      const effectiveLocation = cityOverride
        ? { ...(location ?? { latitude: 52.37, longitude: 4.89 }), city: cityOverride.split(',')[0].trim(), country: cityOverride.includes(',') ? cityOverride.split(',')[1].trim() : location?.country ?? 'NL' }
        : location ?? undefined
      const res = await fetch('/api/bunq/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description: description.trim(),
          category: category.label,
          categoryEmoji: category.emoji,
          location: effectiveLocation,
          timestamp: new Date(datetime).toISOString(),
        }),
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

          {/* Amount */}
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

          {/* Category */}
          <div>
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest mb-2">Category</p>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.label}
                  onClick={() => setCategory(c)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-2xl text-xs transition-all ${
                    category.label === c.label
                      ? 'bg-bunq/20 border border-bunq/50 text-white'
                      : 'bg-white/5 border border-transparent text-white/40 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="text-xl">{c.emoji}</span>
                  <span className="text-[9px] font-bold leading-tight text-center">{c.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Location + Time */}
          <div className="space-y-2">
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Location & Time</p>

            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3">
              <MapPin size={16} className="text-bunq flex-shrink-0" />
              {editingLocation ? (
                <input
                  autoFocus
                  value={manualCity}
                  onChange={e => setManualCity(e.target.value)}
                  onBlur={() => setEditingLocation(false)}
                  onKeyDown={e => e.key === 'Enter' && setEditingLocation(false)}
                  placeholder={location ? `${location.city}, ${location.country}` : 'City, Country'}
                  className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/30"
                />
              ) : (
                <span className="flex-1 text-white/60 text-xs font-medium">
                  {manualCity.trim() || (locLoading ? 'Detecting...' : location ? `${location.city}, ${location.country}` : 'Unknown')}
                </span>
              )}
              <button
                onClick={() => setEditingLocation(true)}
                className="text-white/20 hover:text-bunq transition-colors"
                title="Edit location"
              >
                <Pencil size={13} />
              </button>
            </div>

            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3">
              <Clock size={16} className="text-bunq flex-shrink-0" />
              <input
                type="datetime-local"
                value={datetime}
                onChange={e => setDatetime(e.target.value)}
                className="flex-1 bg-transparent text-xs text-white/60 outline-none [color-scheme:dark]"
              />
            </div>
          </div>

          {error && <p className="text-rose-400 text-xs text-center">{error}</p>}

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
            {category.emoji} {category.label} · Charged to your Bunq Sandbox account
          </p>
        </div>
      </div>
    </div>
  )
}
