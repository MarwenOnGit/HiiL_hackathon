"""The HTTP surface: the endpoint inventory the Next app depends on, and the
promise `service.py` makes in its own opening docstring — "returns a structured
error rather than a stack trace, because the caller is a live demo".

Three regressions are pinned here, all found by exercising the running service
against the paths `web/` actually calls:

- **Every path the Next app calls is registered.** Four monitoring endpoints
  existed on disk while the running process predated them, so the check-in
  banner, the confirm buttons and the demo clock all answered 404 against a
  service whose code was correct. An inventory test states the surface as a
  fact instead of leaving it implied across two languages.

- **`monitoring_for` is reachable with no `Request`.** `/admin/advance` is the
  one caller with no language header to offer, and it raised `AttributeError`
  on every *analysed* contract — the only contracts it is ever used on — so the
  fast-forward button could not work at all.

- **The core layer's refusals arrive as 4xx/502 with a readable message.**
  `LineageError`, `AppendOnlyViolation` and `ChainError` are the three ways the
  foundation says no. Reaching the client as a bare 500 loses the reason, and
  the reason is the whole value: "this contract already has versions" tells the
  user to pick a new id, where "Internal Server Error" tells them nothing.
"""

from __future__ import annotations

import asyncio
import inspect
import unittest
from datetime import datetime, timezone
from pathlib import Path

from blockchain_client import InMemoryChain
from blockchain_client.client import ChainError
from config import load_profile
from core.contract_store import AppendOnlyViolation
from core.schemas import Party
from core.version_manager import LineageError
from hardening_agent import harden
from rag import InMemoryIndex, Retriever

import service

JAN = datetime(2026, 1, 15, tzinfo=timezone.utc)
PARTIES = [
    Party("p_buyer", "msme_owner", "Atelier Trabelsi", "pseudo_buyer"),
    Party("p_supplier", "counterparty", "Bois du Nord", "pseudo_supplier"),
]
SEED = Path(__file__).resolve().parent.parent / "seed" / "contract_supply_defective.txt"

# Every (method, path) pair `web/` calls, gathered from the Next app: the
# catch-all proxy in web/app/api/agent/[[...path]]/route.ts, the dedicated
# monitor routes under web/app/api/monitor/, the chat assistant route, and
# contractsRegistry.js. If a handler is renamed or dropped, this fails here
# rather than as a 404 in the browser mid-demo.
WEB_CALLS = [
    ("GET", "/health"),                       # proxy + contractsRegistry.isAgentUp
    ("GET", "/contracts"),                    # contractsRegistry.agentList
    ("POST", "/harden"),                      # proxy, multipart upload
    ("POST", "/contracts/build"),             # harden page, structured builder
    ("GET", "/contracts/{contract_id}"),      # harden + contract detail pages
    ("POST", "/contracts/{contract_id}/accept"),
    ("POST", "/contracts/{contract_id}/sign"),
    ("GET", "/contracts/{contract_id}/history"),
    ("GET", "/contracts/{contract_id}/verify"),
    ("GET", "/contracts/{contract_id}/monitor"),          # api/monitor/[contractId]
    ("POST", "/contracts/{contract_id}/obligations/{obligation_id}/confirm"),
    ("POST", "/contracts/{contract_id}/escalate"),        # api/monitor/.../escalate
    ("POST", "/admin/advance"),                           # api/monitor/.../advance
    ("POST", "/admin/reset"),                             # scripts/seed_demo.py
    ("POST", "/ask"),                                     # api/threads/.../assistant
    ("POST", "/disputes"),
]


def _registered() -> set[tuple[str, str]]:
    found = set()
    for route in service.app.routes:
        for method in getattr(route, "methods", ()) or ():
            found.add((method, route.path))
    return found


