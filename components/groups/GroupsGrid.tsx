'use client'
import React, { useState } from 'react'
import { Plus, Users, ArrowRight } from 'lucide-react'
import { Group } from '@/types/designer'

interface GroupsGridProps {
  groups: Group[]
  onSelectGroup: (group: Group) => void
  onCreateGroup: (name: string, emoji: string, color: string) => void
}

export const GroupsGrid: React.FC<GroupsGridProps> = ({ groups, onSelectGroup, onCreateGroup }) => {
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('🌍')
  const [newColor, setNewColor] = useState('#00a86b')

  const handleCreate = () => {
    if (newName.trim()) {
      onCreateGroup(newName, newEmoji, newColor)
      setNewName('')
      setIsCreating(false)
    }
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
            <div className="grid grid-cols-4 gap-2 mb-2">
              {['🍕','🍔','🍺','🚗','✈️','🏨','🎟️','🛒'].map(e => (
                <button key={e} onClick={() => setNewEmoji(e)}
                  className={`text-2xl p-2 rounded-xl transition-all ${newEmoji === e ? 'bg-bunq/20 border border-bunq/50' : 'hover:bg-white/5'}`}>
                  {e}
                </button>
              ))}
            </div>
            <input
              autoFocus type="text" placeholder="Group Name" value={newName}
              onChange={e => setNewName(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-2xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-bunq"
            />
            <div className="flex gap-2">
              {['#00a86b','#8b5cf6','#f59e0b','#3b82f6','#ef4444'].map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${newColor === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setIsCreating(false)} className="btn-secondary flex-1 !py-2">Cancel</button>
              <button onClick={handleCreate} className="btn-primary flex-1 !py-2">Create</button>
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
                      {m.charAt(0)}
                    </div>
                  ))}
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
