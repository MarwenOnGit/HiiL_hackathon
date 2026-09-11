# Hack4Justice 2026 — MSME Dispute-Prevention Platform
## Project Brief & Build Instructions

**Purpose of this document:** this is the single source of truth for the project. Hand this file, in full, to any AI coding assistant (Claude Code, Cursor, Copilot, etc.) before asking it to scaffold or implement any part of the system. It exists so that two people working in different languages, on different machines, with different reflexes — and any AI tooling helping either of them — build against the same architecture without needing to re-derive it from conversation each time.

If anything in this document conflicts with a verbal decision made later, this document loses — update it first, then build.

---

## 1. Event context

- **Event:** Hack4Justice 2026 (HiiL AI Edition), "Supporting MSMEs access to justice," at ESPRIT, Ariana, Tunisia.
- **Format:** 24-hour build. Timer starts 13:00 Saturday Sept 12, ends 13:00 Sunday Sept 13. VIP Showcase (3-minute live demo + 3-minute jury Q&A) follows a few days later.
- **Theme:** Tunisian MSME access to justice / admin-tech, using "Regulatory AI" as the core enabler. Official challenge examples are revealed 09:00–10:30 on Day 1 — **this architecture is the foundation, not a locked spec.** Budget time after the reveal to re-check fit and adjust scope, not the design.
- **Judging constraint that shapes everything below:** "No slide-only decks; code commits are verified." The prototype must actually run, live, in front of a non-technical jury that includes public officials and legal experts. One reliable golden path beats broad, fragile coverage.
- **Team:** currently 2 people (you: architecture/backend/infra; teammate: agentic AI/RAG). The event requires teams of 3–5 — recruit at least one more person, ideally at the event itself, before or during Day 1.

---

## 2. The product, in one paragraph

An MSME owner connects a source of their business communication with a specific counterparty (email inbox via OAuth, or a manually exported WhatsApp chat). An extraction agent reads that history and identifies the financial relationship — what's being exchanged, on what terms, how often. A contract-generation agent drafts a fair, relationship-preserving agreement from that extraction and anchors its fingerprint on a blockchain registry, tagged with how strongly the counterparty's consent was verified. Once anchored, a monitoring agent watches ongoing communication for signs of conflict and, grounded in retrieved legal text (not free-generated opinion), recommends concrete next steps to the MSME owner.

---

## 3. Architecture: "the seam"

Two independently-built systems meet at exactly one boundary: a fixed JSON schema. Everything on either side of that boundary is free to be a different language, different libraries, different working style — as long as both ends match the schema exactly.

```
┌─────────────────────────────┐        SCHEMA        ┌──────────────────────────────┐
│   BACKEND (owns this repo    │  ───request────────▶ │   AGENT SERVICE                │
│   half)                      │                       │   (teammate owns this half)   │
│   - ingestion (OAuth /        │ ◀───response──────── │   - RAG retrieval              │
│     upload)                  │                       │   - extraction agent           │
│   - Postgres                 │                       │   - contract-generation agent  │
│   - chain anchoring           │                       │   - monitoring agent           │
│   - dashboard API             │                       │                                │
│   Node / Express              │                       │   Python / FastAPI              │
└─────────────────────────────┘                       └──────────────────────────────┘
```

**Default stack split (tentative — confirm with teammate before either of you writes code against it):** Node/Express backend calling a standalone Python/FastAPI agent service over HTTP. This avoids forcing either person into the other's tooling. If your teammate strongly prefers a different split, update this section first.

**Rule for both of you:** build your own side against the schema in Section 6 using stubbed/mocked data before either side depends on the other's real implementation. See Section 9 (build order) for when to swap real for fake.

---

## 4. Repo layout and ownership

```
/hackathon
  /backend            ← yours. Node/Express. Ingestion, DB, chain calls, dashboard API.
  /agent-service       ← teammate's. Python/FastAPI. RAG, extraction, generation, monitoring agents.
  /contracts           ← yours. Solidity registry contract + deploy scripts.
  /frontend            ← yours (or shared if a 3rd/4th teammate joins). Next.js dashboard.
  /legal-corpus        ← teammate's. Tunisian commercial-law reference text for RAG grounding.
  docker-compose.yml
  SCHEMA.md            ← THE ONLY FILE BOTH OF YOU EDIT. Mirrors Section 6 of this doc.
  ARCHITECTURE.md       ← this file.
```

Never edit inside the other person's folder without asking. Git conflicts under time pressure are pure waste — the folder boundary exists to prevent them.

---

## 5. Data ingestion — honest version

There is no OAuth-style API that lets an app read a user's WhatsApp chat history the way Gmail/Outlook allow mailbox access. Don't build toward that; it doesn't exist for personal/business chats. Design around what each platform actually supports:

