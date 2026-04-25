/**
 * Test connessione Bunq sandbox reale — NON usa mock.
 * Verifica: handshake, lista pagamenti, creazione request inquiry.
 *
 * Esegui con:  npm run test:bunq
 * ⚠️  Attendi che il rate limit sandbox sia scaduto prima di runnare.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
// Assicuriamoci che BUNQ_MOCK sia disabilitato
delete process.env.BUNQ_MOCK

import { initBunq, getBunqSession, createGroupSplit } from '../lib/bunq/client'
import { searchRecentPayments } from '../lib/bunq/payments'

async function main() {
  console.log('=== Bunq Sandbox Test ===\n')

  if (!process.env.BUNQ_API_KEY) {
    console.error('⚠️  BUNQ_API_KEY mancante nel .env.local')
    process.exit(1)
  }

  // ── 1. Handshake ────────────────────────────────────────────────────────
  console.log('1. Inizializzo sessione Bunq...')
  try {
    await initBunq()
    const { userId, accountId } = await getBunqSession()
    console.log(`   ✅ Sessione attiva — userId: ${userId}, accountId: ${accountId}`)
  } catch (err) {
    console.error(`   ❌ Handshake fallito: ${err}`)
    console.error('   💡 Se vedi 429, aspetta qualche minuto e riprova.')
    process.exit(1)
  }

  // ── 2. Lista pagamenti recenti ───────────────────────────────────────────
  console.log('\n2. Cerco pagamenti recenti (ultimi 30 giorni)...')
  try {
    // Usa query molto ampia per vedere tutti i pagamenti non ricorrenti
    const payments = await searchRecentPayments('a|e|i|o|u', 30)
    if (payments.length === 0) {
      console.log('   ⚠️  Nessun pagamento trovato. Hai già girato il seed script?')
      console.log('   → npx tsx scripts/seed-transactions.ts')
    } else {
      console.log(`   ✅ Trovati ${payments.length} pagamenti:`)
      payments.slice(0, 8).forEach(p => {
        const date = p.created.slice(0, 10)
        console.log(`      ${date}  €${p.amount.value.padStart(7)}  ${p.description}`)
      })
      if (payments.length > 8) console.log(`      … e altri ${payments.length - 8}`)
    }
  } catch (err) {
    console.error(`   ❌ Lista pagamenti fallita: ${err}`)
  }

  // ── 3. Test RequestInquiryBatch ─────────────────────────────────────────
  console.log('\n3. Test RequestInquiryBatch (€0.01 x2 verso sandbox users)...')
  try {
    const result = await createGroupSplit([
      {
        recipientAlias: 'sugardaddy@bunq.com',  // Bunq sandbox magic alias — sempre disponibile
        amount: 0.01,
        currency: 'EUR',
        description: 'test-batch-split-1',
      },
      {
        recipientAlias: 'sugardaddy@bunq.com',
        amount: 0.01,
        currency: 'EUR',
        description: 'test-batch-split-2',
      },
    ])
    const batchId = result?.Response?.[0]?.RequestInquiryBatch?.id
    console.log(`   ✅ Batch creato — id: ${batchId ?? 'n/a'}`)
    console.log('   💡 Controlla su https://sandbox.bunq.com i pending requests')
  } catch (err) {
    console.error(`   ❌ Batch fallito: ${err}`)
  }

  console.log('\n═══════════════════════════════════\nDone.')
}

main().catch(console.error)
