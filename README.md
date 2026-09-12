# Insaf — MSME Agreements (v1 prototype)

First working version of the platform described in `ARCHITECTURE.md`. This
covers the golden path end to end: bring in a conversation → review what was
extracted → generate a contract from a fixed template (no model) → anchor its
fingerprint on a local blockchain → confirm from both sides → see it on a
dashboard. The RAG/extraction agent and the real Gmail OAuth flow are stubbed
for now — swap points are marked clearly below so your teammate's real agents
drop in without touching anything else.

**Important, read this first:** this was built in a cloud sandbox whose
network policy blocks package registries (npm, pip) entirely — every
`npm install` here returns a 403. That means every file below is
syntax-checked (`node --check`, real Solidity written against a contract I
reasoned through carefully) but **not execution-tested**, because nothing
could actually be installed to run it. Run it on your own machine first and
tell me what breaks — I'll fix it fast. This is the one honest caveat on an
otherwise complete v1.

## Quick start (new clone)

For a teammate pulling this down for the first time:

```bash
git clone https://github.com/MarwenOnGit/HiiL_hackathon.git
cd HiiL_hackathon
./start.sh          # real local chain + contract deploy + backend
# or, to skip the blockchain entirely:
./start.sh mock
```

That's it — `start.sh` runs `npm install` in `contracts/` and `backend/`
automatically (only if `node_modules` is missing), creates `backend/.env`
from `backend/.env.example` on first run, deploys the contract, and starts
the backend at `http://localhost:4000` (which also serves the frontend).
Requires Node.js 18+ and npm on `PATH`; nothing else needs to be installed
by hand.

**What's intentionally not in git** (see `.gitignore`): `node_modules/` in
both `backend/` and `contracts/` (run `npm install`, don't commit it),
`backend/.env` (generated from `.env.example` — holds only well-known
public Hardhat test keys, never real secrets), `contracts/artifacts/` and
`contracts/cache/` (Hardhat build output), and
`backend/src/chain/deployment.json` (the deployed contract address —
regenerated per machine every time you run a local chain, so it's never
shared between teammates). If you pull changes and something acts stale,
re-run `./start.sh` — it regenerates all of the above.

## What's real vs. what's stubbed

| Piece | Status |
|---|---|
| Solidity contract (`MSMEContractRegistry.sol`) + Hardhat tests | Real, complete. Tests cover creation, tamper detection, both consent-tier paths, and access control. |
| `ChainService` (mock + real via ethers.js) | Real, complete. Flip `CHAIN_MODE` in `.env`. |
| Contract generator | Real, complete. Deterministic template, zero model calls — exactly what was asked. |
| Extraction ("Agent 1") | Stubbed with one realistic canned relationship (`backend/src/data/demoRelationship.js`), shaped exactly like the real schema so your teammate's RAG agent is a drop-in swap. |
| Gmail/Outlook OAuth | UI button exists, backend route doesn't yet — WhatsApp-export path is the working demo path for now. |
| Monitoring / legal-recommendation agent (Agent 3) | Not built yet — v1 stops at "agreement executed." |
| Frontend | Plain HTML/CSS/JS, no framework, no build step — a deliberate choice given the sandbox couldn't install anything to verify a Next.js build. Swapping to Next.js later is straightforward; the API contract doesn't care. |

## Structure

```
/contracts   Solidity + Hardhat — the on-chain registry
/backend     Node/Express — pipeline, in-memory DB, chain calls, API
/frontend    Static HTML/CSS/JS — served by the backend, zero build step
```

## Run it (on a machine with real internet)

**1. Start a local chain and deploy the contract**

```bash
cd contracts
npm install
npx hardhat node            # leave this running in its own terminal
# in a second terminal:
npx hardhat test            # sanity-check the contract
npx hardhat run scripts/deploy.js --network localhost
```

That last command writes `backend/src/chain/deployment.json` with the deployed
address, and prints the funded local test accounts — copy two of their
private keys into `backend/.env` if the defaults in `.env.example` don't
match what your node printed.

**2. Start the backend**

```bash
cd backend
cp .env.example .env
# paste the deployed address into REGISTRY_CONTRACT_ADDRESS
# set CHAIN_MODE=real once the chain above is running; leave as `mock` to
# demo the full flow with zero blockchain dependency at all
npm install
npm start
```

**3. Open the app**

Go to `http://localhost:4000` — the backend serves the frontend directly.
Click "Upload a WhatsApp export" (it loads the canned demo relationship),
review it, generate the contract, anchor it, confirm from both sides, check
the dashboard.

## Where your teammate's real agents plug in

- Replace `backend/src/data/demoRelationship.js`'s `demoRelationship()` with a
  real call to the RAG/extraction agent-service — same shape in, same shape
  out (`ARCHITECTURE.md` Section 6.1). `backend/src/routes/relationships.js`
  is the only file that needs to change.
- Replace `backend/src/services/contractGenerator.js`'s template logic with a
  real call to the contract-generation agent — same input/output shape
  (Section 6.2). `backend/src/routes/contracts.js` doesn't need to change at
  all if the shape matches.
- The monitoring agent (Section 6.4) has no route yet — `backend/src/routes/`
  is where it belongs, following the same pattern as the other two.

## Risk mitigation already built in

`CHAIN_MODE=mock` runs the entire demo — extraction through dashboard — with
zero blockchain dependency, in case the local devnet misbehaves five minutes
before you're on stage. Same API, same frontend, same everything; only the
chain calls are faked. Flip one env var back to `real` once you trust the
setup again.

## Running the whole thing (v3)

```bash
./start.sh mock          # chain fake + agent service + backend on :4000
cd agent && python3 scripts/seed_demo.py    # reproducible demo dataset
./reset.sh               # back to the seeded state, any time
cd agent && python3 scripts/smoke_test.py   # 28 checks over the real stack
```

Open **http://localhost:4000/harden.html** for the v3 flow (analyse → harden →
sign → resolve a dispute), or http://localhost:4000 for the original anchoring
wizard. Both run from the same backend.

`./start.sh` with no argument uses a real local Hardhat chain instead of the
fake. The agent service is optional: if it is down, anchoring and counterparty
confirmation keep working and the UI says analysis is unavailable.

### Tests

```bash
cd agent && python3 -m unittest discover -s tests -q   # 115, no installs needed
cd backend && npm test                                  # 22
```

### The legal corpus is empty on purpose

Every legal finding currently renders "no legal basis retrieved". That is a
correct result, not a bug: no legal text has been invented to fill the gap.
Add real text under `agent/rag/corpus/` (see the README there) and citations
appear with no code change.
