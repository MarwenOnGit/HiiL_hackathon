"""Build the demo dataset. Identical every run.

One supply contract with known defects, its hardened proposal, a signed version
that took force in March, an obligation whose deadline has passed with no
confirmation, and a defect dispute dated June — which the governing-version
logic must resolve to the March signed version, not to the latest.

Fixed ids and fixed dates, so the demo shows the same numbers every time.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

BASE = "http://127.0.0.1:5001"
CONTRACT_ID = "contract_demo_001"
DISPUTE_ID = "dispute_demo_001"

SIGNED_ON = datetime(2026, 3, 1, tzinfo=timezone.utc)
ORIGINAL_ON = datetime(2026, 1, 15, tzinfo=timezone.utc)
EVENT_ON = datetime(2026, 6, 10, tzinfo=timezone.utc)


def post(path, *, json_body=None, fields=None, files=None):
    if json_body is not None:
        data = json.dumps(json_body).encode()
        req = urllib.request.Request(BASE + path, data=data, method="POST",
                                     headers={"Content-Type": "application/json"})
    else:
        boundary = "----seed"
        parts = []
        for key, value in (fields or {}).items():
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n")
        body = "".join(parts).encode()
        for key, (name, content) in (files or {}).items():
            body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"; "
                     f"filename=\"{name}\"\r\nContent-Type: text/plain\r\n\r\n").encode()
            body += content + b"\r\n"
        body += f"--{boundary}--\r\n".encode()
        req = urllib.request.Request(BASE + path, data=body, method="POST",
                                     headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read())


def main() -> int:
    try:
        urllib.request.urlopen(BASE + "/health", timeout=5)
    except Exception:
        print(f"The agent service is not answering at {BASE}.")
        print("Start it first:  ./start.sh mock   (or: cd agent && python3 -m uvicorn service:app --port 5001)")
        return 1

    print("resetting…")
    post("/admin/reset", json_body={})

    print(f"1. ingest + harden        {CONTRACT_ID}")
    contract_text = (ROOT / "seed" / "contract_supply_defective.txt").read_bytes()
    report = post("/harden", fields={
        "contract_id": CONTRACT_ID, "profile": "supply",
        "effective_from": ORIGINAL_ON.isoformat(),
    }, files={"file": ("contract_supply_defective.txt", contract_text)})
    print(f"   {len(report['clauses'])} clauses, {len(report['gaps'])} gaps, "
          f"{report['grounding']['total_redlines']} redlines "
          f"({report['grounding']['grounded_redlines']} grounded)")

    print("2. accept redlines        (human gate — proposal, not anchored)")
    accepted = post(f"/contracts/{CONTRACT_ID}/accept",
                    json_body={"accepted_clause_ids": ["cl_0004", "cl_0006"]})
    print(f"   {accepted['version_id']} {accepted['status']} anchored={accepted['anchored']}")

    print("3. sign                   (takes force 2026-03-01, anchored)")
    signed = post(f"/contracts/{CONTRACT_ID}/sign",
                  json_body={"lawyer_validated": False,
                             "effective_from": SIGNED_ON.isoformat()})
    print(f"   {signed['version_id']} anchored doc={signed['doc_id']} parent={signed.get('parent_version_id')}")

    print("4. dispute                (June event — must resolve to the March version)")
    dispute = post("/disputes", json_body={
        "contract_id": CONTRACT_ID, "dispute_id": DISPUTE_ID,
        "event_date": EVENT_ON.isoformat(), "contested": True, "claim_amount": 1800.0,
        "claims": ["Livraison de juin non conforme"],
        "statements": [
            {"party_id": "p_buyer", "text": "La livraison de juin contenait 12 panneaux fissures",
             "evidence_refs": ["photo_001"]},
            {"party_id": "p_supplier", "text": "La livraison de juin ne contenait pas de panneaux fissures"},
            {"party_id": "p_buyer", "text": "Le paiement de juin n a pas ete effectue"},
            {"party_id": "p_supplier", "text": "Le paiement de juin n a pas ete effectue"},
            {"party_id": "p_supplier", "text": "Les panneaux ont ete stockes dehors par l acheteur"},
        ],
    })
    ledger = dispute["fact_ledger"]["summary"]
    print(f"   governing={dispute['governing_version']['version_id']} "
          f"({dispute['governing_version']['doc_type']})  ledger={ledger}")

    print()
    print(f"Seeded. Open http://localhost:3000/harden  (contract {CONTRACT_ID})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
