# MeditaSplit — Bunq Hackathon

AI-powered group expense splitting for Bunq. Speak naturally ("Split yesterday's dinner with Giorgio and Diego"), photograph a receipt, or do both at once — the app finds the payment, matches your contacts, calculates the split, and sends Bunq payment requests in one shot.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Fill in BUNQ_API_KEY and APP_CLAUDE_KEY

# 3. (Optional) Run in mock mode — no Bunq account needed
# Set BUNQ_MOCK=true in .env.local

# 4. Start
npm run dev
# → http://localhost:3000
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BUNQ_API_KEY` | Bunq sandbox API key. Generate at [sandbox.bunq.com](https://sandbox.bunq.com) → Settings → API Keys. Each key must be **fresh** — reusing a key that had failed auth attempts causes 466 errors. |
| `BUNQ_MOCK` | Set to `true` to skip all Bunq API calls and use local mock data. Fully functional for development and demos. |
| `APP_CLAUDE_KEY` | Anthropic API key. Named `APP_CLAUDE_KEY` (not `ANTHROPIC_API_KEY`) to avoid a conflict with the Claude Code CLI, which injects an empty `ANTHROPIC_API_KEY` that Next.js cannot override. |

---

## Bunq Session Setup

On first run with a real API key, you need to register the device and create a session. Two options:

**Option A — Browser (recommended)**
```
GET http://localhost:3000/api/bunq/setup
```
Returns a JSON log of every step. Saves `.bunq-device.json` and `.bunq-session.json` on disk.

**Option B — CLI**
```bash
node scripts/bunq-setup.mjs
```

Both do: `POST /installation` → `POST /device-server` → `POST /session-server` → `GET /monetary-account`. Device registration is rate-limited; it is saved to disk and reused for 30 days. Session tokens are refreshed automatically every 55 minutes.

**Top up sandbox balance**
```bash
curl -X POST http://localhost:3000/api/bunq/fund-me
# Requests €500 from Bunq's Sugar Daddy sandbox user
```

**Seed test transactions**
```bash
npx tsx scripts/seed-transactions.ts
```

---

## What's Working

### Core AI Agent
- [x] Claude tool-use loop (`/api/agent`) — 3 tools: `search_recent_payments`, `match_contact`, `compute_split`
- [x] Multi-turn disambiguation — asks clarifying questions when payment or contact is ambiguous
- [x] Date-aware search — "ieri", "settimana scorsa" resolved to exact calendar dates at runtime
- [x] Payer exclusion — "ho pagato io" automatically excludes the payer from the split
- [x] Recurring payment filter — Netflix, Spotify, rent etc. are never surfaced as splittable expenses
- [x] Contact fuzzy matching with confidence thresholds — forces disambiguation when two contacts tie
- [x] Receipt mode (`[RICEVUTA]` prefix) — skips payment search entirely, goes straight to contact matching

### Receipt Flow
- [x] Receipt image upload → Claude Vision → structured bill JSON (`/api/receipt`)
- [x] Full UI flow: `select → scanning → describe → reasoning → review`
- [x] Combined receipt + voice: upload photo, then describe who had what verbally or by text
- [x] Collapsible JSON debug view of scanned receipt items

### Bunq Integration
- [x] Full RSA-SHA256 handshake with session persistence (no re-handshake on restart)
- [x] Device registration separated from session — device lives 30 days, session 55 min
- [x] `RequestInquiryBatch` — single atomic call sends split to all participants at once
- [x] Incoming request acceptance (`PUT /request-response/{id}`)
- [x] Balance, transactions, and incoming requests endpoints
- [x] Sugar Daddy top-up (`/api/bunq/fund-me`)
- [x] Browser-based setup route (`/api/bunq/setup`) with step-by-step log

### UI
- [x] MeditaSplit — dark Bunq-style app with groups, dashboard, voice button
- [x] Groups grid + group chat view
- [x] Add expense modal with full receipt + agent flow
- [x] Dashboard: balance, transaction history, incoming requests with one-tap accept
- [x] Human-in-the-loop confirm step — proposal shown before any Bunq call is made
- [x] Voice input via Web Speech API (transcript → agent)

### Dev & Testing
- [x] `BUNQ_MOCK=true` — full app works offline with realistic fake data
- [x] Mock data: 15 payments with varied dates/categories + 4 recurring (filtered) + 5 contacts incl. Francesca (disambiguation test)
- [x] Agent test suite: `npm run test:agent` — 8 cases including multi-turn flows, no Bunq needed
- [x] Bunq integration test: `npm run test:bunq`

---

## What's Missing

### Blocker for Live Demo
- [ ] **Fresh Bunq sandbox API key** — the main blocker. Current key had failed auth attempts (466 error). Once a new key is in `.env.local`, run `/api/bunq/setup` in the browser and everything else should work. No code changes needed.

### Real API Integration Gaps
- [ ] **Real member aliases** — `resolveMemberAliases()` fetches live email aliases from the Bunq API for each team member's `userId`. This works when a session is active, but the `userId` values in `SANDBOX_USERS` (`lib/bunq/client.ts`) may need updating after the new API key is used. Once live, `GET /api/bunq/members` will return real aliases and the UI will use them automatically.
- [ ] **Transaction ownership** — `getTransactions()` returns payments but doesn't tag which came from group splits vs. personal payments. Filtering by `RequestInquiryBatch.id` would let us show split history per group.
- [ ] **Session expiry handling in the UI** — if the 55-min session expires mid-demo, the UI shows a generic error. Fix: catch 401/403 from any Bunq call, call `POST /api/bunq/init` silently, retry once.

### Features Not Yet Built
- [ ] **Whisper STT** — currently using Web Speech API (browser-only, no transcription quality control). `app/api/voice/route.ts` exists but is not wired to the mic button in `AddExpenseModal.tsx`. Interface: mic button → WAV blob → `POST /api/voice` → `{ transcript: string }` → pass to agent.
- [ ] **Idempotency guard** — before firing `RequestInquiryBatch`, check whether an identical open request already exists for `(alias, description, amount)` to prevent accidental duplicates.

---

## Next Steps — Full API Integration

Priority order for getting to a working live demo:

**1. Get a fresh Bunq sandbox API key**
- Create new key at sandbox.bunq.com → Settings → API Keys
- Put it in `.env.local` as `BUNQ_API_KEY`, set `BUNQ_MOCK=false`
- Hit `GET http://localhost:3000/api/bunq/setup` in the browser — check the JSON log
- Then `POST /api/bunq/fund-me` to top up balance