def _analysed_contract():
    """A contract that has been through Agent 1, so it carries the
    `analysis_fingerprint` that makes monitoring active."""
    report = harden(
        text=SEED.read_text(encoding="utf-8"),
        contract_id="c_service",
        parties=PARTIES,
        profile=load_profile("supply"),
        retriever=Retriever(InMemoryIndex()),
        chain=InMemoryChain(),
        effective_from=JAN,
    )
    return report.contract


def _handle(exc: Exception):
    """Invoke the app's registered handler for `exc` and return the response."""
    handler = None
    for exc_type, candidate in service.app.exception_handlers.items():
        if inspect.isclass(exc_type) and isinstance(exc, exc_type):
            # Most specific registration wins, same as Starlette's lookup.
            if handler is None or issubclass(exc_type, handler[0]):
                handler = (exc_type, candidate)
    if handler is None:
        raise AssertionError(f"no handler registered for {type(exc).__name__}")
    result = handler[1](None, exc)
    if inspect.isawaitable(result):
        result = asyncio.run(result)
    return result


class EndpointInventory(unittest.TestCase):
    """The seam is two codebases wide; only a test can hold both ends."""

    def test_every_path_the_web_app_calls_is_registered(self):
        registered = _registered()
        missing = [call for call in WEB_CALLS if call not in registered]
        self.assertEqual(
            missing, [],
            "the Next app calls these and the agent service does not answer them",
        )

    def test_no_handler_is_registered_twice_under_one_method(self):
        """Two handlers on one (method, path) means the second silently wins."""
        seen = []
        for route in service.app.routes:
            for method in getattr(route, "methods", ()) or ():
                seen.append((method, route.path))
        duplicates = {pair for pair in seen if seen.count(pair) > 1}
        self.assertEqual(duplicates, set())


class MonitoringWithoutARequest(unittest.TestCase):
    """`/admin/advance` has no language header to offer. That is a caller with
    nothing to say about language, not a caller that may be refused."""

    def test_monitoring_for_works_with_no_request(self):
        contract = _analysed_contract()
        plan = service.monitoring_for(contract)
        self.assertTrue(plan["active"])
        self.assertIn("milestones", plan)

    def test_monitoring_for_works_with_no_request_keyword(self):
        contract = _analysed_contract()
        self.assertTrue(service.monitoring_for(contract, request=None)["active"])

    def test_an_unanalysed_contract_still_reports_absence_as_a_fact(self):
        contract = _analysed_contract()
        contract.metadata.pop("analysis_fingerprint", None)
        plan = service.monitoring_for(contract)
        self.assertFalse(plan["active"])
        self.assertEqual(plan["reason"], "no agent analysis yet")


class DomainRefusalsBecomeStructuredErrors(unittest.TestCase):
    """The foundation refuses things on purpose. A refusal that reaches the
    browser as a bare 500 has thrown away the only useful part: the reason."""

    def test_lineage_error_is_a_conflict(self):
        response = _handle(LineageError("a version cannot take force before its parent did"))
        self.assertEqual(response.status_code, 409)

    def test_append_only_violation_is_a_conflict(self):
        response = _handle(AppendOnlyViolation("existing versions are immutable"))
        self.assertEqual(response.status_code, 409)

    def test_chain_error_is_a_bad_gateway(self):
        response = _handle(ChainError("the chain rejected the payload"))
        self.assertEqual(response.status_code, 502)

    def test_the_reason_survives_in_the_field_the_ui_reads(self):
        """web/app/harden/page.tsx renders `body.error`; FastAPI's own shape is
        `detail`. Carry both, or the UI shows "build failed (409)" and drops
        the sentence that tells the user what to do about it."""
        response = _handle(AppendOnlyViolation("this contract already has versions"))
        body = response.body.decode("utf-8")
        self.assertIn("this contract already has versions", body)
        import json
        payload = json.loads(body)
        self.assertEqual(payload["error"], "this contract already has versions")
        self.assertEqual(payload["detail"], "this contract already has versions")


if __name__ == "__main__":
    unittest.main()
