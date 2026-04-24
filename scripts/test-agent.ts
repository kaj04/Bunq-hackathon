/**
 * Test script per l'agente — usa dati mock, non richiede Bunq sandbox attivo.
 * Esegui con:  npm run test:agent
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
process.env.BUNQ_MOCK = 'true'

import { runAgent } from '../lib/claude/agent'
import type { AgentResponse, SplitProposal } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function printProposal(p: SplitProposal) {
  console.log('→ PROPOSAL ✅')
  console.log(`  Pagamento: ${p.paymentDescription}`)
  console.log(`  Totale:    €${p.total.toFixed(2)}`)
  for (const s of p.splits) {
    console.log(`    • ${s.participant.name.padEnd(12)} €${s.amount.toFixed(2)}  (${s.participant.bunqAlias})`)
  }
}

async function runSingle(label: string, transcript: string) {
  console.log(`\n${'─'.repeat(60)}\n${label}`)
  console.log(`Transcript: "${transcript}"\n${'─'.repeat(60)}`)
  try {
    const result = await runAgent(transcript)
    if (result.state === 'proposal') {
      printProposal(result.proposal)
    } else if (result.state === 'needs_input') {
      console.log('→ NEEDS INPUT 💬')
      console.log(`  Domanda: "${result.question}"`)
    } else {
      console.log(`→ ERROR ❌  ${result.error}`)
    }
  } catch (err) {
    console.log(`→ EXCEPTION ❌  ${err}`)
  }
}

// Simulates a back-and-forth disambiguation conversation.
// turns[0] = initial transcript, turns[1..] = user answers to Claude's questions.
// maxTurns caps the loop as a safety net for tests.
async function runMultiTurn(label: string, turns: string[], maxTurns = 5) {
  console.log(`\n${'─'.repeat(60)}\n${label}\n${'─'.repeat(60)}`)
  let history: any[] | undefined
  const allTurns = [...turns]
  let i = 0
  while (i < maxTurns) {
    const transcript = allTurns[i] ?? '(no answer scripted)'
    console.log(`Turn ${i + 1}: "${transcript}"`)
    try {
      const result: AgentResponse = await runAgent(transcript, history)
      if (result.state === 'proposal') {
        printProposal(result.proposal)
        return
      } else if (result.state === 'needs_input') {
        console.log(`  → NEEDS INPUT: "${result.question.slice(0, 120).replace(/\n/g, ' ')}…"`)
        history = result.history
        i++
      } else {
        console.log(`  → ERROR ❌  ${result.error}`)
        return
      }
    } catch (err) {
      console.log(`  → EXCEPTION ❌  ${err}`)
      return
    }
  }
  console.log('  ⚠️  Raggiunto maxTurns senza PROPOSAL')
}

// ── Test cases ────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Agent Test Suite ===')
  console.log(`BUNQ_MOCK: ${process.env.BUNQ_MOCK}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('⚠️  ANTHROPIC_API_KEY mancante nel .env.local')
    process.exit(1)
  }

  // ── Single-turn ──────────────────────────────────────────────────────────
  await runSingle(
    '✅ Caso base — birre di ieri con Francesco',
    'Dividi le birre di ieri con Francesco',
  )
  await runSingle(
    '✅ Cena con più persone',
    'Dividi la cena di ieri con Francesco, Vaggelis e Diego',
  )
  await runSingle(
    '✅ Ho pagato io — escludi il pagante',
    'Ho pagato io il taxi ieri, dividilo con Francesco e Giorgio',
  )
  await runSingle(
    '❌ Nessun risultato — pagamento inesistente',
    'Dividi il pranzo sushi di ieri con Francesco',
  )
  await runSingle(
    '❌ Ricorrenti filtrati — Netflix',
    'Dividi Netflix con Francesco',
  )

  // ── Multi-turn ───────────────────────────────────────────────────────────
  await runMultiTurn(
    '💬 Disambiguazione pagamento — query vaga → utente specifica → sceglie',
    [
      'Dividi il pagamento di ieri con Francesco',
      'Le birre al bar',
      'Il primo, Bar Centrale',  // 3° turno se Claude presenta ancora opzioni
    ],
  )
  await runMultiTurn(
    '💬 Disambiguazione contatto — nome parziale → utente chiarisce',
    [
      'Dividi le birre di ieri con Fra',  // "Fra" ha confidence < 1.0 verso Francesco
      'Francesco',
    ],
  )
  await runMultiTurn(
    '💬 Contatto non trovato — utente fornisce alias',
    [
      'Dividi le birre di ieri con Matteo',
      'Il suo alias è matteo.rossi@bunq.com',
    ],
  )

  console.log(`\n${'═'.repeat(60)}\nDone.`)
}

main().catch(console.error)