**2. Seed live transactions**
```bash
npx tsx scripts/seed-transactions.ts
```
Creates 15 realistic payments across the 4 sandbox users, giving the agent real data to search against.

**3. Verify member alias resolution**
- Hit `GET /api/bunq/members` — should return real `@bunq.com` emails for all 4 users
- If any `userId` doesn't resolve, update `SANDBOX_USERS` in `lib/bunq/client.ts` with the correct IDs from the Bunq sandbox dashboard

**4. End-to-end agent test**
```bash
npm run test:bunq
```
Then test in the UI: "Split yesterday's pizza with Giorgio and Diego"

**5. Wire Whisper mic button** *(stretch)*
- In `AddExpenseModal.tsx`, replace the Web Speech API handler in `handleMicButton` with: `POST /api/voice` with the audio blob → use returned `transcript`
- `app/api/voice/route.ts` needs the Whisper call implemented (currently a stub)

**6. Session auto-refresh** *(polish)*
- In `lib/bunq/client.ts`, wrap `bunqReq` to catch HTTP 401/403, call `_createSession()`, and retry once automatically

---

## Architecture

### User Flow

```
PERCEIVE  →  REASON  →  CONFIRM  →  ACT  →  REPORT
  Voice/       Claude      Human      Bunq    Done
  Photo       tool-use      check    batch    screen
  input        loop
```

1. **PERCEIVE** — Voice (Web Speech API) or receipt photo. Produces `transcript: string` or `ReceiptData` items list.
2. **REASON** — `POST /api/agent` runs a Claude tool-use loop calling three tools iteratively until a `SplitProposal` is ready or it needs more input.
3. **CONFIRM** — UI shows proposal (payment, total, per-person amounts) with ✅ / ✏️ / ❌. No Bunq call yet.
4. **ACT** — On confirm, `POST /api/bunq/split-group` fires a single `RequestInquiryBatch`.
5. **REPORT** — Success screen with batch ID.

### Agent Tools

