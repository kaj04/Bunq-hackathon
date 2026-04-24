'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Sidebar, TopBar } from '@/components/layout/Shell'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { GroupsGrid } from '@/components/groups/GroupsGrid'
import { GroupChat } from '@/components/groups/GroupChat'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { Group, Transaction, PaymentRequest, SplitResult } from '@/types/designer'

const INITIAL_GROUPS: Group[] = [
  { id: '1', name: 'Weekend Trip', emoji: '✈️', color: '#8b5cf6', members: ['Francesco', 'Giorgio', 'Diego', 'Vaggelis'], memberCount: 4, totalSpent: 0 },
  { id: '2', name: 'Dinner Club', emoji: '🍕', color: '#f59e0b', members: ['Francesco', 'Giorgio', 'Diego'], memberCount: 3, totalSpent: 0 },
]

export const MeditaSplit: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home')
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)
  const [balance, setBalance] = useState('0.00')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [requests, setRequests] = useState<PaymentRequest[]>([])
  const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS)

  const fetchData = useCallback(async () => {
    try {
      const [balRes, txRes, reqRes] = await Promise.all([
        fetch('/api/bunq/balance'),
        fetch('/api/bunq/transactions'),
        fetch('/api/bunq/requests'),
      ])
      const [balData, txData, reqData] = await Promise.all([balRes.json(), txRes.json(), reqRes.json()])

      if (balData.success && Array.isArray(balData.data) && balData.data.length > 0) {
        setBalance(parseFloat(balData.data[0].balance).toFixed(2))
      }

      if (txData.success) {
        setTransactions(
          txData.data.map((tx: any) => ({
            id: tx.id,
            counterparty: tx.counterparty,
            amount: Math.abs(parseFloat(tx.amount)),
            type: tx.type === 'in' ? 'income' : 'outcome',
            groupName: tx.groupName ?? null,
          }))
        )
      }

      if (reqData.success) {
        setRequests(
          reqData.data.map((r: any) => ({
            id: r.id,
            from: r.counterparty ?? r.from ?? 'Unknown',
            amount: r.amount,
            description: r.description ?? 'Payment request',
          }))
        )
      }
    } catch (e) {
      console.error('Failed to fetch Bunq data', e)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAcceptRequest = async (id: string) => {
    try {
      await fetch('/api/bunq/requests/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }),
      })
      setRequests(prev => prev.filter(r => r.id !== id))
      fetchData()
    } catch (e) {
      console.error('Accept request failed', e)
    }
  }

  const handleCreateGroup = (name: string, emoji: string, color: string) => {
    const newGroup: Group = {
      id: Date.now().toString(),
      name,
      emoji,
      color,
      members: ['Francesco', 'Giorgio', 'Diego'],
      memberCount: 3,
      totalSpent: 0,
    }
    setGroups(prev => [...prev, newGroup])
  }

  const handleConfirmExpense = async (description: string, total: number, splits: SplitResult[]) => {
    setIsAddExpenseOpen(false)
    try {
      await fetch('/api/bunq/split-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          requests: splits.map(s => ({
            name: s.name,
            amount: parseFloat(s.amount as string),
          })),
        }),
      })
      if (selectedGroup) {
        setGroups(prev =>
          prev.map(g => g.id === selectedGroup.id ? { ...g, totalSpent: g.totalSpent + total } : g)
        )
      }
      fetchData()
    } catch (e) {
      console.error('Split group failed', e)
    }
  }

  const openAddExpense = () => setIsAddExpenseOpen(true)

  const activeGroup = selectedGroup ?? groups[0]

  return (
    <div className="min-h-screen bg-background text-white flex">
      <Sidebar activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setSelectedGroup(null) }} />

      <div className="flex-1 flex flex-col">
        <TopBar />

        <main className="flex-1">
          {activeTab === 'home' && (
            <Dashboard
              balance={balance}
              transactions={transactions}
              requests={requests}
              onAcceptRequest={handleAcceptRequest}
              onAddExpense={openAddExpense}
            />
          )}

          {activeTab === 'groups' && !selectedGroup && (
            <GroupsGrid
              groups={groups}
              onSelectGroup={setSelectedGroup}
              onCreateGroup={handleCreateGroup}
            />
          )}

          {activeTab === 'groups' && selectedGroup && (
            <GroupChat
              group={selectedGroup}
              onBack={() => setSelectedGroup(null)}
              onOpenAddExpense={openAddExpense}
            />
          )}
        </main>
      </div>

      {isAddExpenseOpen && (
        <AddExpenseModal
          group={activeGroup}
          onClose={() => setIsAddExpenseOpen(false)}
          onConfirm={handleConfirmExpense}
        />
      )}
    </div>
  )
}
