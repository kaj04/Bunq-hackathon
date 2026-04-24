"""
MeditaSplit — Voice NLU Module
Pipeline: audio bytes → Groq Whisper STT → Claude tool_use NLU → SplitIntent JSON

Exposes a single public coroutine:
    async def understand_voice(audio_bytes, contacts, payments, speaker_name) -> SplitIntent
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
from datetime import date, timedelta
from typing import Any, Literal, Optional

import anthropic
import groq
from dotenv import load_dotenv

# Load .env.local from the same directory as this file so keys don't need
# to be set manually in the shell every session
load_dotenv(os.path.join(os.path.dirname(__file__), ".env.local"))
from pydantic import BaseModel, Field
from rapidfuzz import fuzz, process as rf_process

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════════════════
# Pydantic schemas — all I/O is validated through these
# ══════════════════════════════════════════════════════════════════════════════


class Contact(BaseModel):
    name: str
    email: str
    phone: str


class Payment(BaseModel):
    id: int
    amount: float
    description: str
    date: str           # ISO-8601 YYYY-MM-DD
    counterparty: str


class MatchedParticipant(BaseModel):
    name: str
    email: str
    phone: str
    confidence: float = Field(ge=0.0, le=1.0)


class Split(BaseModel):
    name: str
    email: str
    owes: float           # final amount owed, rounded to 2 decimal places
    quantity: Optional[float] = None  # units consumed if quantity-based split
    item: Optional[str] = None        # item label if item-based split


class SplitIntent(BaseModel):
    action: Literal["split_existing_payment", "split_new_amount", "split_receipt"]
    amount: Optional[float] = None
    currency: Optional[str] = None
    matched_payments: list[Payment] = Field(default_factory=list)
    participants: list[MatchedParticipant] = Field(default_factory=list)
    splits: list[Split] = Field(default_factory=list)
    description: str
    time_reference: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    include_speaker: bool = True
    clarification_needed: Optional[str] = None
    transcript: Optional[str] = None
    # 16-hex SHA-256 digest; lets the orchestrator deduplicate retried requests
    intent_hash: str


# ══════════════════════════════════════════════════════════════════════════════
# Claude tool definition
# tool_choice={"type":"tool"} forces exactly one tool_use block — no free text
# ══════════════════════════════════════════════════════════════════════════════

_EXTRACT_INTENT_TOOL: dict[str, Any] = {
    "name": "extract_split_intent",
    "description": (
        "Parse a bill-splitting voice transcript and emit structured intent. "
        "You MUST call this tool — never respond with plain text."
    ),
    "input_schema": {
        "type": "object",
        "required": ["action", "raw_participants", "description", "confidence"],
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "split_existing_payment",
                    "split_new_amount",
                    "split_receipt",
                ],
                "description": (
                    "split_existing_payment: user refers to a past payment by date/desc; "
                    "split_new_amount: user states an explicit amount to divide; "
                    "split_receipt: user wants to split a physical/photo receipt"
                ),
            },
            "amount": {
                "type": ["number", "null"],
                "description": "Explicit monetary amount if stated, else null",
            },
            "currency": {
                "type": ["string", "null"],
                "description": "3-letter ISO currency code inferred from context, else null",
            },
            "participant_shares": {
                "type": "array",
                "description": "One entry per co-payer (exclude the speaker)",
                "items": {
                    "type": "object",
                    "required": ["name"],
                    "properties": {
                        "name": {"type": "string"},
                        "quantity": {
                            "type": ["number", "null"],
                            "description": "Units consumed, e.g. 3 beers. Null = equal share.",
                        },
                        "item": {
                            "type": ["string", "null"],
                            "description": "Specific item if different from others, e.g. 'beer A'.",
                        },
                        "explicit_amount": {
                            "type": ["number", "null"],
                            "description": "Known monetary amount for this person if stated.",
                        },
                    },
                },
            },
            "speaker_share": {
                "type": "object",
                "description": "The speaker's own share when quantities or items differ (omit for equal splits)",
                "properties": {
                    "quantity": {"type": ["number", "null"]},
                    "item": {"type": ["string", "null"]},
                    "explicit_amount": {"type": ["number", "null"]},
                },
            },
            "description": {
                "type": "string",
                "description": "Short label for what is being split, e.g. 'beers', 'dinner'",
            },
            "time_reference": {
                "type": ["string", "null"],
                "description": "Temporal phrase from the transcript, e.g. 'yesterday', 'last night'",
            },
            "time_of_day": {
                "type": ["string", "null"],
                "enum": ["morning", "afternoon", "evening", "night", None],
                "description": (
                    "Time-of-day filter if the user scopes the request, e.g. "
                    "'evening expenses' → 'evening', 'morning coffee' → 'morning'. "
                    "Null means the whole day."
                ),
            },
            "include_speaker": {
                "type": "boolean",
                "description": (
                    "Whether the speaker is included in the split. "
                    "False when they say 'for them', 'don't include me', 'I paid for'. "
                    "True (default) when they say 'between us', 'split with me'."
                ),
            },
            "confidence": {
                "type": "number",
                "description": "Model confidence that it understood the intent correctly (0.0–1.0)",
            },
        },
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# Step 1 — Groq Whisper transcription
# ══════════════════════════════════════════════════════════════════════════════


async def _transcribe_audio(audio_bytes: bytes) -> str:
    """
    whisper-large-v3-turbo on Groq: ~216× realtime, ideal for short voice memos.
    Returns empty string on timeout so the caller can surface a user-friendly error
    rather than crashing the pipeline.
    """
    client = groq.AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    print(f"[Groq] Sending {len(audio_bytes):,} bytes to Whisper...", flush=True)
    try:
        response = await client.audio.transcriptions.create(
            # Groq accepts a (filename, bytes, mimetype) tuple as the file arg
            file=("audio.wav", audio_bytes, "audio/wav"),
            model="whisper-large-v3-turbo",
            response_format="text",
            language="en",
        )
        print("[Groq] Transcription received.", flush=True)
        # response_format="text" returns a bare str, not a Transcription object
        text = response if isinstance(response, str) else response.text
        return text.strip()
    except groq.APITimeoutError:
        logger.warning("Groq transcription timed out — returning empty transcript")
        return ""
    except groq.APIError as exc:
        logger.error("Groq API error during transcription: %s", exc)
        raise


# ══════════════════════════════════════════════════════════════════════════════
# Step 2 — Claude tool_use NLU
# ══════════════════════════════════════════════════════════════════════════════


async def _extract_nlu(
    transcript: str,
    payments: list[Payment],
    speaker_name: str,
) -> dict[str, Any]:
    """
    Forces Claude to emit exactly one tool_use block via tool_choice={"type":"tool"}.
    This eliminates any chance of unstructured free-text leaking into the pipeline.
    Payment history is injected so Claude can reason about 'yesterday's beers'.
    """
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    # Cap at 20 payments to avoid ballooning the context window
    payment_ctx = json.dumps([p.model_dump() for p in payments[:20]], indent=2)

    system = (
        f"You are a payment-splitting assistant helping {speaker_name}. "
        "Parse the voice transcript and call extract_split_intent with all fields. "
        f"Today's date is {date.today().isoformat()}.\n\n"
        f"Recent payments for reference:\n{payment_ctx}"
    )

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        tools=[_EXTRACT_INTENT_TOOL],
        # Forcing the tool prevents any free-text fallback
        tool_choice={"type": "tool", "name": "extract_split_intent"},
        system=system,
        messages=[{"role": "user", "content": transcript}],
    )

    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            return block.input  # type: ignore[return-value]

    # Defensive: tool_choice=forced makes this unreachable in practice
    raise RuntimeError("Claude response contained no tool_use block despite forced tool_choice")


# ══════════════════════════════════════════════════════════════════════════════
# Step 3 — Contact matching with rapidfuzz
# ══════════════════════════════════════════════════════════════════════════════

_CONTACT_THRESHOLD = 85  # rapidfuzz scores 0–100; 85 → 0.85 confidence minimum


def _match_contacts(
    raw_names: list[str],
    contacts: list[Contact],
) -> tuple[list[MatchedParticipant], list[str]]:
    """
    token_sort_ratio handles transposed name parts:
    "Francesco Rossi" matches "Rossi Francesco" at ~100%.

    Returns (resolved_participants, unresolved_descriptions).
    Unresolved entries include the best near-miss so the clarification prompt
    can show the user what we almost matched.
    """
    contact_names = [c.name for c in contacts]
    resolved: list[MatchedParticipant] = []
    unresolved: list[str] = []

    for raw in raw_names:
        result = rf_process.extractOne(raw, contact_names, scorer=fuzz.token_sort_ratio)

        if result is None:
            unresolved.append(raw)
            continue

        best_name, score, idx = result
        if score >= _CONTACT_THRESHOLD:
            c = contacts[idx]
            resolved.append(
                MatchedParticipant(
                    name=c.name,
                    email=c.email,
                    phone=c.phone,
                    confidence=round(score / 100, 4),
                )
            )
        else:
            # Include the near-miss in the clarification prompt so the user can confirm
            unresolved.append(f"'{raw}' (closest match: '{best_name}', {score:.0f}%)")

    return resolved, unresolved


# ══════════════════════════════════════════════════════════════════════════════
# Step 4 — Payment matching
# ══════════════════════════════════════════════════════════════════════════════

# Maps spoken time phrases → day offsets from today
_TIME_OFFSETS: dict[str, int] = {
    "today": 0,
    "this morning": 0,
    "tonight": 0,
    "yesterday": 1,
    "last night": 1,
    "two days ago": 2,
    "this week": 6,
    "last week": 7,
}


def _resolve_date(time_reference: Optional[str]) -> Optional[date]:
    """Converts a spoken time phrase to a calendar date for payment filtering."""
    if not time_reference:
        return None
    ref = time_reference.lower().strip()
    offset = _TIME_OFFSETS.get(ref)
    if offset is not None:
        return date.today() - timedelta(days=offset)
    try:
        return date.fromisoformat(ref)  # handles explicit dates if Claude emits them
    except ValueError:
        return None


# Keywords that signal each time of day, matched against payment descriptions
_TIME_OF_DAY_KEYWORDS: dict[str, list[str]] = {
    "morning":   ["breakfast", "coffee", "brunch", "croissant", "morning"],
    "afternoon": ["lunch", "brunch", "sandwich", "afternoon"],
    "evening":   ["dinner", "drinks", "beers", "beer", "bar", "cocktail", "wine",
                  "restaurant", "bistro", "evening", "aperitivo"],
    "night":     ["drinks", "beers", "bar", "cocktail", "club", "night", "party"],
}


def _matches_time_of_day(description: str, time_of_day: str) -> bool:
    """Returns True if the payment description contains a keyword for the given time of day."""
    keywords = _TIME_OF_DAY_KEYWORDS.get(time_of_day, [])
    desc_lower = description.lower()
    return any(kw in desc_lower for kw in keywords)


def _match_payments(
    time_reference: Optional[str],
    description_keywords: str,
    payments: list[Payment],
    time_of_day: Optional[str] = None,
) -> list[Payment]:
    """
    Scores each payment on two independent signals, returns the top 3.

    Date signal  (0–50 pts): exact date = 50, ±1 day = 25, >7 days = skip entirely.
    Description  (0–50 pts): token_set_ratio × 0.5 handles partial keyword matches
                             e.g. 'beers' vs 'Beers at Bar Noord'.

    When time_of_day is set (e.g. 'evening'), payments whose description doesn't
    contain an evening keyword are excluded — so "yesterday's evening expenses"
    keeps dinner/drinks but drops lunch or morning coffee.
    """
    target_date = _resolve_date(time_reference)
    scored: list[tuple[Payment, float]] = []

    for p in payments:
        # Drop payments that don't match the requested time of day
        if time_of_day and not _matches_time_of_day(p.description, time_of_day):
            continue

        score = 0.0

        if target_date:
            try:
                pay_date = date.fromisoformat(p.date)
                delta = abs((pay_date - target_date).days)
                if delta == 0:
                    score += 50.0
                else:
                    # When the user names a date ("yesterday"), only exact matches
                    # qualify — skip anything on a different day entirely
                    continue
            except ValueError:
                pass  # malformed date in cache — fall through to description match

        desc_score = fuzz.token_set_ratio(description_keywords, p.description)
        score += desc_score * 0.5

        if score > 15:  # ignore payments with no meaningful overlap
            scored.append((p, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [p for p, _ in scored[:3]]


# ══════════════════════════════════════════════════════════════════════════════
# Step 5 — Idempotency hash
# ══════════════════════════════════════════════════════════════════════════════


def _compute_intent_hash(
    action: str,
    amount: Optional[float],
    participants: list[MatchedParticipant],
    description: str,
) -> str:
    """
    Deterministic 16-hex SHA-256 digest over canonical intent fields.
    Participant list is sorted so {"Alice","Bob"} == {"Bob","Alice"}.
    Lets the orchestrator skip duplicate payment-request creation on retries.
    """
    canonical = {
        "action": action,
        "amount": amount,
        "participants": sorted(p.name for p in participants),
        "description": description.lower().strip(),
    }
    raw = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()[:16]


# ══════════════════════════════════════════════════════════════════════════════
# Public API
# ══════════════════════════════════════════════════════════════════════════════


async def understand_voice(
    audio_bytes: bytes,
    contacts: list[dict],
    payments: list[dict],
    speaker_name: str,
) -> SplitIntent:
    """
    Full pipeline: audio → transcript → NLU → contact/payment resolution → SplitIntent.

    Args:
        audio_bytes:  Raw audio data (WAV, MP3, M4A — anything Whisper accepts).
        contacts:     List of dicts conforming to the Contact schema.
        payments:     Recent cached payments conforming to the Payment schema.
        speaker_name: Display name of the authenticated user (used in Claude prompt).

    Returns:
        SplitIntent. Always returns a valid object — errors surface via confidence=0
        and a clarification_needed message rather than raising exceptions to the caller.
    """
    # Validate inputs eagerly so downstream code can assume correct types
    parsed_contacts = [Contact(**c) for c in contacts]
    parsed_payments = [Payment(**p) for p in payments]

    # ── Guard: no audio ──────────────────────────────────────────────────────
    if not audio_bytes:
        return _error_intent("No audio data provided.")

    # ── 1. Transcribe ────────────────────────────────────────────────────────
    transcript = await _transcribe_audio(audio_bytes)
    if not transcript:
        return _error_intent(
            "Could not transcribe audio. Please speak clearly and try again."
        )
    logger.info("Transcript: %r", transcript)

    # ── 2. NLU via Claude ────────────────────────────────────────────────────
    nlu = await _extract_nlu(transcript, parsed_payments, speaker_name)

    action: str = nlu["action"]
    participant_shares: list[dict] = nlu.get("participant_shares") or []
    speaker_share: dict = nlu.get("speaker_share") or {}
    description: str = nlu.get("description") or ""
    time_reference: Optional[str] = nlu.get("time_reference")
    time_of_day: Optional[str] = nlu.get("time_of_day")
    include_speaker: bool = bool(nlu.get("include_speaker", True))
    amount: Optional[float] = nlu.get("amount")
    currency: Optional[str] = nlu.get("currency")
    claude_conf: float = float(nlu.get("confidence") or 0.5)

    # ── 3. Contact matching ──────────────────────────────────────────────────
    raw_names = [ps["name"] for ps in participant_shares]
    matched_participants, unresolved = _match_contacts(raw_names, parsed_contacts)

    # ── 4. Payment matching ──────────────────────────────────────────────────
    matched_payments = _match_payments(time_reference, description, parsed_payments, time_of_day)

    # ── 5. Confidence + clarification ────────────────────────────────────────
    # Penalise for unresolved contacts and missing payment when one was expected
    contact_penalty = 0.15 * len(unresolved)
    payment_penalty = (
        0.10
        if action == "split_existing_payment" and not matched_payments
        else 0.0
    )
    overall_confidence = max(0.0, min(1.0, claude_conf - contact_penalty - payment_penalty))

    clarification: Optional[str] = None
    if unresolved:
        # Show the near-miss info we captured during matching
        known = ", ".join(c.name for c in parsed_contacts[:5])
        clarification = (
            f"I couldn't identify: {'; '.join(unresolved)}. "
            f"Did you mean one of: {known}?"
        )
    elif overall_confidence < 0.75:
        participant_str = (
            ", ".join(p.name for p in matched_participants) or "someone"
        )
        clarification = (
            f"Did you want to split '{description}' with {participant_str}?"
        )

    # ── 6. Idempotency hash ──────────────────────────────────────────────────
    intent_hash = _compute_intent_hash(action, amount, matched_participants, description)

    # For existing payments, sum the matched ones (filtered by date + time_of_day).
    # For explicit amounts ("split 25 euros"), use what Claude extracted.
    if action == "split_existing_payment" and matched_payments:
        total = round(sum(p.amount for p in matched_payments), 2)
        amount = total
    else:
        total = amount

    splits: list[Split] = []
    if total and matched_participants:
        # Build a lookup from matched contact name → share metadata from NLU
        share_by_name = {ps["name"].lower(): ps for ps in participant_shares}

        # Detect split mode: explicit amounts > quantities > equal
        has_explicit = any(ps.get("explicit_amount") for ps in participant_shares)
        has_quantities = any(ps.get("quantity") for ps in participant_shares)

        if has_explicit:
            # Each person's amount was stated directly ("Francesco owes 15")
            for p in matched_participants:
                ps = share_by_name.get(p.name.lower(), {})
                owes = round(float(ps.get("explicit_amount") or 0), 2)
                splits.append(Split(name=p.name, email=p.email, owes=owes,
                                    item=ps.get("item")))

        elif has_quantities:
            # Proportional by units consumed ("Giorgio got 1, Francesco got 3")
            participant_qtys = {
                ps["name"].lower(): float(ps.get("quantity") or 1)
                for ps in participant_shares
            }
            speaker_qty = float(speaker_share.get("quantity") or 1) if include_speaker else 0.0
            total_units = sum(participant_qtys.values()) + speaker_qty

            for p in matched_participants:
                ps = share_by_name.get(p.name.lower(), {})
                qty = participant_qtys.get(p.name.lower(), 1.0)
                owes = round(total * qty / total_units, 2)
                splits.append(Split(name=p.name, email=p.email, owes=owes,
                                    quantity=qty, item=ps.get("item")))

        else:
            # Equal split among everyone
            headcount = len(matched_participants) + (1 if include_speaker else 0)
            per_person = round(total / headcount, 2)
            splits = [
                Split(name=p.name, email=p.email, owes=per_person)
                for p in matched_participants
            ]

    return SplitIntent(
        action=action,  # type: ignore[arg-type]
        amount=amount,
        currency=currency,
        matched_payments=matched_payments,
        participants=matched_participants,
        splits=splits,
        description=description,
        time_reference=time_reference,
        confidence=round(overall_confidence, 4),
        include_speaker=include_speaker,
        clarification_needed=clarification,
        transcript=transcript,
        intent_hash=intent_hash,
    )


def _error_intent(reason: str) -> SplitIntent:
    """Returns a zero-confidence SplitIntent for hard errors (no audio, empty transcript)."""
    return SplitIntent(
        action="split_new_amount",
        amount=None,
        currency=None,
        matched_payments=[],
        participants=[],
        description="",
        time_reference=None,
        confidence=0.0,
        clarification_needed=reason,
        intent_hash=_compute_intent_hash("split_new_amount", None, [], ""),
    )


# ══════════════════════════════════════════════════════════════════════════════
# Sample fixtures — realistic contacts and payment history for testing
# ══════════════════════════════════════════════════════════════════════════════

SAMPLE_CONTACTS = [
    {"name": "Francesco",    "email": "francesco@example.com", "phone": "+31611111111"},
    {"name": "Giorgio",       "email": "maria@example.com",     "phone": "+31622222222"},
    {"name": "Vaggelis",       "email": "jan@example.com",       "phone": "+31633333333"},
    {"name": "Diego","email": "sophie@example.com",    "phone": "+31644444444"},
    {"name": "Luca Bianchi",       "email": "luca@example.com",      "phone": "+31655555555"},
    {"name": "Emma Bakker",        "email": "emma@example.com",      "phone": "+31666666666"},
    {"name": "Nora Jansen",        "email": "nora@example.com",      "phone": "+31688888888"},
]

# Payments span the last two weeks — varied types to test keyword + date matching
SAMPLE_PAYMENTS = [
    {"id": 1,  "amount": 42.50,  "description": "Beers at Bar Noord",             "date": (date.today() - timedelta(days=1)).isoformat(),  "counterparty": "Bar Noord"},
    {"id": 2,  "amount": 24.00,  "description": "Taxi home after bar",            "date": (date.today() - timedelta(days=1)).isoformat(),  "counterparty": "Uber"},
    {"id": 3,  "amount": 18.30,  "description": "Lunch at FEBO",                  "date": (date.today() - timedelta(days=2)).isoformat(),  "counterparty": "FEBO"},
    {"id": 4,  "amount": 120.00, "description": "Dinner at La Piazza",            "date": (date.today() - timedelta(days=3)).isoformat(),  "counterparty": "La Piazza"},
    {"id": 5,  "amount": 67.40,  "description": "Groceries Albert Heijn",         "date": (date.today() - timedelta(days=3)).isoformat(),  "counterparty": "Albert Heijn"},
    {"id": 6,  "amount": 32.00,  "description": "Cinema Eye Filmmuseum tickets",  "date": (date.today() - timedelta(days=4)).isoformat(),  "counterparty": "Eye Filmmuseum"},
    {"id": 7,  "amount": 45.80,  "description": "Pizza delivery Dominos",         "date": (date.today() - timedelta(days=5)).isoformat(),  "counterparty": "Dominos"},
    {"id": 8,  "amount": 78.00,  "description": "Cocktails at Door 74",           "date": (date.today() - timedelta(days=7)).isoformat(),  "counterparty": "Door 74"},
    {"id": 9,  "amount": 22.50,  "description": "Breakfast Scandinavian Embassy", "date": (date.today() - timedelta(days=7)).isoformat(),  "counterparty": "Scandinavian Embassy"},
    {"id": 10, "amount": 250.00, "description": "Airbnb deposit weekend trip",    "date": (date.today() - timedelta(days=10)).isoformat(), "counterparty": "Airbnb"},
    {"id": 11, "amount": 18.75,  "description": "Coffee STROM cafe",              "date": date.today().isoformat(),                        "counterparty": "STROM"},
    {"id": 12, "amount": 31.20,  "description": "Train tickets NS Amsterdam",     "date": date.today().isoformat(),                        "counterparty": "NS"},
]


# ══════════════════════════════════════════════════════════════════════════════
# Voice recording helper — VAD-based, stops on silence
# Requires: pip install sounddevice   (not needed for mock mode)
# ══════════════════════════════════════════════════════════════════════════════

def record_voice(
    silence_duration: float = 3.0,
    silence_threshold: int = 600,
    max_duration: int = 30,
    sample_rate: int = 16000,
) -> bytes:
    """
    Records from the default microphone using voice activity detection.
    Starts capturing immediately, stops automatically after `silence_duration`
    seconds of quiet. Hard cap at `max_duration` seconds.

    silence_threshold: RMS amplitude below which audio counts as silence.
    600 works well for a typical laptop mic in a quiet room; raise to 1200+
    if it stops too eagerly in a noisy environment.
    """
    try:
        import io
        import wave
        import numpy as np
        import sounddevice as sd
    except ImportError:
        raise ImportError(
            "sounddevice is required for live recording.\n"
            "Install it with:  pip install sounddevice"
        )

    chunk_ms = 100                                      # process in 100 ms chunks
    chunk_size = int(sample_rate * chunk_ms / 1000)
    silence_chunks_needed = int(silence_duration * 1000 / chunk_ms)
    max_chunks = int(max_duration * 1000 / chunk_ms)

    frames: list = []
    silent_chunks = [0]   # mutable container so the callback closure can write to it
    has_speech = [False]

    def _callback(indata, _frames, _time, _status):
        rms = int(np.sqrt(np.mean(indata.astype(np.float32) ** 2)))
        frames.append(indata.copy())
        if rms >= silence_threshold:
            has_speech[0] = True
            silent_chunks[0] = 0
        elif has_speech[0]:
            silent_chunks[0] += 1

    print("[REC] Listening... (stops after 3s of silence)", flush=True)
    with sd.InputStream(
        samplerate=sample_rate,
        channels=1,
        dtype="int16",
        blocksize=chunk_size,
        callback=_callback,
    ):
        while True:
            sd.sleep(chunk_ms)
            if has_speech[0] and silent_chunks[0] >= silence_chunks_needed:
                break
            if len(frames) >= max_chunks:
                print("[REC] Max duration reached.", flush=True)
                break

    # Trim the trailing silence so Whisper doesn't waste time on dead air
    trim = min(silence_chunks_needed, len(frames))
    audio_frames = frames[:-trim] if trim and len(frames) > trim else frames

    if not audio_frames:
        return b""

    audio = np.concatenate(audio_frames, axis=0)
    print(f"[REC] Done. ({len(audio) / sample_rate:.1f}s captured)", flush=True)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio.tobytes())
    return buf.getvalue()


# ══════════════════════════════════════════════════════════════════════════════
# CLI entry point
#
# Mock mode  (no API keys needed):
#   python voice_nlu.py
#
# Live mode  (needs GROQ_API_KEY + ANTHROPIC_API_KEY):
#   python voice_nlu.py --live
#   python voice_nlu.py --live --duration 8   # record for 8 seconds
#   python voice_nlu.py --live --file audio.wav  # use an existing WAV file
#
# Example voice prompts to try:
#   "Split yesterday's beers with Francesco"
#   "Split the dinner from three days ago with Sophie and Luca"
#   "Split 25 euros for pizza with Maria and Jan"
#   "Split last week's cocktails with Diego and Emma"
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    import sys
    from unittest.mock import AsyncMock, patch

    parser = argparse.ArgumentParser(description="MeditaSplit Voice NLU")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Use real APIs + mic recording instead of mock data",
    )
    parser.add_argument(
        "--silence",
        type=float,
        default=3.0,
        help="Seconds of silence that trigger end of recording (default: 3.0)",
    )
    parser.add_argument(
        "--max-duration",
        type=int,
        default=30,
        help="Hard cap on recording length in seconds (default: 30)",
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=600,
        help="Silence RMS threshold 0-32767 — raise in noisy rooms (default: 600)",
    )
    parser.add_argument(
        "--file",
        type=str,
        default=None,
        help="Path to a WAV/MP3 file to use instead of recording (live mode only)",
    )
    parser.add_argument(
        "--speaker",
        type=str,
        default="Alice",
        help="Your name, passed to Claude as context (default: Alice)",
    )
    # ── Batch mode args (used by /api/voice Next.js route) ───────────────────
    parser.add_argument("--batch", action="store_true",
                        help="Non-interactive mode: reads audio/contacts/payments from files, writes output JSON")
    parser.add_argument("--audio-file",    type=str, help="Path to audio file (batch mode)")
    parser.add_argument("--contacts-file", type=str, help="Path to contacts JSON file (batch mode)")
    parser.add_argument("--payments-file", type=str, help="Path to payments JSON file (batch mode)")
    parser.add_argument("--output",        type=str, help="Output JSON file path (batch mode)")
    args = parser.parse_args()

    # ── Mock mode ────────────────────────────────────────────────────────────
    MOCK_TRANSCRIPT = "Split yesterday's beers with Francesco"
    MOCK_NLU = {
        "action": "split_existing_payment",
        "amount": None,
        "currency": "EUR",
        "participant_shares": [
            {"name": "Francesco", "quantity": None, "item": None, "explicit_amount": None},
        ],
        "speaker_share": {"quantity": None, "item": None},
        "description": "beers",
        "time_reference": "yesterday",
        "confidence": 0.92,
        "include_speaker": True,
    }

    async def _run_mock() -> None:
        with (
            patch("__main__._transcribe_audio", new=AsyncMock(return_value=MOCK_TRANSCRIPT)),
            patch("__main__._extract_nlu",      new=AsyncMock(return_value=MOCK_NLU)),
        ):
            intent = await understand_voice(
                audio_bytes=b"<mock_audio_bytes>",
                contacts=SAMPLE_CONTACTS,
                payments=SAMPLE_PAYMENTS,
                speaker_name=args.speaker,
            )
        _print_and_save(intent, transcript=MOCK_TRANSCRIPT, mode="MOCK")

    # ── Live mode ────────────────────────────────────────────────────────────
    async def _run_live() -> None:
        if args.file:
            with open(args.file, "rb") as fh:
                audio_bytes = fh.read()
            print(f"[FILE] Loaded {len(audio_bytes):,} bytes from {args.file}")
        else:
            audio_bytes = record_voice(
                silence_duration=args.silence,
                silence_threshold=args.threshold,
                max_duration=args.max_duration,
            )

        intent = await understand_voice(
            audio_bytes=audio_bytes,
            contacts=SAMPLE_CONTACTS,
            payments=SAMPLE_PAYMENTS,
            speaker_name=args.speaker,
        )
        _print_and_save(intent, transcript="(from audio)", mode="LIVE")

    # ── Shared output ────────────────────────────────────────────────────────
    def _print_and_save(intent: SplitIntent, transcript: str, mode: str) -> None:
        output = intent.model_dump()
        sep = "=" * 55
        print(sep)
        print(f"  MeditaSplit Voice NLU -- {mode}")
        print(sep)
        print(f"  Transcript : {transcript!r}")
        print(f"  Speaker    : {args.speaker}")
        print(sep)
        print(json.dumps(output, indent=2))

        out_path = "split_intent_output.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(output, fh, indent=2)
        print(f"\n  Output written to {out_path}")
        print(sep)

    import sys
    import traceback

    # Python's default ProactorEventLoop on Windows doesn't work well with
    # some async HTTP clients (httpx/groq). SelectorEventLoop fixes this.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    async def _run_live_safe() -> None:
        print("[1/3] Keys loaded:", bool(os.getenv("GROQ_API_KEY")), bool(os.getenv("ANTHROPIC_API_KEY")))
        print("[2/3] Sending audio to Groq Whisper...")
        try:
            await _run_live()
        except Exception:
            traceback.print_exc()

    # ── Batch mode — called by Next.js /api/voice via subprocess ─────────────
    async def _run_batch() -> None:
        if not args.audio_file:
            print(json.dumps({"error": "--audio-file is required in batch mode"}))
            sys.exit(1)

        with open(args.audio_file, "rb") as fh:
            audio_bytes = fh.read()

        contacts = (
            json.loads(open(args.contacts_file, encoding="utf-8").read())
            if args.contacts_file else SAMPLE_CONTACTS
        )
        payments = (
            json.loads(open(args.payments_file, encoding="utf-8").read())
            if args.payments_file else []
        )

        intent = await understand_voice(
            audio_bytes=audio_bytes,
            contacts=contacts,
            payments=payments,
            speaker_name=args.speaker or "User",
        )

        out_path = args.output or "split_intent_output.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(intent.model_dump(), fh, indent=2)

    if args.batch:
        asyncio.run(_run_batch())
    elif args.live:
        asyncio.run(_run_live_safe())
    else:
        asyncio.run(_run_mock())
