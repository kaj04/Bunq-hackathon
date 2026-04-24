// Fake payment data for BUNQ_MOCK=true mode.
// Dates are computed at runtime so "ieri" / "settimana scorsa" always resolve correctly.

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export const MOCK_PAYMENTS = [
  // ── Should be FOUND by the agent ─────────────────────────────────────────
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
    description: 'Cena Osteria del Porto',
    amount: { value: '92.00', currency: 'EUR' },
    created: daysAgo(2),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Osteria del Porto' },
  },
  {
    id: 1004,
    description: 'Aperitivo Spritz Bar',
    amount: { value: '18.00', currency: 'EUR' },
    created: daysAgo(3),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Spritz Bar' },
  },
  {
    id: 1005,
    description: 'Taxi Uber aeroporto',
    amount: { value: '34.00', currency: 'EUR' },
    created: daysAgo(1),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Uber' },
  },
  {
    id: 1006,
    description: 'Supermercato Esselunga',
    amount: { value: '67.30', currency: 'EUR' },
    created: daysAgo(4),
    type: 'PAYMENT',
    counterparty_alias: { display_name: 'Esselunga' },
  },
  // ── Should be FILTERED (recurring) ───────────────────────────────────────
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
    description: 'Affitto mensile',
    amount: { value: '850.00', currency: 'EUR' },
    created: daysAgo(2),
    type: 'DIRECT_DEBIT',
    counterparty_alias: { display_name: 'Agenzia Immobiliare' },
  },
]

export const MOCK_CONTACTS = [
  { name: 'Francesco', alias: 'francesco@example.com' },
  { name: 'Giorgio',   alias: 'giorgio@example.com' },
  { name: 'Vaggelis',  alias: 'vaggelis@example.com' },
  { name: 'Diego',     alias: 'diego@example.com' },
]
