"""Contract drafting templates — the other half of "language is data".

Invariant 8: switching language must never require touching agent code. The
builder composes a contract document from the structured fields the user enters
(parties, the essential elements, and the clauses they choose). Every sentence
of that document is authored here, in French and Arabic, keyed by slot; the
builder only fills in the placeholders. None of this asserts what the law is —
it is commercial drafting language: no article numbers, no legal conclusions.
Whether the result is lawful is exactly what the hardening pass downstream is
for, and it cites retrieved law or says nothing (invariant 7).

Headings intentionally match the segmenter's shape ("Article 1 - …" in French,
"الفصل 1 - …" in Arabic) so a drafted document splits into the same clause
units the rest of the pipeline expects.
"""

from __future__ import annotations

from typing import Any

# Role labels (buyer = msme owner, supplier = counterparty) per language.
ROLE_LABELS = {
    "fr": {"buyer": "l'Acheteur", "supplier": "le Fournisseur"},
    "ar": {"buyer": "المشتري", "supplier": "المورد"},
}

ARTICLE_HEADING = {
    "fr": "Article {n} - {title}",
    "ar": "الفصل {n} - {title}",
}

# The essential elements of the contract (capacité, consentement, cause,
# objet) are ALWAYS drafted — they are the skeleton every contract needs.
# The user's own clauses are appended after them.
TEMPLATES = {
    "fr": {
        "parties": (
            "Entre les soussignés :\n"
            "- {a}, {identite_a}, ci-après dénommé(e) « {role_a} » ;\n"
            "- {b}, {identite_b}, ci-après dénommé(e) « {role_b} ».\n\n"
            "Les parties conviennent de ce qui suit."
        ),
        "objet": (
            "La présente convention a pour objet la fourniture des biens et/ou "
            "prestations décrites ci-après, que les parties reconnaissent licite, "
            "possible et déterminée."
            "{specifique}"
            "{quantite}"
            "{valorisation}"
        ),
        "specifique": "\n\nDescription des biens et/ou prestations : {value}",
        "quantite": "\n\nQuantité : {value}",
        "valorisation": "\n\nPrix : {value}",
        "capacite": (
            "Les parties déclarent avoir la capacité juridique d'engager leur "
            "responsabilité et de s'obliger — personne physique majeure ou personne "
            "morale dûment représentée — et garantissent que leur engagement procède "
            "d'une volonté libre et éclairée."
        ),
        "consentement": (
            "Chaque partie reconnaît consentir librement aux présentes, en "
            "connaissance de cause, et que son adhésion n'a été obtenue ni par "
            "erreur, ni par dol, ni par violence."
        ),
        "cause": (
            "La cause de l'engagement de chaque partie est la contrepartie "
            "réciproque du contrat : chaque prestation d'une partie répond à un "
            "engagement de l'autre. Les parties reconnaissent que cette cause est "
            "licite et réelle et que leur engagement n'est ni gratuit ni simulé."
        ),
        "identity_physique": (
            "Monsieur ou Madame {nom}, titulaire de la carte d'identité nationale "
            "n° {cin}, demeurant {adresse}"
        ),
        "identity_morale": (
            "{nom}, société de type {forme}, immatriculée au registre national des "
            "entreprises sous le matricule fiscal {matricule}, dont le siège est "
            "sis à {adresse}"
        ),
    },
    "ar": {
        "parties": (
            "تتعهد بموجب هذا العقد كل من :\n"
            "- {a} — {identite_a}، المشار إليها فيما بعد بـ « {role_a} » ؛\n"
            "- {b} — {identite_b}، المشار إليه فيما بعد بـ « {role_b} ».\n\n"
            "يتفق الطرفان على ما يلي :"
        ),
        "objet": (
            "موضوع هذا العقد هو توريد السلع و/أو الخدمات الموصوفة أدناه، وهو موضوع "
            "يقرّ الطرفان بأنه جائز وممكن ومعيّن."
            "{specifique}"
            "{quantite}"
            "{valorisation}"
        ),
        "specifique": "\n\nوصف السلع و/أو الخدمات : {value}",
        "quantite": "\n\nالكمية : {value}",
        "valorisation": "\n\nالثمن : {value}",
        "capacite": (
            "يصرّح الطرفان بأنهما يملكان الأهلية القانونية الكاملة للالتزام — "
            "شخصاً طبيعياً بالغاً أو شخصاً معنوياً ممثلاً تمثيلاً صحيحاً — "
            "ويتعهدان بأن التزامهما صادر عن إرادة حرة."
        ),
        "consentement": (
            "يقرّ كل طرف بأنه يرضى بهذا العقد رضاً محرراً وعن علم، وبأن قبوله لم "
            "ينل بإكراه ولا بغلط ولا بتدليس."
        ),
        "cause": (
            "سبب التزام كل طرف هو مقابل التزام الطرف الآخر، فكل تعهد من أحد "
            "الطرفين يقابله تعهد من الآخر. يقرّ الطرفان بأن هذا السبب جائز "
            "وغير صوري."
        ),
        "identity_physique": (
            "السيد أو السيدة {nom}، صاحب(ة) بطاقة التعريف الوطنية رقم {cin}، "
            "القاطن(ة) بـ {adresse}"
        ),
        "identity_morale": (
            "{nom}، شركة من نوع {forme}، مسجلة بالسجل الوطني للمؤسسات تحت المعرف "
            "الجبائي {matricule}، مقرها بـ {adresse}"
        ),
    },
}


def identity_line(identity: dict[str, Any], language: str) -> str:
    """One identity fragment for the parties clause, per person type.

    Takes a plain dict so the builder can hand the raw model dump straight in.
    """
    t = TEMPLATES[language]
    full = " ".join(
        p for p in (identity.get("given_name") or "", identity.get("family_name") or "") if p
    ).strip() or "partie"
    if identity.get("person_type") == "morale":
        return t["identity_morale"].format(
            nom=full,
            forme=identity.get("legal_form") or "…",
            matricule=identity.get("matricule") or "…",
            adresse=identity.get("address") or "…",
        )
    return t["identity_physique"].format(
        nom=full,
        cin=identity.get("cin") or "…",
        adresse=identity.get("address") or "…",
    )