'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Sidebar, TopBar } from '@/components/layout/Shell'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { GroupsGrid } from '@/components/groups/GroupsGrid'
import { GroupChat } from '@/components/groups/GroupChat'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { Group, GroupExpense, Transaction, PaymentRequest, SplitResult } from '@/types/designer'

// Sandbox users with placeholder aliases — real emails loaded from /api/bunq/members on mount
const INITIAL_MEMBERS = [
  { name: 'Francesco', userId: 3628453, alias: '' },
  { name: 'Giorgio',   userId: 3628489, alias: '' },
  { name: 'Vaggelis',  userId: 3628490, alias: '' },
  { name: 'Diego',     userId: 3628491, alias: '' },
]

const ALL_MEMBERS = [
  { name: 'Francesco', alias: 'test+4a19be6a-58e5-4cc3-ac92-244caa863359@bunq.com' },
  { name: 'Giorgio',   alias: 'giorgio@sandbox.com' },
  { name: 'Vaggelis',  alias: 'vaggelis@sandbox.com' },
  { name: 'Diego',     alias: 'diego@sandbox.com' },
]

const INITIAL_GROUPS: Group[] = [
  {
    id: '1', name: 'Weekend Trip', emoji: '✈️', color: '#8b5cf6',
    members: ALL_MEMBERS,
    expenses: [], totalSpent: 0, memberCount: 4,
  },
  {
    id: '2', name: 'Dinner Club', emoji: '🍕', color: '#f59e0b',
    members: ALL_MEMBERS.filter(m => m.name !== 'Vaggelis'),
    expenses: [], totalSpent: 0, memberCount: 3,
  },
]

export const MeditaSplit: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home')
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)
  const [balance, setBalance] = useState('0.00')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [requests, setRequests] = useState<PaymentRequest[]>([])
  const [groups, setGroups] = useState<Group[]>(INITIAL_GROUPS)
  const [memberAliases, setMemberAliases] = useState<{ name: string; userId: number; alias: string }[]>(INITIAL_MEMBERS)

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/bunq/members')
      const data = await res.json()
      if (data.success) setMemberAliases(data.data)
    } catch { /* keep placeholders */ }
  }, [])

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

  useEffect(() => { fetchData(); fetchMembers() }, [fetchData, fetchMembers])

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
      name, emoji, color,
      members: ALL_MEMBERS,
      expenses: [],
      memberCount: ALL_MEMBERS.length,
      totalSpent: 0,
    }
    setGroups(prev => [...prev, newGroup])
  }

  const handleGroupExpenseAdded = (groupId: string, expense: GroupExpense) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      const expenses = [...g.expenses, expense]
      return { ...g, expenses, totalSpent: expenses.reduce((s, e) => s + e.total, 0) }
    }))
  }

  const handleConfirmExpense = async (description: string, total: number, splits: SplitResult[]) => {
    setIsAddExpenseOpen(false)
    try {
      const members = splits
        .filter(s => s.name !== 'Francesco') // Francesco è il pagante, non richiede a se stesso
        .map(s => {
          const member = memberAliases.find(m => m.name === s.name)
          return {
            name: s.name,
            alias: member?.alias ?? `${s.name.toLowerCase()}@sandbox.com`,
            amount: parseFloat(s.amount as string),
          }
        })
      const res = await fetch('/api/bunq/split-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, totalAmount: total, members }),
      })
      const data = await res.json()
      if (!data.success) console.error('Split group error:', data.error)
      if (selectedGroup && data.batchId) {
        handleGroupExpenseAdded(selectedGroup.id, {
          batchId: data.batchId,
          description,
          total,
          date: new Date().toISOString().slice(0, 10),
          splits: members,
        })
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
              onRefresh={fetchData}
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
              onExpenseAdded={(expense) => handleGroupExpenseAdded(selectedGroup.id, expense)}
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
