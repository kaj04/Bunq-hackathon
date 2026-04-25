'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar, TopBar } from '@/components/layout/Shell'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { GroupsGrid } from '@/components/groups/GroupsGrid'
import { GroupChat } from '@/components/groups/GroupChat'
import { AddExpenseModal } from '@/components/expenses/AddExpenseModal'
import { QuickPayModal } from '@/components/payments/QuickPayModal'
import { Group, GroupExpense, Transaction, PaymentRequest, SplitResult } from '@/types/designer'

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
        setGroups(data.data)
        // Keep selectedGroup in sync
        setSelectedGroup(prev => prev ? (data.data.find((g: Group) => g.id === prev.id) ?? prev) : null)
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

  // Initial load
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
    await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newGroup),
    })
    fetchGroups()
  }

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/groups/${groupId}`, { method: 'DELETE' }),
        fetch(`/api/groups/${groupId}/chat`, { method: 'DELETE' }),
      ])
      const [d1, d2] = await Promise.all([r1.json(), r2.json()])
      if (!d1.success) console.error('Delete group failed:', d1)
      if (!d2.success) console.error('Delete chat failed:', d2)
    } catch (e) {
      console.error('handleDeleteGroup error:', e)
    }
    setSelectedGroup(null)
    fetchGroups()
  }

  const handleUpdateGroup = async (updated: Group) => {
    await fetch(`/api/groups/${updated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    setSelectedGroup(updated)
    fetchGroups()
  }

  const handleGroupExpenseAdded = async (groupId: string, expense: GroupExpense) => {
    const group = groups.find(g => g.id === groupId)
    if (!group) return
    const expenses = [...group.expenses, expense]
    const updated = { ...group, expenses, totalSpent: expenses.reduce((s, e) => s + e.total, 0) }
    await fetch(`/api/groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    fetchGroups()
  }

  const handleConfirmExpense = async (description: string, total: number, splits: SplitResult[]) => {
    setIsAddExpenseOpen(false)
    try {
      const members = splits
        .filter(s => s.name !== currentUser && s.name.toLowerCase() !== 'sugar daddy')
        .map(s => {
          const fromState = memberAliases.find(m => m.name === s.name)
          const fromGroup = activeGroup?.members.find(m => m.name === s.name)
          const alias = fromState?.alias || fromGroup?.alias || null
          return alias ? { name: s.name, alias, amount: parseFloat(s.amount as string) } : null
        })
        .filter((s): s is { name: string; alias: string; amount: number } => s !== null)
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
              availableContacts={memberAliases.map(m => ({ name: m.name, alias: m.alias }))}
              onSelectGroup={setSelectedGroup}
              onCreateGroup={handleCreateGroup}
            />
          )}

          {activeTab === 'groups' && selectedGroup && (
            <GroupChat
              key={selectedGroup.id}
              group={selectedGroup}
              currentUser={currentUser}
              currentUserAlias={currentUserAlias}
              onBack={() => setSelectedGroup(null)}
              availableContacts={memberAliases.map(m => ({ name: m.name, alias: m.alias }))}
              onUpdateGroup={handleUpdateGroup}
              onDeleteGroup={() => handleDeleteGroup(selectedGroup.id)}
              onExpenseAdded={(expense) => handleGroupExpenseAdded(selectedGroup.id, expense)}
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
