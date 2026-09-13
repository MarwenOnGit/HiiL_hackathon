"""Composing a contract document from the structured builder fields.

The builder is the *authoring* side of Agent 1: the user enters the two parties
with their civil identity, the essential elements (capacité, consentement,
cause, objet with its four qualities), and whatever clauses they choose. This
module turns that into one document whose wording is entirely owned by
`config/contract_drafts.py` — language is data, so an Arabic UI produces an
Arabic document with no agent code involved.

The result is fed to the normal `harden` pipeline. That is deliberate: a
drafted document gets the same gap/ambiguity/asymmetry treatment as an uploaded
one, so a builder user still learns what their contract is missing — the
missing-clause recommendations come from `gap_detector`, not from here.
Nothing this pipeline produces is ever written back into the contract.
"""

from __future__ import annotations

from typing import Any

from config.contract_drafts import ARTICLE_HEADING, ROLE_LABELS, TEMPLATES, identity_line

SUPPORTED_LANGUAGES = ("fr", "ar")


class BuildError(ValueError):
    pass


def buyer_and_supplier(parties: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Split the two parties by role, tolerating role names either way."""
    buyer = next((p for p in parties if p.get("role") == "msme_owner"), None)
    supplier = next((p for p in parties if p.get("role") == "counterparty"), None)
    if buyer is None and parties:
        buyer = parties[0]
    if supplier is None and len(parties) > 1:
        supplier = parties[1]
    if supplier is None:
        supplier = buyer
    return buyer, supplier


def _identity_of(party: dict[str, Any]) -> dict[str, Any]:
    identity = party.get("identity") or {}
    return {
        "person_type": identity.get("person_type") or "physique",
        "given_name": identity.get("given_name") or "",
        "family_name": identity.get("family_name") or "",
        "address": identity.get("address") or "",
        "cin": identity.get("cin"),
        "legal_form": identity.get("legal_form"),
        "matricule": identity.get("matricule"),
    }


def _display_name(party: dict[str, Any]) -> str:
    name = (party.get("display_name") or "").strip()
    if name:
        return name
    identity = _identity_of(party)
    parts = [p for p in (identity["given_name"], identity["family_name"]) if p]
    full = " ".join(parts).strip()
    if identity["legal_form"] and full:
        return f"{full} ({identity['legal_form']})"
    return full or "partie"


def build_contract_text(
    *,
    language: str,
    parties: list[dict[str, Any]],
    essentials: dict[str, Any],
    clauses: list[dict[str, Any]],
) -> str:
    """Assemble the full contract document in `language`.

    Structure is always: parties, objet, capacité, consentement, cause, then the
    user's clauses. Headings use the segmenter's shapes so a drafted document
    splits back into the same clause units downstream.
    """
    language = (language or "fr").strip().lower()
    if language not in SUPPORTED_LANGUAGES:
        raise BuildError(f"unsupported draft language {language!r} — use 'fr' or 'ar'")

    buyer, supplier = buyer_and_supplier(parties)
    roles = ROLE_LABELS[language]
    t = TEMPLATES[language]

    entries: list[tuple[str, str]] = []  # (title_key_or_raw, body)

    entries.append(("title_parties", t["parties"].format(
        a=_display_name(buyer),
        b=_display_name(supplier),
        identite_a=identity_line(_identity_of(buyer), language),
        identite_b=identity_line(_identity_of(supplier), language),
        role_a=roles["buyer"],
        role_b=roles["supplier"],
    )))

    objet = t["objet"].format(
        specifique=(
            t["specifique"].format(value=essentials.get("objet_specifique", "").strip())
            if (essentials.get("objet_specifique") or "").strip() else ""
        ),
        quantite=(
            t["quantite"].format(value=essentials.get("objet_quantite", "").strip())
            if (essentials.get("objet_quantite") or "").strip() else ""
        ),
        valorisation=(
            t["valorisation"].format(value=essentials.get("objet_valorisation", "").strip())
            if (essentials.get("objet_valorisation") or "").strip() else ""
        ),
    )
    entries.append(("title_objet", objet))
    entries.append(("title_capacite", essence_or_default(essentials.get("capacite"), t["capacite"])))
    entries.append(("title_consentement", essence_or_default(essentials.get("consentement"), t["consentement"])))
    entries.append(("title_cause", essence_or_default(essentials.get("cause"), t["cause"])))

    for user in clauses:
        title = (user.get("title") or "").strip() or "Clause"
        text = (user.get("text") or "").strip()
        if text:
            entries.append((title, text))

    parts: list[str] = []
    for index, (title, body) in enumerate(entries, start=1):
        heading = ARTICLE_HEADING[language].format(n=index, title=index_title(title, language))
        parts.append(f"{heading}\n{body}")
    title = "CONTRAT" if language == "fr" else "عقد"
    return title + "\n" + "\n\n".join(parts)


def essence_or_default(value: Any, default: str) -> str:
    """The user's own wording wins; an authored default fills the silence.

    Invariant 6, applied to drafting: the user can rely on the pre-written
    declaration or replace it, but a blank field never blocks a contract.
    """
    return (value or "").strip() or default


def index_title(title: str, language: str) -> str:
    """Localise the structural heading titles; keep user clause titles as-is."""
    return STRUCTURAL_TITLES.get(language, {}).get(title, title)


STRUCTURAL_TITLES = {
    "fr": {
        "title_parties": "Les parties",
        "title_objet": "Objet du contrat",
        "title_capacite": "Capacité",
        "title_consentement": "Consentement",
        "title_cause": "Cause",
    },
    "ar": {
        "title_parties": "الطرفان",
        "title_objet": "موضوع العقد",
        "title_capacite": "الأهلية",
        "title_consentement": "الرضا",
        "title_cause": "السبب",
    },
}


def essentials_meta(essentials: dict[str, Any]) -> dict[str, Any]:
    """The structured essentials, stored on the ContractObject for Agent 2.

    Invariant 5: Agent 2 must never re-parse a PDF; it reads the object Agent 1
    built. These fields are that object — the four qualities of the objet and
    the essential-element declarations, kept so a dispute can be mapped back to
    them without ever touching the document text again.
    """
    keep = (
        "objet_possible", "objet_specifique", "objet_quantite",
        "objet_valorisation", "capacite", "consentement", "cause",
    )
    keys = set(essentials.keys())
    return {k: essentials[k] for k in keep if k in keys}