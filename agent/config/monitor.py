"""Monitoring copy — language is data, not logic (invariant 8).

Every string the dispute-prevention agent can post to the parties lives here
in FR and AR, so switching language never touches agent code. The copy is
deliberately neutral: both parties see the same text, and a deadline alert is
a recorded fact, never an accusation (Agent 2 posture, rule 2).
"""

# How many days before a due date an item becomes "due soon" and Insaf starts
# checking in. Used by the monitor, kept here so it can be tuned per deployment.
REMIND_DAYS = 3

# {lang: template}. {date} is rendered as YYYY-MM-DD; {days} is the countdown.
CHECK_IN = {
    "fr": {
        "delivery": (
            "Livraison prévue pour le {date} ({days} jour(s)). "
            "La marchandise est-elle arrivée ? Merci de confirmer — la "
            "confirmation sera horodatée et ancrée."
        ),
        "payment": (
            "Paiement dû le {date} ({days} jour(s)). "
            "Le virement a-t-il été effectué ? Merci de confirmer."
        ),
        "generic": (
            "Échéance « {action} » prévue pour le {date} ({days} jour(s)). "
            "Merci de confirmer la situation."
        ),
    },
    "ar": {
        "delivery": (
            "التسليم مقرَّر في {date} ({days} يومًا). هل وصلت البضاعة؟ "
            "يُرجى التأكيد — سيُسجَّل وقت التأكيد ويُثبَّت على السلسلة."
        ),
        "payment": (
            "الدفع مستحق في {date} ({days} يومًا). هل تمّ التحويل؟ يُرجى التأكيد."
        ),
        "generic": (
            "أجل « {action} » مقرَّر في {date} ({days} يومًا). يُرجى تأكيد الوضعية."
        ),
    },
}

OVERDUE = {
    "fr": (
        "L'échéance « {action} » ({date}) est passée sans confirmation. "
        "La marchandise est-elle arrivée / le paiement a-t-il été effectué ? "
        "Aucune accusation — le silence est simplement un fait enregistré "
        "et horodaté."
    ),
    "ar": (
        "مرَّ أجل « {action} » ({date}) دون تأكيد. هل وصلت البضاعة / تمّ الدفع؟ "
        "لا اتهام — الصمت مجرّد حقيقة مسجّلة بوقتها."
    ),
}

CONFIRMED = {
    "fr": {
        "performed": (
            "Confirmation enregistrée : « {action} » {date}. "
            "Ancrée sur la chaîne (transaction {tx})."
        ),
        "not_yet": (
            "Situation enregistrée : « {action} » non encore réalisée au "
            "{date}. Aucune accusation — le fait est simplement horodaté."
        ),
        "breached": (
            "Situation enregistrée : « {action} » signalée comme non réalisée "
            "au {date}. Cet échange est ancré en chaîne — une résolution "
            "amiable peut être discutée ici même."
        ),
    },
    "ar": {
        "performed": (
            "تمّ تسجيل التأكيد: « {action} » {date}. "
            "مثبَّت على السلسلة (معاملة {tx})."
        ),
        "not_yet": (
            "تمّ تسجيل الوضعية: « {action} » لم تتحقق بعد في {date}. "
            "لا اتهام — الحقيقة مسجّلة بوقتها فقط."
        ),
        "breached": (
            "تمّ تسجيل الوضعية: « {action} » غير مُنجزة في {date}. "
            "هذا الإشعار مثبَّت على السلسلة — يمكن مناقشة حلّ ودي هنا."
        ),
    },
}

# Anchored when a tension is escalated into the amicable phase. Neutral for
# both parties — no side is blamed, the phase is simply opened.
AMICABLE_OPENING = {
    "fr": (
        "Une difficulté a été signalée sur ce contrat. Résolvons-la ensemble "
        "de manière amiable : chaque partie peut exposer sa position ici, et "
        "tout échange est horodaté et ancré — la preuve qu'une résolution a "
        "été tentée avant toute autre démarche."
    ),
    "ar": (
        "تمّ الإبلاغ عن تعثر في هذا العقد. لِنحلها معًا بشكل ودي: يمكن لكل طرف "
        "عرض موقفه هنا، وكل تبادل يُسجَّل بوقته ويُثبَّت على السلسلة — دليل "
        "على أن الحلّ الودّي جرت محاولته قبل أي إجراء آخر."
    ),
}