| Source | Mechanism | Consent story | Build in v1? |
|---|---|---|---|
| Gmail / Outlook | Real OAuth (Google/Microsoft), scope-consent screen, works with test accounts without waiting on app verification | Genuine "authorize access" flow, revocable, matches the trust story for the pitch | Yes — build first |
| WhatsApp | User exports the specific chat (native "Export Chat" feature) and uploads the file | Deliberate, per-conversation, user-initiated — arguably *stronger* consent than blanket inbox access, and it's the dominant channel for Tunisian MSMEs, so lead with this in the demo | Yes — the likely headline demo path |
| Facebook Messenger | Meta Login + Pages Messaging, but needs app review for any Page you don't personally administer | Legitimate OAuth story, but too slow to build for anyone but a dev-owned test Page | Stretch goal / roadmap line in the pitch only |

**UI requirement:** the connector picker offers all three, honestly labeled. Messenger can show "coming soon" if not built. Every ingestion path ends at the same place: a preview screen showing exactly what was captured, with an explicit "looks right, proceed" confirmation before the extraction agent runs — this is your consent checkpoint regardless of source.

**Demo-day fallback:** because live OAuth or a live upload can fail in front of a jury, keep one pre-captured sample of each type (a consented test Gmail thread, a sample WhatsApp export) ready to use if live ingestion misbehaves during the 3-minute slot.

---

## 6. The schema (the seam itself)

This is what actually needs to be frozen before either side starts real implementation. Keep this section and `SCHEMA.md` identical.

### 6.1 Extraction output (agent-service → backend)

```json
{
  "relationship_id": "rel_042",
  "source": "gmail | whatsapp_export | messenger",
  "parties": {
    "msme_owner": { "user_id": "string", "name": "string" },
    "counterparty": { "name": "string", "contact": "string", "on_chain_address": "string|null" }
  },
  "evidence": [
    { "type": "email|message|attachment", "timestamp": "ISO 8601", "excerpt": "string", "source_ref": "string" }
  ],
  "financial_terms_detected": {
    "amount": "number|null",
    "currency": "TND|EUR|USD|...",
    "payment_schedule": "string|null",
    "goods_or_services": "string",
    "recurring": "boolean"
  },
  "confidence": "number 0-1",
  "raw_thread_hash": "sha256 hex string"
}
```

### 6.2 Contract-generation output (agent-service → backend)

```json
{
  "contract_id": "string",
  "contract_text": "string — full generated agreement",
  "contract_text_hash": "keccak256 hex string",
  "clauses": [ { "title": "string", "body": "string" } ],
  "consent_tier_recommended": "UNILATERAL|IN_PERSON_WITNESSED|REMOTE_OTP_VERIFIED|FULL_PLATFORM",
  "generated_at": "ISO 8601"
}
```

### 6.3 Chain anchoring (backend internal, see Section 7)

```json
// request to ChainService
{ "contract_id": "string", "content_hash": "0x...", "party_a_user_id": "string",
  "party_b_ref": "string", "metadata_uri": "string", "consent_tier": "string" }

// response from ChainService
{ "agreement_onchain_id": "number", "tx_hash": "0x...", "block_number": "number" }
```

### 6.4 Monitoring input / output (backend ↔ agent-service, ongoing)

```json
// request
{ "agreement_onchain_id": "number", "contract_text": "string", "new_messages": [ { "timestamp": "ISO 8601", "sender": "string", "text": "string" } ] }

// response
{
  "conflict_detected": "boolean",
  "severity": "low|medium|high",
  "summary": "string",
  "legal_basis": [ { "source": "string — cite the retrieved legal text", "excerpt": "string" } ],
  "recommended_actions": [ "string" ],
  "honesty_note": "string — plain statement of confidence/limits, never overstated legal advice"
}
```

**Grounding requirement for Agent 3:** every recommendation must cite something actually retrieved from `/legal-corpus`, not free-generated. This is both a credibility requirement in front of a jury with legal experts on it, and an honesty requirement — don't let it present unsourced text as legal advice.

---

## 7. Blockchain layer

**Scope for v1:** local chain only (Anvil or Hardhat node in Docker). No public testnet dependency for the live demo — offline-safe, avoids RPC/faucet flakiness on venue wifi.

**Pattern:** one registry contract deployed once at startup, not one contract per agreement. A backend-held relayer wallet submits every transaction on behalf of users — MSME owners never see a wallet or pay gas. Consent is tiered, because the counterparty usually isn't on the platform (see Section 5 and the earlier design discussion): unilateral record, in-person witnessed, remote OTP-verified, or full-platform two-sided signing.

```solidity
pragma solidity ^0.8.24;

contract MSMEContractRegistry {
    enum ConsentTier { UNILATERAL, IN_PERSON_WITNESSED, REMOTE_OTP_VERIFIED, FULL_PLATFORM }

    struct Agreement {
        bytes32 contentHash;
        address partyA;
        address partyB;        // address(0) if counterparty never got a platform identity
        ConsentTier tier;
        bytes32 evidenceHash;  // hash of OTP log / photo / witnessed-consent record, if any
        uint256 createdAt;
        string metadataURI;
    }

    mapping(uint256 => Agreement) public agreements;
    uint256 public nextId;

    event AgreementCreated(uint256 indexed id, bytes32 contentHash, address partyA, ConsentTier tier);
    event AgreementSigned(uint256 indexed id, address signer);
    event AgreementFullyExecuted(uint256 indexed id);

    function createAgreement(bytes32 hash, address partyB, ConsentTier tier, bytes32 evidenceHash, string calldata uri)
        external returns (uint256 id)
    {
        id = nextId++;
        agreements[id] = Agreement(hash, msg.sender, partyB, tier, evidenceHash, block.timestamp, uri);
        emit AgreementCreated(id, hash, msg.sender, tier);
    }

    function sign(uint256 id) external {
        Agreement storage a = agreements[id];
        require(msg.sender == a.partyA || msg.sender == a.partyB, "not a party");
        emit AgreementSigned(id, msg.sender);
    }

    function verify(uint256 id, bytes32 hash) external view returns (bool) {
        return agreements[id].contentHash == hash;
    }
}
```

