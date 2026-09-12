"""Walks the whole demo through the real stack and fails loudly.

Goes through the Node backend on :4000, not straight to the agent service, so
it exercises the proxy, the timeouts and the wiring the browser actually uses.
Run it before going on stage.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = "http://localhost:4000"
FAILURES: list[str] = []
STEP = 0


def call(path, *, method="GET", body=None, timeout=45):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read() or b"{}")
        except Exception:
            return exc.code, {}


def check(label, condition, detail=""):
    global STEP
    STEP += 1
    mark = "ok  " if condition else "FAIL"
    print(f"  [{mark}] {STEP:>2}. {label}" + (f"  — {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(f"{label}: {detail}")
    return condition


def main() -> int:
    print("Insaf smoke test\n")

    print("backend")
    status, health = call("/api/health")
    if not check("backend answers on :4000", status == 200, f"status {status}"):
        print("\nThe backend is not running. Start it with ./start.sh mock")
        return 1
    check("chain service is configured", "chain_mode" in health, str(health))

    print("\nv1 path — anchoring and counterparty confirmation")
    status, rel = call("/api/relationships/demo", method="POST")
    check("extraction stub returns a relationship", status == 200 and "relationship" in rel)
    rid = rel.get("relationship", {}).get("relationship_id")

    status, gen = call("/api/contracts/generate", method="POST", body={"relationship_id": rid})
    check("contract generated", status == 200 and "contract" in gen)
    cid = gen.get("contract", {}).get("contract_id")

    status, anchor = call(f"/api/contracts/{cid}/anchor", method="POST")
    check("anchor returns a confirmation link", status == 200 and "confirmation" in anchor)
    token = anchor.get("confirmation", {}).get("token")
    code = anchor.get("confirmation", {}).get("otp_code")

    status, before = call(f"/api/contracts/{cid}/status")
    check("chain untouched until the counterparty accepts",
          before.get("status") == "not_anchored", str(before))

    status, wrong = call(f"/api/confirm/{token}", method="POST", body={"otp_code": "000000"})
    check("a wrong code is rejected", status == 400 and wrong.get("status") == "wrong_code")

    status, confirmed = call(f"/api/confirm/{token}", method="POST", body={"otp_code": code})
    check("correct code anchors and signs", status == 200 and confirmed.get("onchain", {}).get("executed") is True)

    status, msgs = call(f"/api/threads/{cid}/messages")
    check("per-agreement thread exists once executed", status == 200)
    status, posted = call(f"/api/threads/{cid}/messages", method="POST",
                          body={"sender": "owner", "body": "Smoke test message."})
    check("owner can post to the thread", status == 201)
    status, refused = call(f"/api/threads/{cid}/messages", method="POST",
                           body={"sender": "counterparty", "body": "x", "token": "bogus"})
    check("a bad counterparty token is refused", status == 403)

    print("\nv3 path — hardening, versioning, resolution")
    status, agent = call("/api/agent/health", timeout=10)
    agent_up = bool(agent.get("agent_available"))
    if not check("agent service reachable through the proxy", agent_up, str(agent)[:120]):
        print("\nThe agent service is down. The v1 path above still works —")
        print("the UI will show 'analysis unavailable' rather than breaking.")
        return 1

    grounded_available = bool(agent.get("grounding_available"))
    print(f"       corpus size: {agent.get('corpus_size')} "
          f"({'grounded citations available' if grounded_available else 'no corpus — findings will be ungrounded'})")

    status, seeded = call("/api/agent/contracts/contract_demo_001")
    if status != 200:
        print("       (seed not present — run: cd agent && python3 scripts/seed_demo.py)")
    else:
        versions = seeded.get("versions", [])
        check("seeded contract has original -> hardened -> signed",
              [v["doc_type"] for v in versions] == ["original", "hardened", "signed"],
              str([v["doc_type"] for v in versions]))
        check("the hardened proposal is NOT anchored",
              all(v["anchor_tx"] is None for v in versions if v["doc_type"] == "hardened"))
        check("exactly one version is in force",
              sum(1 for v in versions if v["status"] == "in_force") == 1,
              str([v["status"] for v in versions]))
        check("the superseded original keeps a closed window",
              any(v["doc_type"] == "original" and v["effective_to"] for v in versions))

        status, verified = call("/api/agent/contracts/contract_demo_001/verify")
        check("stored text still matches its anchored fingerprint",
              verified.get("verified") is True, str(verified))

        status, hist = call("/api/agent/contracts/contract_demo_001/history")
        kinds = [e["kind"] for e in hist.get("entries", [])]
        check("chain history has anchors and an attested event",
              "AnchorRecord" in kinds and "AttestationRecord" in kinds, str(kinds))

        status, dispute = call("/api/agent/disputes", method="POST", body={
            "contract_id": "contract_demo_001", "dispute_id": "smoke_dispute",
            "event_date": datetime(2026, 6, 10, tzinfo=timezone.utc).isoformat(),
            "contested": True, "claim_amount": 1800.0, "claims": [],
            "statements": [
                {"party_id": "p_buyer", "text": "La livraison de juin contenait 12 panneaux fissures"},
                {"party_id": "p_supplier", "text": "La livraison de juin ne contenait pas de panneaux fissures"},
                {"party_id": "p_buyer", "text": "Le paiement de juin n a pas ete effectue"},
                {"party_id": "p_supplier", "text": "Le paiement de juin n a pas ete effectue"},
            ],
        })
        check("dispute resolves", status == 200, str(dispute)[:140])
        if status == 200:
            check("governing version chosen by event date, not latest",
                  dispute["governing_version"]["doc_type"] == "signed",
                  dispute["governing_version"]["version_id"])
            summary = dispute["fact_ledger"]["summary"]
            check("a flat contradiction lands in 'disputed'",
                  summary["disputed"] >= 1, str(summary))
            check("a mutual admission lands in 'agreed'",
                  summary["agreed"] >= 1, str(summary))
            batna = dispute["batna"]
            check("BATNA is a range, not a point", batna["duration_days"]["low"] < batna["duration_days"]["high"])
            check("BATNA carries its published source", "World Bank" in batna["source"])
            check("non-monetary settlement options are offered",
                  any(not o["monetary"] for o in dispute["settlement_options"]))
            check("nothing is presented as binding", dispute["negotiation"]["binding"] is False)
            check("lawyer review gate is set", dispute["negotiation"]["lawyer_review_required"] is True)

    status, report = call("/api/agent/harden", method="POST", body={"text": "Article 1 - Objet\nFourniture de panneaux."})
    if status == 200:
        grounding = report["grounding"]
        if not grounded_available:
            check("with no corpus, every finding is honestly ungrounded",
                  grounding["grounded_redlines"] == 0, str(grounding))

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED:")
        for failure in FAILURES:
            print(f"  - {failure}")
        return 1
    print(f"All {STEP} checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
