// ─── Shared types — tutti leggono, nessuno modifica senza avvisare il team ───

export type ReceiptItem = {
  name: string
  price: number
  quantity: number
}

export type Receipt = {
  items: ReceiptItem[]
  total: number
  currency: string
}

export type Participant = {
  name: string
  bunqAlias?: string // email o numero di telefono su Bunq
}

export type SplitResult = {
  participant: Participant
  amount: number
  items: ReceiptItem[]
}

export type PaymentRequest = {
  recipientAlias: string
  amount: number
  currency: string
  description: string
}

export type BunqContact = {
  name: string
  alias: string
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }
