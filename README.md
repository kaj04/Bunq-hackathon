# MeditaSplit — Bunq Hackathon 2026

> AI-powered group expense splitting, built natively on the Bunq sandbox API.

MeditaSplit lets friends split shared expenses through a **conversational AI interface**: just say or type what you spent, and the app figures out the split, sends real payment requests via Bunq, and keeps everyone in sync — across devices, in real time.

---

## What it does

- **AI-driven splitting** — describe an expense in natural language ("Split €80 dinner between Giorgio and Matteo") or upload a photo of the receipt. Claude AI parses the request and proposes an exact split.
- **Real Bunq payment requests** — confirmed splits trigger real `request-inquiry-batch` calls to the Bunq sandbox API. Recipients see a pending request in their dashboard and can accept with one click.
- **Group chat per group** — each group has a shared chat synced across all members in real time (3-second polling). Messages show the sender's name and are persisted server-side.
- **Multi-user, multi-device** — multiple users can run the app simultaneously on different ports. Groups, members, and chat history are shared via server-side JSON files on a common host.
- **Receipt scanning** — attach a photo of a receipt and Claude Vision extracts the items and totals automatically.
- **Sugar Daddy top-ups** — sandbox accounts can be funded instantly via Bunq's Sugar Daddy mechanism, directly from the dashboard.
- **Incoming payment requests** — the home dashboard shows pending requests from other users with one-click acceptance.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| UI | React, Tailwind CSS, Lucide icons |
| AI | Anthropic Claude (`claude-sonnet-4-6`) — chat parsing, receipt OCR, split logic |
| Payments | Bunq Sandbox API — `request-inquiry-batch`, `payment`, `request-response` |
| Persistence | Server-side JSON files (`groups-store.json`, `chat-store.json`) |
| Auth | RSA-2048 signed requests per Bunq's installation flow |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js Server                       │
│                                                         │
│  /api/bunq/*        →  Bunq Sandbox API (real calls)    │
│  /api/split         →  Claude AI (parse & split)        │
│  /api/groups        →  groups-store.json (shared state) │
│  /api/groups/[id]/chat  →  chat-store.json              │
└─────────────────────────────────────────────────────────┘
         ▲                        ▲
         │                        │
   Vaggelis @ :3000         Matteo @ :3001
   (localhost browser)      (localhost browser)
```

All user instances run on the **same machine** on different ports. They share the same filesystem, so `groups-store.json` and `chat-store.json` act as a lightweight real-time database — groups created by one user appear for all others within 5 seconds.

---

## Key flows

### 1. Creating a group and splitting an expense

1. User creates a group and adds members by name (auto-resolved from `bunq-members.json`) or by email.
2. User types in the group chat: *"Split last night's €120 dinner equally between Matteo and Vaggelis"*
3. Claude parses the request, identifies participants and amounts, and proposes a split.
4. User confirms → app calls `POST /api/bunq/split-group` → Bunq `request-inquiry-batch` is created.
5. Each recipient sees the request in their **Incoming Requests** panel and can accept it.

### 2. Multi-user sync

- Groups polled every **5 seconds** — new groups, member changes, and deletions propagate automatically.
- Chat polled every **3 seconds** — messages from other users appear with their name label.
- Group deletion removes both the group and its chat history across all instances instantly.

### 3. Receipt scanning

1. User taps the camera icon in the group chat.
2. Photo is sent to Claude Vision via `/api/split`.
3. Claude extracts line items and total, proposes a split, and presents it for confirmation.

---

## Running locally

### Prerequisites

- Node.js 18+
- A `.env.local` file with:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### Install

```bash
git clone https://github.com/kaj04/Bunq-hackathon
cd Bunq-hackathon
npm install
```

### Create sandbox accounts

Each user needs a Bunq sandbox account. Run once per person:

```bash
node scripts/bunq-setup.mjs Vaggelis
node scripts/bunq-setup.mjs Matteo
```

This registers a real Bunq sandbox user, saves credentials to `.bunq-accounts.json`, and updates `bunq-members.json` with the user's sandbox email.

Commit and push so teammates can access all accounts:

```bash
git add .bunq-accounts.json bunq-members.json
git commit -m "Add sandbox accounts"
git push
```

### Run multiple users simultaneously

Open one terminal per user:

```bash
# Terminal 1
node scripts/bunq-run.mjs Vaggelis 3000

# Terminal 2
node scripts/bunq-run.mjs Matteo 3001
```

Open `http://localhost:3000` (Vaggelis) and `http://localhost:3001` (Matteo) in separate browser tabs.

For **multi-device testing** over a local network, find the server machine's LAN IP (`ipconfig` / `ifconfig`) and open `http://<LAN-IP>:<port>` on the second device.

---

## Project structure

```
├── app/
│   ├── api/
│   │   ├── bunq/          # Bunq API wrappers (balance, payments, splits, requests)
│   │   ├── groups/        # Group CRUD + chat persistence
│   │   └── split/         # Claude AI split logic
│   └── page.tsx
├── components/
│   ├── app/               # MeditaSplit root component
│   ├── dashboard/         # Home dashboard (balance, transactions, requests)
│   ├── groups/            # GroupsGrid + GroupChat
│   ├── expenses/          # AddExpenseModal
│   ├── payments/          # QuickPayModal
│   └── layout/            # Sidebar, TopBar
├── lib/
│   ├── bunq/              # Bunq client (RSA signing, session management, API calls)
│   └── claude/            # AI prompts and split parsing
├── scripts/
│   ├── bunq-setup.mjs     # Create a new sandbox account
│   ├── bunq-run.mjs       # Start Next.js as a specific user
│   └── bunq-switch.mjs    # Switch the active session
├── types/
│   └── designer.ts        # Shared TypeScript types
├── bunq-members.json      # Public registry: name → email mapping
└── .bunq-accounts.json    # Private credentials (sandbox only, safe to share in private repo)
```

---

## Sandbox accounts included

| Name | Bunq sandbox email |
|------|--------------------|
| Vaggelis | `test+bc8a4a53-f49f-46f9-9ec4-fd3da0e1ee46@bunq.com` |
| Matteo | `test+b8b93987-598b-4bd7-bbee-3ec8fac7343f@bunq.com` |

> Additional accounts can be created at any time with `node scripts/bunq-setup.mjs <Name>`.

---

## Team

Built at the Bunq Hackathon 2026.
