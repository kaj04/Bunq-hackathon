'use client'
import React from 'react'
import { Home, Users, Search } from 'lucide-react'

interface SidebarProps {
  activeTab: string
  setActiveTab: (tab: string) => void
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'groups', icon: Users, label: 'Groups' },
  ]

  return (
    <div className="w-64 h-full border-r border-border-subtle flex flex-col p-6 fixed left-0 top-0 bg-background z-20">
      <div className="mb-10 flex items-center px-2">
        <h1 className="font-bold text-xl tracking-tight italic text-white">MeditaSplit</h1>
      </div>

      <nav className="flex-1 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all relative group ${
              activeTab === item.id ? 'text-white bg-white/5' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <item.icon size={20} className={activeTab === item.id ? 'text-bunq' : 'group-hover:text-white transition-colors'} />
            <span className="font-semibold text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-6">
        <div className="flex items-center gap-2 pr-2 px-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/10" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-zinc-300">Francesco C.</span>
            <span className="text-[10px] font-bold text-bunq/60 uppercase">Sandbox</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export const TopBar: React.FC = () => (
  <div className="h-16 border-b border-border-subtle flex items-center justify-between px-8 bg-background/50 backdrop-blur-xl sticky top-0 z-10 ml-64">
    <div className="relative w-80">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
      <input
        type="text"
        placeholder="Quick search..."
        className="w-full bg-white/5 border border-border-subtle rounded-xl py-2 pl-11 pr-4 text-xs focus:outline-none focus:border-bunq/30 transition-all"
      />
    </div>
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/10" />
      <span className="text-xs font-bold text-zinc-400">Francesco C.</span>
    </div>
  </div>
)
