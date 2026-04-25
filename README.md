# MeditaSplit

> **From photo to payment in 10 seconds.** AI-powered bill splitting, backed by real Bunq payment requests.

Built at the Bunq Hackathon by Giorgio, Francesco, Vaggelis & Diego.

---

## What it does

MeditaSplit removes the friction from splitting group expenses. You scan a receipt, say who ordered what, and real Bunq payment requests land in everyone's app — no manual entry, no chasing people on WhatsApp.

The core is a conversational AI agent (Claude Sonnet 4.6) that understands natural language across three input modes:

- **📷 Receipt photo** — Claude Vision reads the bill, extracts every item and price, then asks how to split it
- **🎤 Voice** — say "Split last night's sushi with Diego" and the agent finds the exact Bunq transaction automatically
- **⌨️ Text** — full natural language: "Add Vaggelis", "Remove Francesco, he paid separately", "Same split as before"

Every confirmed split sends real payment requests via the Bunq API. Recipients get a push notification and pay with one tap.

---

## Key features

### Agentic tool-use loop
The agent runs up to 8 reasoning turns before responding. It calls two tools:

- `search_payments` — searches your real Bunq transaction history by keyword and date range. If you say "split the drinks from yesterday", it finds the €42 bar charge so you never have to look it up.
- `match_contact` — fuzzy-matches names (Fuse.js, confidence-scored) against group members. "Fran", "Vagge", or a voice transcription error all resolve to the right person.

### Receipt fast lane
Uploaded photos bypass the agentic loop entirely. Claude Vision extracts a structured JSON of items, quantities and prices. The agent then maps natural-language descriptions onto receipt items with semantic matching — "pasta" resolves to "Spaghetti Carbonara", "beer" resolves to "Birra Moretti ×3".

### Interactive widget system
Instead of plain error messages, the agent returns clickable suggestion buttons for every decision point:

- Multiple matching transactions → each shown as a tappable button
- Unknown contact → "Did you mean Giorgio or Francesco?" as buttons
- No payment found → "Enter amount manually" / "Try a different keyword"
- Receipt scanned → "Split equally" / "I'll describe who ordered what"

### Conversational memory
History is persisted per-group in `localStorage`. The agent uses the last 4 exchanges as context, enabling natural follow-ups: "remove him", "same as last time", "change Diego's share to €15".

### Real-time group sync
Chat messages are persisted server-side (JSON store) and polled every 3 seconds. Multiple users in the same group see each other's messages live. Groups and expenses are also server-persisted and survive page refreshes.

### Guardrails
- **Contact resolution blocks everything** — if a named person can't be matched (confidence < 0.60), the agent stops and asks before touching payments or search
- **No amount = no split suggestions** — when no transaction is found and no amount is stated, only "enter manually" options appear; never fabricated alternatives
- **Outgoing-only search** — top-up / incoming transfers are filtered from search results so they never appear as split candidates
- **Double-confirm prevention** — split state is cleared atomically before the Bunq API call; a second click is a no-op
- **Self-payment guard** — if all recipients are the current user after filtering, an error is shown instead of sending a zero-recipient request
- **Non-receipt image detection** — if Vision returns zero items or a zero total, the upload is rejected with a clear message

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| AI | Claude Sonnet 4.6 via Anthropic SDK |
| Banking | Bunq Sandbox API |
| Fuzzy matching | Fuse.js 7 |
| Styling | Tailwind CSS 4 |
| State | React 19, `useState` / `useRef` |
| Persistence | Server-side JSON store + `localStorage` for history |

---

## Project structure

```
app/
  api/
    bunq/          # Balance, transactions, payment requests, split-group
    split/         # Agentic tool-use loop (Claude + search_payments + match_contact)
    receipt/       # Claude Vision receipt parsing
    groups/        # Group CRUD + per-group chat store
components/
  app/             # MeditaSplit — root state and routing
  dashboard/       # Balance card, recent activity, incoming requests
  groups/          # GroupsGrid (create/list) + GroupChat (AI chat + confirm)
  payments/        # QuickPayModal (add expense with category/location/time)
  layout/          # Sidebar, TopBar
lib/
  bunq/            # Bunq API client, payment search, member alias resolution
  claude/          # System prompts: splitAgentSystemPrompt, SPLIT_PROMPT_WITH_RECEIPT
types/             # Shared TypeScript interfaces
```

---

## How the split flow works

```
User input (text / voice / photo)
        │
        ▼
  Receipt? ──yes──▶ SPLIT_PROMPT_WITH_RECEIPT
        │              (direct item assignment, no tools)
        no
        │
        ▼
  splitAgentSystemPrompt + tool-use loop
        │
        ├─ match_contact(name)  →  Fuse.js fuzzy match → confidence score
        │       < 0.60 → STOP, return question + member buttons
        │
        └─ search_payments(query, days)  →  Bunq transaction search
                0 results → STOP, return error + "enter manually" button
                1 result  → use it
                multiple  → best match + alternatives as suggestion buttons
        │
        ▼
  { total, description, splits[], suggestions[] }
        │
        ▼
  GroupChat renders split preview + "Confirm" button
        │
  User taps Confirm
        │
        ▼
  /api/bunq/split-group  →  Bunq payment request per recipient
        │
        ▼
  ✅ Recipients receive Bunq push notification
```

---

## Running locally

**Prerequisites**: Node.js 20+, a Bunq sandbox API key, an Anthropic API key.

```bash
git clone <repo>
cd bunq-hackathon
npm install
```

Create `.env.local`:

```env
BUNQ_API_KEY=your_bunq_sandbox_key
APP_CLAUDE_KEY=your_anthropic_api_key
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first load, two seed groups are created automatically.

---

## Demo scenarios

1. **Receipt scan** — photograph a restaurant bill, tap "Split equally", confirm. Done in under 10 seconds.
2. **Voice + search** — say "Split last night's drinks with Diego". Agent finds the Bunq transaction, proposes the split, you confirm.
3. **Conversational edit** — after a split is proposed: "Add Vaggelis" or "Remove Francesco, he paid separately". Agent redistributes without starting over.
4. **Complex receipt** — scan a multi-item bill, describe by voice who ordered what. Agent handles quantities and partial items.
5. **Trip overview** — open a group to see total spent across all expenses, with every split tracked.

---

*MeditaSplit — because splitting the bill shouldn't take longer than eating.*
