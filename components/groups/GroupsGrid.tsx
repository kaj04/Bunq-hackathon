'use client'
import React, { useState, useEffect } from 'react'
import { Plus, Users, ArrowRight, Check } from 'lucide-react'
import { Group } from '@/types/designer'

interface GroupMember { name: string; alias: string }

interface GroupsGridProps {
  groups: Group[]
  availableContacts: GroupMember[]
  onSelectGroup: (group: Group) => void
  onCreateGroup: (name: string, emoji: string, color: string, members: GroupMember[]) => void
}

export const GroupsGrid: React.FC<GroupsGridProps> = ({ groups, availableContacts, onSelectGroup, onCreateGroup }) => {
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('🌍')
  const [newColor, setNewColor] = useState('#00a86b')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())

  // Pre-select all contacts whenever the list loads or creation opens
  useEffect(() => {
    if (isCreating) setSelectedNames(new Set(availableContacts.map(c => c.name)))
  }, [isCreating, availableContacts])

  const toggleMember = (name: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    const members = availableContacts.filter(c => selectedNames.has(c.name))
    onCreateGroup(newName.trim(), newEmoji, newColor, members)
    setNewName('')
    setNewEmoji('🌍')
    setNewColor('#00a86b')
    setIsCreating(false)
  }

  const handleCancel = () => {
    setIsCreating(false)
    setNewName('')
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ml-64">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Your Groups</h2>
          <p className="text-white/40">Manage your shared expenses with friends</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="btn-primary">
          <Plus size={20} /> New Group
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isCreating && (
          <div className="bg-card rounded-[32px] p-6 border-2 border-bunq flex flex-col gap-4 shadow-2xl shadow-bunq/10">
            {/* Emoji picker */}
            <div className="grid grid-cols-4 gap-2">
              {['🍕','🍔','🍺','🚗','✈️','🏨','🎟️','🛒'].map(e => (
                <button key={e} onClick={() => setNewEmoji(e)}
                  className={`text-2xl p-2 rounded-xl transition-all ${newEmoji === e ? 'bg-bunq/20 border border-bunq/50' : 'hover:bg-white/5'}`}>
                  {e}
                </button>
              ))}
            </div>

            {/* Name */}
            <input
              autoFocus type="text" placeholder="Group name" value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-bunq"
            />

            {/* Color */}
            <div className="flex gap-2">
              {['#00a86b','#8b5cf6','#f59e0b','#3b82f6','#ef4444'].map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${newColor === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>

            {/* Member picker */}
            {availableContacts.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-3">Members</p>
                <div className="flex flex-wrap gap-2">
                  {availableContacts.map(contact => {
                    const selected = selectedNames.has(contact.name)
                    return (
                      <button
                        key={contact.name}
                        onClick={() => toggleMember(contact.name)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          selected
                            ? 'bg-bunq/20 border-bunq/60 text-white'
                            : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${selected ? 'bg-bunq text-white' : 'bg-white/10 text-white/50'}`}>
                          {selected ? <Check size={10} /> : contact.name.charAt(0)}
                        </span>
                        {contact.name}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-white/20 mt-2">
                  {selectedNames.size} of {availableContacts.length} selected
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-1">
              <button onClick={handleCancel} className="btn-secondary flex-1 !py-2">Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="btn-primary flex-1 !py-2 disabled:opacity-40 disabled:cursor-not-allowed">Create</button>
            </div>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.id} onClick={() => onSelectGroup(group)}
            className="bg-card rounded-[24px] p-5 border border-zinc-800 cursor-pointer hover:border-bunq/40 transition-all group overflow-hidden relative shadow-sm hover:-translate-y-1">
            <div className="flex justify-between items-start mb-6">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-3xl shadow-lg border border-white/5"
                style={{ backgroundColor: `${group.color}20` }}>
                {group.emoji}
              </div>
              <div className="text-right">
                <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Spent</p>
                <p className="text-lg font-bold tabular-nums italic">€ {group.totalSpent.toFixed(2)}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="text-lg font-bold group-hover:text-bunq transition-colors">{group.name}</h4>
                <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                  <Users size={12} className="text-bunq" />
                  <span>{group.memberCount} members</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
                <div className="flex -space-x-1.5">
                  {group.members.slice(0, 3).map((m, i) => (
                    <div key={i} className="w-6 h-6 rounded-full border border-card bg-zinc-800 flex items-center justify-center text-[8px] font-bold text-zinc-400">
                      {m.name.charAt(0)}
                    </div>
                  ))}
                  {group.members.length > 3 && (
                    <div className="w-6 h-6 rounded-full border border-card bg-zinc-800 flex items-center justify-center text-[8px] font-bold text-zinc-400">
                      +{group.members.length - 3}
                    </div>
                  )}
                </div>
                <ArrowRight size={18} className="text-zinc-700 group-hover:text-bunq group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
