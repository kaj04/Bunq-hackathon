# MeditaSplit — Bunq Hackathon

AI-powered group expense splitting for Bunq. Speak naturally ("Split yesterday's beers with Francesco") and the app finds the payment, matches your contacts, calculates the split, and sends Bunq payment requests — all in one shot.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local and fill in your keys (see Environment Variables below)

# 3. Run the dev server
npm run dev
# → http://localhost:3000
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BUNQ_API_KEY` | Bunq sandbox API key. Generate at [sandbox.bunq.com](https://sandbox.bunq.com) → Settings → API Keys. Each key must be **fresh** — reusing a key that had failed auth attempts causes 466 errors. |
| `BUNQ_MOCK` | Set to `true` to skip all Bunq API calls and use local mock data. Required for running test scripts without a live sandbox. |
| `APP_CLAUDE_KEY` | Anthropic API key. Named `APP_CLAUDE_KEY` (not `ANTHROPIC_API_KEY`) to avoid a conflict with the Claude Code CLI, which injects an empty `ANTHROPIC_API_KEY` that Next.js cannot override. |

---

## Running Tests

```bash
# Agent logic tests — no Bunq required, uses mock data
npm run test:agent

# Bunq sandbox integration test — requires a valid BUNQ_API_KEY
npm run test:bunq
```

---

## Seed Fake Transactions (Sandbox)

Populates the sandbox with realistic test payments across the 4 team users:

```bash
npx tsx scripts/seed-transactions.ts
```

---

## Architecture

### State Machine (User Flow)

```
PERCEIVE  →  REASON  →  CONFIRM  →  ACT  →  REPORT
  Voice        Claude      Human      Bunq    Done
  input      tool-use      check    batch    screen
             loop
```

1. **PERCEIVE** — Voice input captured (Web Speech API / Whisper). Produces a `transcript: string`.
2. **REASON** — `POST /api/agent` runs a Claude tool-use loop that calls three tools iteratively until it has enough information to produce a `SplitProposal`.
3. **CONFIRM** — The UI shows the proposal (payment description, total, per-person amounts) with ✅ / ✏️ / ❌. No Bunq call is made yet.
4. **ACT** — On confirmation, `POST /api/bunq/request-batch` sends a single `RequestInquiryBatch` to Bunq — one atomic call for all participants.
5. **REPORT** — Success screen with the payment description.

---

## Project Structure

```
app/
  page.tsx                      # Renders <MeditaSplit /> (main UI)
  dashboard/page.tsx            # Balance + transaction history dashboard
  api/
    agent/route.ts              # ★ Main agentic endpoint — Claude tool-use loop
    bunq/
      request-batch/route.ts   # ★ POST: create RequestInquiryBatch (group split)
      request/route.ts          # POST: single payment request
      balance/route.ts          # GET: account balance
      transactions/route.ts     # GET: recent transactions
      requests/route.ts         # GET: incoming payment requests
      requests/accept/route.ts  # PUT: accept a payment request
      split-group/route.ts      # POST: legacy group split endpoint
      fund/route.ts             # POST: sandbox top-up via sugar user
      contacts/route.ts         # GET: Bunq contacts list
      init/route.ts             # POST: force Bunq session init
    receipt/route.ts            # POST: scan receipt image → structured JSON
    split/route.ts              # POST: simple (non-agentic) split via Claude
    test/route.ts               # GET: full health check
    debug/route.ts              # GET: debug info

components/
  app/MeditaSplit.tsx           # ★ Main UI — dark Bunq-style, groups + voice
  BillSplitter.tsx              # Legacy UI with state machine (kept as reference)
  Dashboard.tsx                 # Balance + transactions view
  layout/Shell.tsx              # App shell / navigation
  groups/GroupsGrid.tsx         # Group list view
  groups/GroupChat.tsx          # Group expense chat view
  expenses/AddExpenseModal.tsx  # Add expense modal
  dashboard/Dashboard.tsx       # Dashboard sub-components

lib/
  bunq/
    client.ts                   # ★ Bunq API client — handshake, all API calls
    session-store.ts            # ★ Session persistence — avoids re-handshake on restart
    payments.ts                 # ★ searchRecentPayments() — paginated, recurring-filtered
    mock-data.ts                # Fake payments + contacts for BUNQ_MOCK=true mode
  claude/
    agent.ts                    # ★ runAgent() — core tool-use loop (date-aware)
    tools.ts                    # ★ Tool definitions + implementations
    vision.ts                   # scanReceipt() — Claude vision for receipt parsing
    prompts.ts                  # Legacy prompt templates

types/
  index.ts                      # Shared types: SplitProposal, AgentResponse, BunqPayment, …
  designer.ts                   # UI-specific types (MeditaSplit components)

scripts/
  test-agent.ts                 # ★ Agent test suite — 8 cases, single + multi-turn
  test-bunq.ts                  # Bunq sandbox integration test
  seed-transactions.ts          # Populates sandbox with fake transactions

