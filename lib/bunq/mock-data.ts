// Fake payment data for BUNQ_MOCK=true mode.
// Dates are computed at runtime so "ieri" / "settimana scorsa" always resolve correctly.

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export const MOCK_PAYMENTS = [
  // ── Yesterday (daysAgo(1)) ────────────────────────────────────────────────
  {
    id: 1001,
    description: 'Bar Centrale - birre',
    amount: { value: '25.00', currency: 'EUR' },
    created: daysAgo(1),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Bar Centrale' },
  },
  {
    id: 1002,
    description: 'Pizzeria da Mario',
    amount: { value: '48.50', currency: 'EUR' },
    created: daysAgo(1),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Pizzeria da Mario' },
  },
  {
    id: 1003,
    description: 'Taxi Uber - aeroporto',
    amount: { value: '34.00', currency: 'EUR' },
    created: daysAgo(1),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Uber' },
  },
  {
    id: 1004,
    description: 'Starbucks coffee',
    amount: { value: '12.50', currency: 'EUR' },
    created: daysAgo(1),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Starbucks' },
  },

  // ── 2 days ago ────────────────────────────────────────────────────────────
  {
    id: 1005,
    description: 'Cena Osteria del Porto',
    amount: { value: '92.00', currency: 'EUR' },
    created: daysAgo(2),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Osteria del Porto' },
  },
  {
    id: 1006,
    description: 'Brunch Café Roma',
    amount: { value: '35.00', currency: 'EUR' },
    created: daysAgo(2),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Café Roma' },
  },

  // ── 3 days ago — two payments same day (ambiguous date test) ──────────────
  {
    id: 1007,
    description: 'Aperitivo Spritz Bar',
    amount: { value: '18.00', currency: 'EUR' },
    created: daysAgo(3),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Spritz Bar' },
  },
  {
    id: 1008,
    description: 'Aperitivo Bar Sport',
    amount: { value: '22.00', currency: 'EUR' },
    created: daysAgo(3),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Bar Sport' },
  },

  // ── 4 days ago ────────────────────────────────────────────────────────────
  {
    id: 1009,
    description: 'Supermercato Esselunga',
    amount: { value: '67.30', currency: 'EUR' },
    created: daysAgo(4),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Esselunga' },
  },
  {
    id: 1010,
    description: 'Hackathon lunch - De Balie',
    amount: { value: '42.00', currency: 'EUR' },
    created: daysAgo(4),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'De Balie' },
  },

  // ── 5 days ago ────────────────────────────────────────────────────────────
  {
    id: 1011,
    description: 'Sushi restaurant Yoshimi',
    amount: { value: '78.00', currency: 'EUR' },
    created: daysAgo(5),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Yoshimi Sushi' },
  },
  {
    id: 1012,
    description: 'Bowling The Alley',
    amount: { value: '40.00', currency: 'EUR' },
    created: daysAgo(5),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'The Alley Bowling' },
  },

  // ── 6 days ago ────────────────────────────────────────────────────────────
  {
    id: 1013,
    description: 'The Irish Pub - drinks',
    amount: { value: '55.00', currency: 'EUR' },
    created: daysAgo(6),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'The Irish Pub' },
  },

  // ── 7 days ago ────────────────────────────────────────────────────────────
  {
    id: 1014,
    description: 'Cena ristorante La Pergola',
    amount: { value: '120.00', currency: 'EUR' },
    created: daysAgo(7),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'La Pergola' },
  },
  {
    id: 1015,
    description: 'Grocery Jumbo supermarkt',
    amount: { value: '53.80', currency: 'EUR' },
    created: daysAgo(7),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Jumbo' },
  },

  // ── Should be FILTERED (recurring / direct debit) ─────────────────────────
  {
    id: 2001,
    description: 'Netflix subscription',
    amount: { value: '15.99', currency: 'EUR' },
    created: daysAgo(0),
    type: 'DIRECT_DEBIT',
    counterparty_alias: { display_name: 'Netflix' },
  },
  {
    id: 2002,
    description: 'Spotify Premium abbonamento',
    amount: { value: '9.99', currency: 'EUR' },
    created: daysAgo(0),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Spotify' },
  },
  {
    id: 2003,
    description: 'Affitto mensile aprile',
    amount: { value: '850.00', currency: 'EUR' },
    created: daysAgo(2),
    type: 'DIRECT_DEBIT',
    counterparty_alias: { display_name: 'Agenzia Immobiliare' },
  },
  {
    id: 2004,
    description: 'Amazon Prime abbonamento annuale',
    amount: { value: '49.90', currency: 'EUR' },
    created: daysAgo(1),
    type: 'DIRECT_DEBIT',
    counterparty_alias: { display_name: 'Amazon' },
  },
]

// Contacts — includes Francesca alongside Francesco for disambiguation testing
export const MOCK_CONTACTS = [
  { name: 'Francesco', alias: 'test+4a19be6a-58e5-4cc3-ac92-244caa863359@bunq.com' },
  { name: 'Francesca', alias: 'francesca@sandbox.com' },
  { name: 'Giorgio',   alias: 'giorgio@sandbox.com' },
  { name: 'Vaggelis',  alias: 'vaggelis@sandbox.com' },
  { name: 'Diego',     alias: 'diego@sandbox.com' },
]
