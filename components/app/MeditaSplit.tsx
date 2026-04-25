'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar, TopBar } from '@/components/layout/Shell'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { GroupsGrid } from '@/components/groups/GroupsGrid'
import { GroupChat } from '@/components/groups/GroupChat'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { QuickPayModal } from '@/components/payments/QuickPayModal'
import { Group, GroupExpense, Transaction, PaymentRequest, SplitResult } from '@/types/designer'

const ALL_MEMBERS = [
  { name: 'Francesco', alias: 'test+04f633e0-a0b9-462f-bb2f-d71d81d7d8ad@bunq.com' },
  { name: 'Giorgio',   alias: 'test+708be9a9-dcde-4a0a-95c2-d485b72850a4@bunq.com' },
  { name: 'Vaggelis',  alias: 'test+a1223711-bee6-4974-bc54-b3ed8b11f121@bunq.com' },
  { name: 'Diego',     alias: 'test+0e48be1e-7446-4b25-b0ac-6c16fbb0f38d@bunq.com' },
]

const SEED_GROUPS: Group[] = [
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
  const [isQuickPayOpen, setIsQuickPayOpen] = useState(false)
  const [balance, setBalance] = useState('0.00')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [requests, setRequests] = useState<PaymentRequest[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [memberAliases, setMemberAliases] = useState<{ name: string; userId: number; alias: string }[]>([])
  const [currentUser, setCurrentUser] = useState('Me')
  const [currentUserAlias, setCurrentUserAlias] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups')
      const data = await res.json()
      if (data.success) {
        if (data.data.length === 0) {
          // Seed server with default groups on first use
          await Promise.all(SEED_GROUPS.map(g =>
            fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(g) })
          ))
          setGroups(SEED_GROUPS)
        } else {
          setGroups(data.data)
          setSelectedGroup(prev => prev ? (data.data.find((g: Group) => g.id === prev.id) ?? null) : null)
        }
      }
    } catch { /* ignore */ }
  }, [])

  const fetchMembers = useCallback(async () => {
    try {
      const [membersRes, meRes] = await Promise.all([
        fetch('/api/bunq/members'),
        fetch('/api/bunq/me'),
      ])
      const [membersData, meData] = await Promise.all([membersRes.json(), meRes.json()])
      if (membersData.success) setMemberAliases(membersData.data)
      if (meData.success) {
        setCurrentUser(meData.data.name)
        if (meData.data.alias) setCurrentUserAlias(meData.data.alias)
      }
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
            description: tx.description ?? '',
            counterparty: tx.counterparty ?? '',
            isSugarDaddy: tx.isSugarDaddy ?? false,
            amount: Math.abs(parseFloat(tx.amount)),
            type: tx.type === 'in' ? 'income' : 'outcome',
            date: tx.date ?? '',
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

  useEffect(() => { fetchData(); fetchMembers(); fetchGroups() }, [fetchData, fetchMembers, fetchGroups])

  // Poll groups every 5s when on groups tab
  useEffect(() => {
    if (activeTab === 'groups') {
      pollRef.current = setInterval(fetchGroups, 5000)
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeTab, fetchGroups])

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

  const handleCreateGroup = async (name: string, emoji: string, color: string, members: { name: string; alias: string }[]) => {
    const newGroup: Group = {
      id: Date.now().toString(),
      name, emoji, color,
      members,
      expenses: [],
      memberCount: members.length,
      totalSpent: 0,
    }
    setGroups(prev => [...prev, newGroup])
    await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newGroup),
    }).catch(() => {})
    fetchGroups()
  }

  const handleUpdateGroup = async (updated: Group) => {
    setSelectedGroup(updated)
    setGroups(prev => prev.map(g => g.id === updated.id ? updated : g))
    await fetch(`/api/groups/${updated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {})
    fetchGroups()
  }

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await Promise.all([
        fetch(`/api/groups/${groupId}`, { method: 'DELETE' }),
        fetch(`/api/groups/${groupId}/chat`, { method: 'DELETE' }),
      ])
    } catch (e) {
      console.error('handleDeleteGroup error:', e)
    }
    setSelectedGroup(null)
    fetchGroups()
  }

  const handleGroupExpenseAdded = async (groupId: string, expense: GroupExpense) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const expenses = [...group.expenses, expense]
    const updated = { ...group, expenses, totalSpent: expenses.reduce((s, e) => s + e.total, 0) }
    setGroups(prev => prev.map(g => g.id === groupId ? updated : g))
    await fetch(`/api/groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {})
  }

  const handleConfirmExpense = async (description: string, total: number, splits: SplitResult[]) => {
    setIsAddExpenseOpen(false)
    try {
      const members = splits
        .filter(s => s.name !== currentUser)
        .map(s => {
          const fromState = memberAliases.find(m => m.name === s.name)
          const fromGroup = activeGroup?.members.find(m => m.name === s.name)
          const alias = fromState?.alias || fromGroup?.alias || `${s.name.toLowerCase()}@sandbox.com`
          return { name: s.name, alias, amount: parseFloat(s.amount as string) }
        })
      const res = await fetch('/api/bunq/split-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, totalAmount: total, members }),
      })
      const data = await res.json()
      if (!data.success) console.error('Split group error:', data.error)
      if (selectedGroup && data.batchId) {
        await handleGroupExpenseAdded(selectedGroup.id, {
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
  const openQuickPay = () => setIsQuickPayOpen(true)

  const activeGroup = selectedGroup ?? groups[0]
  const availableContacts = memberAliases.length > 0
    ? memberAliases.map(m => ({ name: m.name, alias: m.alias }))
    : ALL_MEMBERS

  return (
    <div className="min-h-screen bg-background text-white flex">
      <Sidebar activeTab={activeTab} setActiveTab={(tab) => { setActiveTab(tab); setSelectedGroup(null) }} userName={currentUser} />

      <div className="flex-1 flex flex-col">
        <TopBar userName={currentUser} />

        <main className="flex-1">
          {activeTab === 'home' && (
            <Dashboard
              balance={balance}
              transactions={transactions}
              requests={requests}
              onAcceptRequest={handleAcceptRequest}
              onAddExpense={openQuickPay}
              onRefresh={fetchData}
            />
          )}

          {activeTab === 'groups' && !selectedGroup && (
            <GroupsGrid
              groups={groups}
              availableContacts={availableContacts}
              onSelectGroup={setSelectedGroup}
              onCreateGroup={handleCreateGroup}
            />
          )}

          {activeTab === 'groups' && selectedGroup && (
            <GroupChat
              group={selectedGroup}
              onBack={() => setSelectedGroup(null)}
              onOpenAddExpense={openAddExpense}
              availableContacts={availableContacts}
              onUpdateGroup={handleUpdateGroup}
              onDeleteGroup={() => handleDeleteGroup(selectedGroup.id)}
              onExpenseAdded={(expense) => handleGroupExpenseAdded(selectedGroup.id, expense)}
              currentUser={currentUser}
              currentUserAlias={currentUserAlias}
            />
          )}
        </main>
      </div>

      {isAddExpenseOpen && (
        <AddExpenseModal
          group={activeGroup}
          currentUser={currentUser}
          onClose={() => setIsAddExpenseOpen(false)}
          onConfirm={handleConfirmExpense}
        />
      )}

      {isQuickPayOpen && (
        <QuickPayModal
          onClose={() => setIsQuickPayOpen(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  )
}
