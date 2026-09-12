# Dispute-resolution recommender (Agent 3) — design

**Status:** scoped, ready for an implementation plan
**Sub-project D of:** `2026-09-12-msme-platform-extension-overview.md` — read that file first.
**Owns:** backend + frontend + the RAG/legal-corpus boundary (teammate's side, per `ARCHITECTURE.md` §4)
**Depends on:** Sub-project A (needs the per-agreement thread's message history to ground its recommendations); ideally the real `/legal-corpus` retrieval piece from `ARCHITECTURE.md` §6.4 — this spec degrades gracefully if that isn't ready yet, see Error Handling

## Problem, and the line this must not cross

`ARCHITECTURE.md` §2 and §6.4 already scoped a monitoring/dispute agent:
it watches for signs of conflict and recommends concrete next steps to
the MSME owner, **grounded in retrieved legal text, never free-generated
opinion**, with an explicit honesty statement about its own confidence
and limits. That agent was never built (§9's build order stops at
"agreement executed"; "Not built yet" is `README.md`'s own honest status
for it).

The bigger pitch discussed later added: the AI actively follows up with
the reporting user for an explanation, gives recommendations for a
"friendly" resolution, and **the resulting back-and-forth becomes a live
negotiation between both parties, mediated by the AI, escalating only if
unresolved.** That crosses a real line — an AI actively brokering a
negotiation over money and an alleged contract breach between two
businesses is a materially bigger legal-liability step than "here's a
suggestion, go talk to a lawyer," and was explicitly flagged as such (see
the overview, Part 2, reason 4).

**This spec builds the version that delivers the same underlying value —
help the MSME de-escalate and resolve a dispute fairly and cheaply —
without the AI ever being the one who negotiates.** The rule this spec
enforces throughout:

> **The AI drafts. A human sends.** Every message the AI produces that
> could be construed as a negotiating position is shown to the MSME owner
> as a suggestion; the owner decides whether to send it, edit it, or
> ignore it, into the existing per-agreement thread (Sub-project A) using
> their own voice. The AI is never a participant in the thread itself —
> it only ever talks *to the owner*, about the thread.

## Decisions

1. **Trigger: the owner reports a dispute explicitly**, they don't get auto-flagged by passive monitoring — matches the original pitch's "user reports it to the AI model" framing, and is far simpler and lower-risk than continuous passive monitoring of every message for conflict signals (which `ARCHITECTURE.md` §2 describes as the eventual goal but was never built, and this spec doesn't attempt that larger, harder version either — see Out of Scope).
2. **Input the AI reasons over:** the anchored contract's text (from `db.getContract`), the full message history of that agreement's thread (Sub-project A — this is exactly why D depends on A), and the owner's own explanation of what went wrong (collected via a short follow-up, matching "the ai would need an explanation from the user" from the original pitch).
3. **Grounding requirement, non-negotiable, carried forward verbatim from `ARCHITECTURE.md` §6.4:** every recommendation must cite something actually retrieved from `/legal-corpus`, never freely generated. If retrieval returns nothing relevant, the honest response is "I don't have grounded guidance for this specific situation" — not a plausible-sounding but ungrounded suggestion. This is a hard behavioral requirement on the prompt/output-shaping layer, not a nice-to-have.
4. **Output shape:** a structured recommendation (matching `ARCHITECTURE.md` §6.4's existing schema almost exactly) **plus, new in this spec, an optional drafted message** the owner could choose to send into the thread — this is the "friendly resolution" / "propose solutions" part of the original pitch, delivered as a draft, not an autonomous send.
5. **Escalation is a status flag the owner sets, not something the AI decides or acts on.** If the thread-based back-and-forth (still entirely human-to-human, in the existing thread) doesn't resolve things, the owner marks the dispute "escalated" — at which point the system's job is just to make the evidence easy to produce (the anchored contract's hash + text, the full thread history, the monitoring event record) for whatever comes next (mediation, small-claims process, a real lawyer) — the AI does not attempt to resolve an escalated dispute itself.

## Architecture / data flow

```
Owner, from the agreement's thread view (Sub-project A) or Dashboard,
clicks "Report a dispute"
        │
        ▼
POST /api/disputes  { contract_id, owner_explanation }
        │
        ▼
Backend gathers: contract.contract_text, the full thread history for
that contract_id (db.getMessages, Sub-project A), owner_explanation
        │
        ▼
Backend calls the monitoring/legal-recommendation agent-service (the
teammate's Python/FastAPI side, per ARCHITECTURE.md §3 — this repo's
side only builds the request/response plumbing and the schema; the
actual retrieval+generation lives in /agent-service and /legal-corpus,
owned by the RAG teammate) with the ARCHITECTURE.md §6.4 request shape:
  { agreement_onchain_id, contract_text, new_messages: [...] }
  — new_messages here is fed from the thread history + owner_explanation
    as a synthetic final message, rather than literally "new messages
    since last check" (this spec's trigger is manual reporting, not
    passive monitoring — see Decision 1)
        │
        ▼
Agent-service responds with the §6.4 response shape:
  { conflict_detected, severity, summary, legal_basis: [...],
    recommended_actions: [...], honesty_note }
  — THIS SPEC ADDS ONE NEW OPTIONAL FIELD: suggested_message: string|null
    (a draft the owner could send into the thread, grounded the same way
    everything else in the response is grounded)
        │
        ▼
Backend stores this as a monitoring_event (ARCHITECTURE.md §8 already
designed this table; implement it now as an in-memory db.js Map, same
pattern as everything else, consistent with this whole prototype's
persistence posture) and returns it to the frontend
        │
        ▼
Owner sees the recommendation, the cited legal_basis, the honesty_note,
and — if present — the suggested_message with an "insert into thread"
button that pre-fills (but does not send) the thread's message compose
box. The owner reviews, edits if they want, and sends it themselves
through Sub-project A's existing POST /api/threads/:contractId/messages
as sender: "owner" — completely indistinguishable, from the thread's
perspective, from any other owner message. The AI never posts to the
thread directly.
```

## Components

### `backend/src/routes/disputes.js` (new)
- `POST /api/disputes` — the flow above. Validates the contract exists and is `executed`. On success, returns `{ event, insaf }` where `event` matches the stored monitoring-event shape.
- `GET /api/disputes/:contractId` — lists all monitoring events for a contract (a dispute could reasonably be reported more than once, or reopened).
- `POST /api/disputes/:eventId/escalate` — flips a stored event's status to `escalated` (Decision 5) and returns an evidence bundle: `{ contract_text, contract_text_hash, agreement_onchain_id, thread_messages, monitoring_events }` — everything a lawyer or mediator would need, assembled once rather than re-derived ad hoc.

### `backend/src/services/agentServiceClient.js` (new)
A thin HTTP client for calling the teammate's agent-service, matching
`ARCHITECTURE.md` §6.4's request/response schema exactly. **This is the
seam** — this repo's side must not embed any legal-recommendation logic
itself; it only shapes the request and passes the response through. If
the agent-service isn't reachable (not built yet, or down), see Error
Handling below — this must degrade honestly, not fall back to a
locally-generated fake recommendation.

### `backend/src/db.js` (modified)
New `monitoringEvents` Map, keyed by a generated event id, each holding
the full §6.4 response shape (plus `suggested_message`) and a `status`
field (`"open" | "escalated"`), per `ARCHITECTURE.md` §8's
`monitoring_events`/`recommendations` tables, now actually implemented
(in-memory, consistent with everything else).

### `frontend/dispute.html` + `frontend/dispute.js` (new) or a modified section of `thread.js`
A "Report a dispute" entry point from the thread view; a form collecting
the owner's explanation; a results view rendering the recommendation,
cited legal basis (with source attribution, never presented as
unsourced), the honesty note **prominently, not buried**, and the
suggested-message-to-thread flow from the data-flow diagram above.

## Data model addition

```
monitoringEvents: Map<event_id, {
  contract_id: string,
  agreement_onchain_id: number,
  detected_at: string,          // ISO 8601
  conflict_detected: boolean,
  severity: "low" | "medium" | "high",
  summary: string,
  legal_basis: Array<{ source: string, excerpt: string }>,
  recommended_actions: string[],
  suggested_message: string | null,
  honesty_note: string,
  status: "open" | "escalated"
}>
```

## Error handling

| Case | Response |
|---|---|
| Agent-service unreachable / not built yet | The route must respond honestly: `{ event: null, insaf: "The dispute-recommendation agent isn't available right now — here's what's on record for this agreement so far" }` plus the raw evidence bundle (contract text, thread history) so the owner isn't left with nothing. **Never silently substitute a locally-generated recommendation** — that would violate the grounding requirement (Decision 3) by definition, since anything not actually retrieved from `/legal-corpus` is by construction not grounded. |
| Agent-service responds but `legal_basis` is empty | Still return the response, but the frontend must visibly flag "no cited legal basis for this recommendation" rather than rendering `recommended_actions` as if they were as well-supported as a grounded one — this is the honesty requirement made concrete in the UI, not just the copy. |
| Owner reports a dispute for a contract with no thread history yet (no messages ever exchanged) | Allowed — `new_messages` is just the `owner_explanation`; the agent-service may reasonably return low-confidence output, which is fine as long as `honesty_note` says so. |
| Owner tries to escalate an event that's already escalated | 409, `{ error: "already escalated" }` — idempotent-check, not a hard failure. |

## Testing

- Unit tests for `agentServiceClient.js`'s request-shaping (does it build exactly the `ARCHITECTURE.md` §6.4 request shape) and its degrade-on-unreachable behavior (mock the HTTP call throwing, confirm the route's honest fallback fires, not a crash and not a fabricated response).
- Unit tests for the `db.js` `monitoringEvents` additions.
- Manual end-to-end **only once the agent-service side exists** (this is explicitly cross-team — coordinate with whoever owns `/agent-service` before attempting a real end-to-end run; until then, verify this side against a stubbed agent-service response matching the §6.4 shape, the same "build your side against the schema with stubs" discipline `ARCHITECTURE.md` §3 already mandates for the rest of the project).

## Out of scope (explicit)

- **No AI-mediated live negotiation between the two parties.** This is the single most important exclusion in this document — see the Problem section. If a future iteration wants to revisit this, it needs its own explicit design and sign-off, not a quiet expansion of this spec's `suggested_message` field into something the AI posts autonomously.
- No passive/continuous monitoring of every thread message for conflict signals — this spec is manually-triggered only (Decision 1). Passive monitoring is a materially bigger feature (when to check, how often, what counts as a signal, avoiding false-positive spam) and is a reasonable *next* extension of this spec once the manually-triggered version is proven, not part of it.
- No automated dispute resolution or binding decision-making of any kind — every output is a recommendation to the owner, full stop.
- No changes to the smart contract — disputes and their evidence are entirely off-chain bookkeeping; the on-chain agreement itself is unaffected by a dispute being reported (an escalated dispute might eventually *lead to* an amendment via Sub-project B, but that's a separate, human-initiated step, not something this sub-project triggers automatically).
