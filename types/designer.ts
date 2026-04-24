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

export interface Group {
  id: string
  name: string
  emoji: string
  color: string
  totalSpent: number
  memberCount: number
  members: string[]
}

export interface ExpenseItem {
  name: string
  price: number
}

export interface ReceiptData {
  items: ExpenseItem[]
  total: number
}

export interface SplitResult {
  name: string
  amount: string
}