| Tool | Purpose | Key logic |
|------|---------|-----------|
| `search_recent_payments` | Find the expense being split | Paginates Bunq, filters recurring (Netflix, Spotify, rent…), filters by keyword + date window |
| `match_contact` | Resolve a name to a Bunq alias | Fuzzy match against contacts; forces clarification when confidence ≤ 0.85 or two candidates tie |
| `compute_split` | Calculate per-person amounts | Equal split with rounding correction; validates sum ≈ total |

### Agent Response States

```ts
{ state: 'proposal',    proposal: SplitProposal }           // → show confirm UI
{ state: 'needs_input', question: string, history: any[] }  // → show question, loop back
{ state: 'error',       error: string }
```

---

## Project Structure

```
app/
  page.tsx                      # Renders <MeditaSplit /> (main UI shell)
  dashboard/page.tsx            # Standalone balance + history page
  api/
    agent/route.ts              # ★ Claude tool-use loop — main AI endpoint
    receipt/route.ts            # ★ POST: image → ReceiptData (Claude Vision)
    voice/route.ts              # POST: audio blob → transcript (Whisper — not yet wired)
    bunq/
      setup/route.ts            # GET: full device+session setup with step log
      split-group/route.ts      # ★ POST: create RequestInquiryBatch
      fund-me/route.ts          # POST: top up balance via Sugar Daddy
      members/route.ts          # GET: resolve real email aliases for all team members
      payment/route.ts          # POST: direct payment (personal expense)
      balance/route.ts          # GET: account balance
      transactions/route.ts     # GET: recent transactions
      requests/route.ts         # GET: incoming payment requests
      requests/accept/route.ts  # PUT: accept a payment request
      fund/route.ts             # POST: legacy fund endpoint
      init/route.ts             # POST: force session init
      contacts/route.ts         # GET: contacts list

components/
  app/MeditaSplit.tsx           # ★ Main UI shell — groups, dashboard, voice
  expenses/AddExpenseModal.tsx  # ★ Add expense — receipt + agent flow
  groups/GroupsGrid.tsx         # Group list
  groups/GroupChat.tsx          # Group expense history
  dashboard/Dashboard.tsx       # Balance, transactions, accept requests
  layout/Shell.tsx              # Sidebar + top bar

lib/
  bunq/
    client.ts                   # ★ All Bunq API calls + session management
    session-store.ts            # ★ Disk persistence — device (30d) + session (55min)
    payments.ts                 # ★ searchRecentPayments() — paginated, recurring-filtered
    mock-data.ts                # Fake payments + contacts for BUNQ_MOCK=true
  claude/
    agent.ts                    # ★ runAgent() — tool-use loop, date-aware, receipt mode
    tools.ts                    # ★ Tool definitions + implementations
    vision.ts                   # scanReceipt() — Claude Vision for receipt parsing
    prompts.ts                  # Prompt templates (legacy)

types/
  index.ts                      # SplitProposal, AgentResponse, BunqPayment, …
  designer.ts                   # UI types: Group, GroupMember, GroupExpense, …

scripts/
  test-agent.ts                 # Agent test suite — 8 cases, mock Bunq
  test-bunq.ts                  # Bunq sandbox integration test
  seed-transactions.ts          # Populate sandbox with fake transactions
  bunq-setup.mjs                # CLI alternative to /api/bunq/setup
```

`★` = critical path

---

## Edge Cases Handled

| Case | Behavior |
|------|----------|
| Multiple payments same day | Lists them, asks user to choose |
| Multiple payments across different days | Auto-filters to the intended date |
| No payment found | Retries with wider window, then tells user |
| Recurring payment (Netflix, rent…) | Excluded before Claude sees it |
| Contact confidence ≤ 0.85 | Lists candidates with alias, asks to choose |
| Two contacts with identical confidence | `forceDisambiguate: true` — always asks |
| Contact not in Bunq | Asks for email or phone |
| "Ho pagato io" | Sets `exclude_payer` — payer excluded from split |
| Split sum ≠ total | `compute_split` errors; Claude fixes inputs and retries |
| Bunq session expired | `initBunq()` creates new session, device registration untouched |
| Receipt scanned | `[RICEVUTA]` prefix skips payment search entirely |

---

## Team

| Name | Ownership |
|------|-----------|
| Francesco | Bunq API client, device/session management, sandbox setup |
| Giorgio | Agent loop, tools, edge cases, mock data, architecture |
| Vaggelis | Receipt scanning (Claude Vision), API routes |
| Diego | Split logic, Claude prompts, UI shell |