**Risk mitigation — do this regardless of how confident the chain setup feels:** wrap all chain calls behind a `ChainService` interface with two implementations — the real ethers.js-backed one, and an in-memory mock with identical method signatures. Flip with an env var (`CHAIN_MODE=real|mock`). If the local devnet misbehaves five minutes before you're on stage, flip one flag rather than losing the demo.

---

## 8. Database (Postgres)

Minimum viable tables:

- `users` — id, name, contact info, role (msme_owner)
- `connectors` — id, user_id, type (gmail|outlook), oauth tokens (encrypted), connected_at
- `relationships` — id, msme_owner_id, counterparty_name, counterparty_contact, source, raw_thread_hash
- `evidence_items` — id, relationship_id, type, timestamp, excerpt, source_ref
- `contracts` — id, relationship_id, contract_text, contract_text_hash, consent_tier, generated_at
- `agreements_onchain` — id, contract_id, agreement_onchain_id, tx_hash, block_number, chain_mode
- `monitoring_events` — id, agreement_onchain_id, detected_at, severity, summary
- `recommendations` — id, monitoring_event_id, legal_basis (jsonb), recommended_actions (jsonb), honesty_note

---

## 9. Build order, mapped to the real clock

| Time | Milestone |
|---|---|
| Sat 13:00 | Timer starts. `SCHEMA.md` frozen — both of you build against it from this point, not before. |
| Sat 13:00–18:30 | You: full pipeline running end-to-end against **stub agent responses** matching the schema exactly (upload/connect → fake extraction → fake contract → local chain anchor → dashboard shows it). Teammate: RAG retrieval + extraction agent developed in isolation against real ingested samples, not yet wired in. |
| Sat 18:30 | Checkpoint: the fake end-to-end path must be demoable, even if every agent response is canned. This is your insurance policy. |
| Sat 18:30 – Sun 09:30 | Overnight: teammate keeps building real agent logic against the frozen schema; you harden ingestion (OAuth + WhatsApp upload), chain anchoring, dashboard polish. |
| Sun 09:30 | Real extraction/contract-generation output starts replacing stubs, one agent at a time, not all at once. |
| Sun 09:30–13:00 | Integrate monitoring agent, run through the full demo path repeatedly, fix what breaks. No new schema changes past this point. |
| Sun 13:00 | Timer's off. Freeze. Rehearse the 3-minute demo against whatever state the code is actually in. |

**Rule for the RAG/agent side specifically:** timebox exploration. If retrieval quality isn't where you want it by a checkpoint, wire in what you have and keep improving live rather than holding back an unintegrated "better" version — an integrated mediocre agent beats a polished disconnected one, given the judging rule that code must actually run.

---

## 10. Environment variables (reference for whoever scaffolds `.env`)

```
DATABASE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
CHAIN_MODE=mock|real
RPC_URL=              # local Anvil/Hardhat endpoint when CHAIN_MODE=real
RELAYER_PRIVATE_KEY=  # local test key only — never a funded key, never committed
REGISTRY_CONTRACT_ADDRESS=
LLM_PROVIDER=          # confirm once known what HiiL sponsors, if anything
LLM_API_KEY=
```

---

## 11. Open decisions — resolve before building further

1. Confirm the Node/Python split with your teammate; update Section 3 if it changes.
2. LLM provider — pending the Day 1 morning brief in case HiiL provides sponsor credits.
3. Whether a manual-paste fallback exists for ingestion if OAuth/upload fails live on stage.
4. Recruit at least one more team member (event requires 3–5).

---

## 12. Instructions for any AI coding agent working from this document

- Read Section 6 before writing any code that produces or consumes data crossing the backend/agent-service boundary. Do not invent fields not listed there — propose an addition to `SCHEMA.md` instead and flag it to the user.
- Stay inside your assigned folder (Section 4). Do not modify files under a folder owned by the other side of the project without being explicitly asked.
- When asked to implement an agent (extraction, contract-generation, monitoring), build it as a function/endpoint matching the exact schema in Section 6 — inputs and outputs, not just "similar."
- When asked to implement chain interaction, always build against the `ChainService` interface described in Section 7, with both a mock and real implementation, never a single hard-coded path.
- Prefer a working, integrated, imperfect version over a polished, disconnected one — this project is judged on live running code, not on isolated component quality.
- Never present the monitoring agent's output as definitive legal advice — every recommendation must carry a cited source from `/legal-corpus` and an honest confidence statement, per Section 6.4.