voice_nlu.py                    # Python voice NLU prototype (experimental)
```

`★` = actively developed / critical path

---

## The Agent (`/api/agent`)

The core of the app. `POST /api/agent` accepts `{ transcript, history? }` and runs a Claude tool-use loop:

### Tools

| Tool | Input | Output | Notes |
|------|-------|--------|-------|
| `search_recent_payments` | `query: string, days: number` | `BunqPayment[]` | Paginates Bunq API, filters client-side. Recurring payments (Netflix, Spotify, rent…) are automatically excluded. |
| `match_contact` | `name_hint: string` | `{ candidates: [{name, alias, confidence}] }` | Fuzzy match against Bunq contacts. Returns `forceDisambiguate: true` if top two have equal confidence. |
| `compute_split` | `total, participants, exclude_payer?, assignments?` | `{ splits: [{name, amount}] }` | Equal split with rounding correction. Validates sum ≈ total before returning. |

### Response States

```ts
{ state: 'proposal',    proposal: SplitProposal }           // → show confirm UI
{ state: 'needs_input', question: string, history: any[] }  // → show question, loop back
{ state: 'error',       error: string }
```

### Date Awareness

The system prompt is built at runtime and includes today's date and yesterday's date. Claude computes `days` parameters from relative phrases ("ieri" → `days=2`, "settimana scorsa" → `days=10`) and filters results to the intended date when multiple payments are returned.

### Boundary Cases Handled

| Case | Behavior |
|------|----------|
| Multiple payments same day | Lists options, asks user to choose |
| Multiple payments on different days | Filters to the intended date automatically |
| No payment found | Retries with wider window, then asks for clarification |
| Recurring payment requested (Netflix…) | Filtered before Claude sees it; Claude reports not found |
| Contact ambiguous (confidence ≤ 0.85) | Lists candidates with alias, asks to choose |
| Two contacts with identical confidence | `forceDisambiguate: true` — always asks |
| Contact not in Bunq | Claude asks for their email or phone |
| "Ho pagato io" / "I already paid" | Sets `exclude_payer`, payer excluded from split |
| Split sum ≠ total | `compute_split` returns an error; Claude retries |

---

## Bunq Integration

### Session Management

`lib/bunq/session-store.ts` persists the session token to `.bunq-session.json` on disk (TTL: 55 minutes). On restart, the session is restored without re-doing the full RSA handshake. If the session is expired or invalid, it is cleared and a fresh handshake is performed.

### Signing

All Bunq API requests (except `/installation`) are signed with RSA-SHA256:
```
{METHOD} /v1{PATH}\n\n{SORTED_HEADERS}\n\n{BODY}
```

### Key API Calls

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Create group split | `RequestInquiryBatch` | `POST /user/{id}/monetary-account/{id}/request-inquiry-batch` |
| List payments | `Payment.list` | `GET /user/{id}/monetary-account/{id}/payment?count=50` |
| Get balance | `MonetaryAccount.list` | `GET /user/{id}/monetary-account` |
| Accept request | `RequestResponse.update` | `PUT /user/{id}/monetary-account/{id}/request-response/{id}` |

> **Note:** Bunq sandbox does not support server-side payment filtering. All filtering (by keyword, date, recurring exclusion) is done client-side after paginating the full payment list.

---

## What's Working

- [x] Full Bunq sandbox handshake with session persistence
- [x] Claude tool-use agent loop with 3 tools
- [x] Voice input (Web Speech API) → transcript → agent
- [x] Receipt image scanning (Claude Vision) → structured items
- [x] `RequestInquiryBatch` — single atomic call for group splits
- [x] Human-in-the-loop confirm step before any Bunq call
- [x] Multi-turn disambiguation (contact names, ambiguous payments)
- [x] Recurring payment filtering (subscriptions excluded automatically)
- [x] Date-aware search ("ieri", "settimana scorsa" resolved at runtime)
- [x] Payer exclusion ("ho pagato io" → payer not included in split)
- [x] Mock mode (`BUNQ_MOCK=true`) for offline development and testing
- [x] Agent test suite with 8 cases including multi-turn flows
- [x] MeditaSplit UI — dark Bunq-style with groups, dashboard, voice

## What's Missing / Next Steps

- [ ] **Whisper STT integration** — Currently using Web Speech API as a placeholder. The voice component needs to be swapped for the Whisper-based component (friend's branch). Interface: a callback that returns `transcript: string`.
- [ ] **Wire MeditaSplit to `/api/agent`** — The new UI (`components/app/MeditaSplit.tsx`) currently calls the legacy `/api/split` endpoint. It needs to be updated to call `/api/agent` and handle the 3 response states (`proposal`, `needs_input`, `error`).
- [ ] **Real Bunq contacts** — `getBunqContacts()` returns hardcoded test users. Bunq sandbox has no real contact API; for production this would use the user's Bunq address book or a phone contact lookup.
- [ ] **Receipt + voice combined** — Uploading a receipt image and describing it verbally at the same time ("I had the steak and the beer, Francesco had the wine") is designed but not yet wired end-to-end.
- [ ] **Food photo recognition** — Photograph food → automatically match items to receipt lines (stretch goal).
- [ ] **Idempotency check** — Before creating a `RequestInquiry`, check whether an identical open request already exists for the same `(alias, description, amount)` to prevent duplicates.
- [ ] **Real Bunq sandbox validation** — The Bunq integration is fully coded but needs a fresh sandbox API key (previous key had failed auth attempts that caused 466 errors). Run `npm run test:bunq` once a new key is in `.env.local`.

---

## Team

| Name | Ownership |
|------|-----------|
| Francesco | Bunq API client, session management, sandbox setup |
| Giorgio | Agent loop, tools, boundary cases, batch split |
| Vaggelis | Receipt scanning (Claude Vision), API routes |
| Diego | Split logic, Claude prompts, UI |
