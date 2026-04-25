export interface ChatMessage {
  id: string
  sender: 'user' | 'agent'
  text: string
  timestamp: string
  attachment?: { type: 'receipt'; url: string }
}

export interface Transaction {
  amount: number
  description: string
  type: 'income' | 'outcome'
  counterparty: string
  date: string
  groupName?: string
}

export interface PaymentRequest {
  id: string
  amount: number
  description: string
  from: string
}

export interface GroupMember {
  name: string
  alias: string  // email Bunq sandbox
}

export interface GroupExpense {
  batchId: number
  description: string
  total: number
  date: string
  splits: Array<{ name: string; alias: string; amount: number }>
}

export interface Group {
  id: string
  name: string
  emoji: string
  color: string
  members: GroupMember[]
  expenses: GroupExpense[]
  totalSpent: number   // sum of expenses[].total, updated on each new split
  memberCount: number  // mirrors members.length
}

export interface ExpenseItem {
  name: string
  price: number
  quantity?: number
}

export interface ReceiptData {
  items: ExpenseItem[]
  total: number
  currency?: string
}

export interface SplitResult {
  name: string
  amount: string
}
