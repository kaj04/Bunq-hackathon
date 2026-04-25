// Fake payment data for BUNQ_MOCK=true mode.
// Schema mirrors the official Bunq API Payment object so mock and real paths are interchangeable.
// Docs: https://doc.bunq.com/#/payment

const GIORGIO_ACCOUNT_ID = 3629276
const GIORGIO_IBAN = 'NL88BUNQ2025042600001'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(12, 0, 0, 0) // noon — stays in the correct calendar day regardless of timezone
  return d.toISOString()
}

// Balance starts at 1000 and decreases per entry (for balance_after_mutation)
function balanceAfter(remaining: number) {
  return { value: remaining.toFixed(2), currency: 'EUR' }
}

export const MOCK_PAYMENTS = [
  // ── Today ──────────────────────────────────────────────────────────────────
  {
    id: 1000,
    created: daysAgo(0),
    updated: daysAgo(0),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '22.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Lot Sixty One Coffee', type: 'IBAN' },
    description: 'Breakfast coffee - Lot Sixty One',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(978.00),
  },
  {
    id: 1001,
    created: daysAgo(0),
    updated: daysAgo(0),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '61.50', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Foodhallen Amsterdam', type: 'IBAN' },
    description: 'Lunch Foodhallen - bitterballen and beers group',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(916.50),
  },

  // ── Yesterday ───────────────────────────────────────────────────────────────
  {
    id: 1002,
    created: daysAgo(1),
    updated: daysAgo(1),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '25.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Bar Centrale', type: 'IBAN' },
    description: 'Drinks and beers Bar Centrale',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(891.50),
  },
  {
    id: 1003,
    created: daysAgo(1),
    updated: daysAgo(1),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '96.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Pizzeria da Mario', type: 'IBAN' },
    description: 'Pizza dinner da Mario - group of 4',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(795.50),
  },
  {
    id: 1004,
    created: daysAgo(1),
    updated: daysAgo(1),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '34.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Uber', type: 'IBAN' },
    description: 'Taxi Uber shared airport ride',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(761.50),
  },
  {
    id: 1005,
    created: daysAgo(1),
    updated: daysAgo(1),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '18.50', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Starbucks', type: 'IBAN' },
    description: 'Starbucks coffee round for team',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(743.00),
  },

  // ── 2 days ago ──────────────────────────────────────────────────────────────
  {
    id: 1006,
    created: daysAgo(2),
    updated: daysAgo(2),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '92.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Osteria del Porto', type: 'IBAN' },
    description: 'Dinner Osteria del Porto group',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(651.00),
  },
  {
    id: 1007,
    created: daysAgo(2),
    updated: daysAgo(2),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '35.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Café Roma', type: 'IBAN' },
    description: 'Brunch Café Roma',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(616.00),
  },
  {
    id: 1008,
    created: daysAgo(2),
    updated: daysAgo(2),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '28.40', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Dirck III Slijterij', type: 'IBAN' },
    description: 'Wine and snacks Dirck III grocery',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(587.60),
  },

  // ── 3 days ago — two same-day (ambiguous date test) ─────────────────────────
  {
    id: 1009,
    created: daysAgo(3),
    updated: daysAgo(3),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '18.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Spritz Bar', type: 'IBAN' },
    description: 'Aperitivo spritz cocktails Spritz Bar',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(569.60),
  },
  {
    id: 1010,
    created: daysAgo(3),
    updated: daysAgo(3),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '32.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Bar Sport', type: 'IBAN' },
    description: 'Aperitivo negroni x4 Bar Sport',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(537.60),
  },

  // ── 4 days ago ──────────────────────────────────────────────────────────────
  {
    id: 1011,
    created: daysAgo(4),
    updated: daysAgo(4),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '67.30', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Esselunga', type: 'IBAN' },
    description: 'Grocery weekly shopping Esselunga',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(470.30),
  },
  {
    id: 1012,
    created: daysAgo(4),
    updated: daysAgo(4),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '54.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'De Balie', type: 'IBAN' },
    description: 'Hackathon lunch De Balie team',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(416.30),
  },
  {
    id: 1013,
    created: daysAgo(4),
    updated: daysAgo(4),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '41.60', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'NS Nederlandse Spoorwegen', type: 'IBAN' },
    description: 'Train tickets Amsterdam Utrecht group travel',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(374.70),
  },

  // ── 5 days ago ──────────────────────────────────────────────────────────────
  {
    id: 1014,
    created: daysAgo(5),
    updated: daysAgo(5),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '78.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Yoshimi Sushi', type: 'IBAN' },
    description: 'Sushi dinner Yoshimi restaurant',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(296.70),
  },
  {
    id: 1015,
    created: daysAgo(5),
    updated: daysAgo(5),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '48.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'The Alley Bowling', type: 'IBAN' },
    description: 'Bowling The Alley shoe rental included',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(248.70),
  },

  // ── 6 days ago ──────────────────────────────────────────────────────────────
  {
    id: 1016,
    created: daysAgo(6),
    updated: daysAgo(6),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '55.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'The Irish Pub', type: 'IBAN' },
    description: 'Drinks round The Irish Pub evening',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(193.70),
  },
  {
    id: 1017,
    created: daysAgo(6),
    updated: daysAgo(6),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '210.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Airbnb', type: 'IBAN' },
    description: 'Airbnb apartment 2 nights group stay',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(-16.30),
  },

  // ── 7 days ago ──────────────────────────────────────────────────────────────
  {
    id: 1018,
    created: daysAgo(7),
    updated: daysAgo(7),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '120.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'La Pergola', type: 'IBAN' },
    description: 'Dinner La Pergola restaurant group',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(-136.30),
  },
  {
    id: 1019,
    created: daysAgo(7),
    updated: daysAgo(7),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '53.80', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Jumbo', type: 'IBAN' },
    description: 'Grocery Jumbo supermarkt weekly',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(-190.10),
  },

  // ── Filtered by isRecurring (DIRECT_DEBIT or keyword match) ─────────────────
  {
    id: 2001,
    created: daysAgo(0),
    updated: daysAgo(0),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '15.99', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Netflix', type: 'IBAN' },
    description: 'Netflix subscription',
    type: 'DIRECT_DEBIT',
    balance_after_mutation: balanceAfter(962.01),
  },
  {
    id: 2002,
    created: daysAgo(0),
    updated: daysAgo(0),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '9.99', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Spotify', type: 'IBAN' },
    description: 'Spotify Premium abbonamento',
    type: 'PAYMENT',
    balance_after_mutation: balanceAfter(952.02),
  },
  {
    id: 2003,
    created: daysAgo(2),
    updated: daysAgo(2),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '850.00', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Agenzia Immobiliare', type: 'IBAN' },
    description: 'Affitto mensile aprile',
    type: 'DIRECT_DEBIT',
    balance_after_mutation: balanceAfter(102.02),
  },
  {
    id: 2004,
    created: daysAgo(1),
    updated: daysAgo(1),
    monetary_account_id: GIORGIO_ACCOUNT_ID,
    amount: { value: '49.90', currency: 'EUR' },
    alias: { display_name: 'Giorgio', iban: GIORGIO_IBAN, type: 'IBAN' },
    counterparty_alias: { display_name: 'Amazon', type: 'IBAN' },
    description: 'Amazon Prime abbonamento annuale',
    type: 'DIRECT_DEBIT',
    balance_after_mutation: balanceAfter(52.12),
  },
]

// Contacts
export const MOCK_CONTACTS = [
  { name: 'Vaggelis',  alias: 'test+438e4ee5-c088-45e5-8dbc-ed42fc4db3f5@bunq.com' },
  { name: 'Francesco', alias: 'test+f58943b1-e202-441a-8c39-9589d1f2e3ef@bunq.com' },
  { name: 'Diego',     alias: 'test+5dc812cc-6992-4af1-8f28-1dc23e53abf2@bunq.com' },
  { name: 'Giorgio',   alias: 'test+3b8908fa-ed86-4b1b-9416-d6cc83473b88@bunq.com' },
]
