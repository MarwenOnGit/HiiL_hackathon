// Bilingual copy, French and Arabic, for the whole dashboard.
//
// Language is data (invariant 8): every user-facing string on the client lives
// here, keyed once, and `t()` picks the language of the running session. The
// keys double as a loose contract with the agent / server surfaces, which have
// their own bilingual tables on the Python side.

export type Lang = "fr" | "ar";

export type MsgKey = keyof typeof messages;

export const messages = {
  // ---------------------------------------------------------------- common
  "common.loading": { fr: "Chargement…", ar: "جارٍ التحميل…" },
  "common.working": { fr: "Traitement…", ar: "جارٍ المعالجة…" },
  "common.demo": { fr: "démo", ar: "تجريبي" },
  "common.signed": { fr: "signé", ar: "موقَّع" },
  "common.draft": { fr: "brouillon", ar: "مسودة" },
  "common.anchored": { fr: "ancré", ar: "مثبَّت" },
  "common.wizard": { fr: "assistant", ar: "معالج" },
  "common.hardened": { fr: "analysé", ar: "مُحلَّل" },

  // ----------------------------------------------------------------- topbar
  "topbar.tagline": {
    fr: "Insaf — justice commerciale pour les PME",
    ar: "إنصاف — عدالة تجارية للمؤسسات الصغرى والمتوسطة"
  },
  "topbar.signout": { fr: "Se déconnecter", ar: "تسجيل الخروج" },
  "lang.toggleTo": { fr: "Passer en arabe", ar: "التبديل إلى الفرنسية" },
  "theme.light": { fr: "☀ clair", ar: "☀ فاتح" },
  "theme.dark": { fr: "🌙 sombre", ar: "🌙 داكن" },
  "theme.toggle": { fr: "Changer le thème", ar: "تغيير المظهر" },

  // ---------------------------------------------------------------- landing
  "landing.titleLogin": { fr: "Se connecter à Insaf", ar: "تسجيل الدخول إلى إنصاف" },
  "landing.titleRegister": { fr: "Créer un compte", ar: "إنشاء حساب" },
  "landing.intro": {
    fr: "Pour les dirigeants de PME : consolider un contrat, inviter l'autre partie, conserver une trace infalsifiable et régler les litiges avant le tribunal.",
    ar: "للمؤسسات الصغرى والمتوسطة: تحصين عقودك، دعوة الطرف الآخر، حفظ سجل مقاوم للتلاعب، وتسوية النزاعات قبل اللجوء إلى المحكمة."
  },
  "landing.email": { fr: "E-mail", ar: "البريد الإلكتروني" },
  "landing.name": { fr: "Votre nom", ar: "الاسم" },
  "landing.password": { fr: "Mot de passe", ar: "كلمة المرور" },
  "landing.pwReg": { fr: "au moins 8 caractères", ar: "8 أحرف على الأقل" },
  "landing.submit": { fr: "Se connecter", ar: "تسجيل الدخول" },
  "landing.create": { fr: "Créer le compte", ar: "إنشاء الحساب" },
  "landing.noAccount": { fr: "Pas encore de compte ?", ar: "ليس لديك حساب بعد؟" },
  "landing.register": { fr: "S'inscrire", ar: "إنشاء حساب" },
  "landing.hasAccount": { fr: "Déjà inscrit ?", ar: "لديك حساب بالفعل؟" },
  "landing.signin": { fr: "Se connecter", ar: "تسجيل الدخول" },
  "landing.demo": {
    fr: "Continuer avec le compte de démonstration",
    ar: "المتابعة بحساب تجريبي"
  },
  "landing.invited": { fr: "Une partie vous a déjà invité ?", ar: "أرسلت لك إحدى الأطراف دعوة؟" },
  "landing.openInvite": { fr: "Ouvrir votre invitation", ar: "افتح دعوتك" },
  "landing.errSignin": { fr: "impossible de se connecter", ar: "تعذّر تسجيل الدخول" },
  "landing.errDemo": { fr: "impossible de lancer une session de démonstration", ar: "تعذّر بدء جلسة تجريبية" },

  // -------------------------------------------------------------- dashboard
  "dashboard.title": { fr: "Tableau de bord", ar: "لوحة التحكم" },
  "dashboard.chain": { fr: "chaîne :", ar: "السلسلة:" },
  "dashboard.intro": {
    fr: "Tout au même endroit : consolider un contrat, inviter l'autre partie, conserver la trace signée, suivre les obligations et régler les litiges avant le tribunal.",
    ar: "كلّ ما تحتاجه في مكان واحد: تحصين عقدك، دعوة الطرف الآخر، حفظ السجل الموقَّع، متابعة الالتزامات وتسوية النزاعات قبل المحكمة."
  },
  "dashboard.statContracts": { fr: "Contrats que vous possédez", ar: "العقود المملوكة لك" },
  "dashboard.statSigned": { fr: "Signés / exécutés", ar: "موقَّعة / منفَّذة" },
  "dashboard.statThreads": { fr: "Messages du fil", ar: "رسائل المحادثة" },
  "dashboard.analyse": { fr: "Nouveau contrat", ar: "عقد جديد" },
  "dashboard.demoRel": { fr: "Générer une relation de démonstration", ar: "إنشاء علاقة تجريبية" },
  "dashboard.generating": { fr: "Génération en cours…", ar: "جارٍ الإنشاء…" },
  "dashboard.sectionTitle": { fr: "Contrats", ar: "العقود" },
  "dashboard.sectionSub": {
    fr: "une identité de contrat · plusieurs versions · ajout seul",
    ar: "هوية عقد واحدة · عدة إصدارات · إضافة فقط"
  },
  "dashboard.empty": {
    fr: "Rien ici pour l'instant. Générez une relation de démonstration ci-dessus, ou analysez un contrat que vous possédez.",
    ar: "لا شيء بعد. أنشئ علاقة تجريبية أعلاه أو حلّل عقدًا تملكه."
  },
  "dashboard.errLoad": { fr: "impossible de charger vos contrats", ar: "تعذّر تحميل عقودك" },
  "dashboard.msme": { fr: "MSME", ar: "المؤسسة" },
  "dashboard.counterparty": { fr: "Contrepartie", ar: "الطرف المقابل" },
  "dashboard.versions": { fr: "version", ar: "إصدار" },
  "dashboard.versionsMany": { fr: "versions", ar: "إصدارات" },
  "dashboard.tier": { fr: "niveau", ar: "المستوى" },
  "dashboard.inviteOpen": { fr: "invitation ouverte", ar: "الدعوة مفتوحة" },
  "dashboard.until": { fr: "jusqu'à", ar: "حتى" },
  "dashboard.details": { fr: "Détails", ar: "التفاصيل" },
  "dashboard.thread": { fr: "Fil", ar: "المحادثة" },
  "dashboard.noThread": { fr: "pas de fil avant signature", ar: "لا محادثة قبل التوقيع" },
  "dashboard.invite": { fr: "Inviter", ar: "دعوة" },
  "dashboard.closeInvite": { fr: "Fermer", ar: "إغلاق" },

  // ----------------------------------------------------------------- thread
  "thread.title": { fr: "Fil sécurisé", ar: "المحادثة الآمنة" },
  "thread.owner": { fr: "vous êtes le propriétaire", ar: "أنت المالك" },
  "thread.invited": { fr: "vous êtes la partie invitée", ar: "أنت الطرف المدعو" },
  "thread.gateTitle": {
    fr: "Ce fil ne vous est pas encore ouvert.",
    ar: "هذه المحادثة غير متاحة لك بعد."
  },
  "thread.gateBody": {
    fr: "Le fil s'ouvre lorsque l'accord est signé par les deux parties. En tant que propriétaire, vous pouvez inviter la contrepartie d'ici.",
    ar: "تُفتح المحادثة بعد توقيع الاتفاقية من الطرفين. بوصفك المالك، يمكنك دعوة الطرف الآخر من هنا."
  },
  "thread.back": { fr: "Retour", ar: "رجوع" },
  "thread.retry": { fr: "Réessayer", ar: "إعادة المحاولة" },
  "thread.neutral": {
    fr: "Terrain neutre : les deux parties voient ce même enregistrement. Les confirmations d'obligations et de règlement faites ici sont horodatées et ancrées sur la chaîne — le silence est un fait enregistré, pas une accusation.",
    ar: "فضاء محايد: يرى الطرفان السجل نفسه. تأكيدات الالتزامات والتسويات هنا مختومة بالوقت ومثبَّتة على السلسلة — الصمت حقيقة مسجّلة، وليس اتهامًا."
  },
  "thread.noMsgs": { fr: "Aucun message pour l'instant.", ar: "لا توجد رسائل بعد." },
  "thread.sayHello": {
    fr: " Dites bonjour, puis convenez de la suite.",
    ar: " رحّب، ثم اتفقا على الخطوة التالية."
  },
  "thread.as": { fr: "Message en tant que {name}…", ar: "رسالة بصفتك {name}…" },
  "thread.send": { fr: "Envoyer", ar: "إرسال" },
  "thread.assistantTitle": { fr: "Appeler Insaf dans la conversation", ar: "استدعِ إنصاف إلى المحادثة" },
  "thread.assistantBody": {
    fr: "Interrogez-la sur les obligations, les versions ou ce litige. La réponse est publiée dans le fil pour que les deux parties lisent le même avis neutre — fondé uniquement sur du droit extrait de la base, jamais inventé.",
    ar: "اسأل عن الالتزامات أو الإصدارات أو هذا النزاع. يُنشر الجواب داخل المحادثة ليقرأ الطرفان الردّ المحايد نفسه — مستند فقط إلى نصوص قانونية مسترجعة، ولا يُختلق أبدًا."
  },
  "thread.askPlaceholder": {
    fr: "ex. Quelles obligations sont en retard ? Quel contrat s'applique ?",
    ar: "مثال: ما الالتزامات المتأخرة؟ أي عقد يسري المفعول؟"
  },
  "thread.ask": { fr: "Interroger Insaf", ar: "اسأل إنصاف" },
  "thread.summoned": { fr: "{name} a demandé", ar: "سأل {name}" },
  "thread.ruleBased": { fr: "règles", ar: "قواعد" },
  "thread.analysed": { fr: "analyse", ar: "تحليل" },
  "thread.grounded": { fr: "fondé", ar: "مستند" },
  "thread.noBasis": { fr: "aucune base légale", ar: "لا أساس قانوني" },

  // ------------------------------------------------------------------ invite
  "invite.openTitle": { fr: "Ouvrir votre invitation", ar: "افتح دعوتك" },
  "invite.paste": {
    fr: "Le lien d'invitation envoyé par l'autre partie contient un jeton. Collez ici le lien complet.",
    ar: "رابط الدعوة الذي أرسله الطرف الآخر يتضمن رمزًا. الصق الرابط كاملًا هنا."
  },
  "invite.loading": { fr: "Chargement de l'invitation…", ar: "جارٍ تحميل الدعوة…" },
  "invite.notFound": { fr: "invitation introuvable", ar: "تعذّر العثور على الدعوة" },
  "invite.inaccessible": { fr: "Invitation inaccessible.", ar: "الدعوة غير متاحة." },
  "invite.backInsaf": { fr: "Retour à Insaf", ar: "العودة إلى إنصاف" },
  "invite.confirmedTitle": { fr: "Vous êtes confirmé.", ar: "تم تأكيد قبولك." },
  "invite.confirmedBody": {
    fr: "Votre acceptation a été enregistrée. Le fil sécurisé s'ouvrira dès que le propriétaire aura signé l'accord — vous serez prévenu ici.",
    ar: "تم تسجيل قبولك. ستُفتح المحادثة الآمنة حالما يوقّع المالك الاتفاقية — سيتم إشعارك هنا."
  },
  "invite.keepLink": {
    fr: "Conservez ce lien : le réutiliser vous reconnecte directement au fil.",
    ar: "احتفظ بهذا الرابط: إعادة استعماله تدخلك مباشرة إلى المحادثة."
  },
  "invite.checkAgain": { fr: "Re-vérifier", ar: "تحقّق مجددًا" },
  "invite.beenInvited": { fr: "Vous avez été invité", ar: "تمت دعوتك" },
  "invite.beenInvitedBody": {
    fr: "{owner} souhaite que vous rejoigniez un contrat sur Insaf. Rejoignez pour voir le même enregistrement signé et discuter dans un fil neutre et infalsifiable avant qu'aucun différend n'atteigne un tribunal.",
    ar: "يريد {owner} انضمامك إلى عقد على منصة إنصاف. انضم لترى السجل الموقَّع نفسه وتتحاور في فضاء محايد ومقاوم للتلاعب قبل أن يصل أي نزاع إلى المحكمة."
  },
  "invite.preview": { fr: "Aperçu du contrat", ar: "معاينة العقد" },
  "invite.code": { fr: "Code de confirmation", ar: "رمز التأكيد" },
  "invite.codePlaceholder": { fr: "6 chiffres communiqués par l'autre partie", ar: "6 أرقام تواصل بها الطرف الآخر" },
  "invite.accept": { fr: "Accepter et ouvrir le fil", ar: "قبول وفتح المحادثة" },
  "invite.return": { fr: "Revenir au fil", ar: "العودة إلى المحادثة" },
  "invite.recording": { fr: "Enregistrement…", ar: "جارٍ التسجيل…" },
  "invite.humanNote": {
    fr: "Accepter est un acte humain de votre côté. Rien n'est signé pour vous — cela enregistre que vous avez reçu le contrat et accepté d'en discuter dans ce fil.",
    ar: "القبول فعل بشري من طرفك. لا شيء يُوقَّع عنك — هذا يسجّل أنك تسلّمت العقد وقبلت مناقشته في هذه المحادثة."
  },
  "invite.codeError": {
    fr: "Saisissez le code de confirmation à 6 chiffres communiqué par l'autre partie.",
    ar: "أدخل رمز التأكيد المكوّن من 6 أرقام الذي تواصل به الطرف الآخر."
  },

  // ------------------------------------------------- contract state surfaces
  "status.in_force": { fr: "en vigueur", ar: "ساري المفعول" },
  "status.proposed": { fr: "proposé", ar: "مقترَح" },
  "status.superseded": { fr: "remplacé", ar: "مستبدَل" },
  "doctype.original": { fr: "original", ar: "الأصل" },
  "doctype.hardened": { fr: "consolidé", ar: "مُحصَّن" },
  "doctype.signed": { fr: "signé", ar: "موقَّع" },
  "doctype.amendment": { fr: "avenant", ar: "ملحق" },
  "state.pending": { fr: "en attente", ar: "قيد الانتظار" },
  "state.overdue_unconfirmed": { fr: "en retard, non confirmée", ar: "متأخرة، غير مؤكدة" },
  "state.performed": { fr: "exécutée", ar: "منفَّذة" },
  "state.breached": { fr: "violée", ar: "مخالَفة" },
  "state.waived": { fr: "renoncée", ar: "متنازل عنها" },
  "state.cured": { fr: "réparée", ar: "تمت معالجتها" },

  // --------------------------------------------------- contract detail page
  "detail.dashboard": { fr: "Tableau de bord", ar: "لوحة التحكم" },
  "detail.statVersions": { fr: "Versions", ar: "الإصدارات" },
  "detail.statExecuted": { fr: "Exécuté en chaîne", ar: "منفَّذ على السلسلة" },
  "detail.statObligations": { fr: "Obligations", ar: "الالتزامات" },
  "detail.contractWizard": { fr: "Contrat (assistant v1)", ar: "العقد (المعالج v1)" },
  "detail.hash": { fr: "Empreinte", ar: "البصمة" },
  "detail.onchain": { fr: "Enregistrement en chaîne", ar: "السجل على السلسلة" },
  "detail.agreement": { fr: "accord", ar: "اتفاق" },
  "detail.partyA": { fr: "partie A", ar: "الطرف أ" },
  "detail.partyB": { fr: "partie B", ar: "الطرف ب" },
  "detail.pending": { fr: "en attente", ar: "قيد الانتظار" },
  "detail.executed": { fr: "exécuté", ar: "منفَّذ" },
  "detail.notExecuted": { fr: "non exécuté", ar: "غير منفَّذ" },
  "detail.versionHistory": { fr: "Historique des versions (ajout seul)", ar: "تاريخ الإصدارات (إضافة فقط)" },
  "detail.parent": { fr: "parent", ar: "السلف" },
  "detail.from": { fr: "du", ar: "من" },
  "detail.to": { fr: "au", ar: "إلى" },
  "detail.proposal": { fr: "proposition", ar: "اقتراح" },
  "detail.obligations": { fr: "Obligations ({count})", ar: "الالتزامات ({count})" },
  "detail.noObligations": { fr: "Aucune obligation extraite.", ar: "لم يُستخرج أي التزام." },
  "detail.obligationsNote": {
    fr: "Les confirmations d'obligations sont enregistrées ici avec leur horodatage et ancrées quand elles sont confirmées — voir le fil. Le silence est un fait enregistré, pas une accusation.",
    ar: "تُسجَّل تأكيدات الالتزامات هنا مع وقتها وتُثبَّت على السلسلة عند التأكيد — راجع المحادثة. الصمت حقيقة مسجّلة، وليس اتهامًا."
  },
  "detail.chainLog": { fr: "Journal de la chaîne", ar: "سجل السلسلة" },
  "detail.nothingAnchored": { fr: "Rien d'ancré pour l'instant.", ar: "لا شيء مثبَّت بعد." },
  "detail.doc": { fr: "doc", ar: "وثيقة" },
  "detail.inviteTitle": { fr: "Inviter l'autre partie", ar: "دعوة الطرف الآخر" },
  "detail.inviteBody": {
    fr: "Elle rejoint via un lien à durée limitée. L'acceptation ouvre le fil.",
    ar: "تنضم عبر رابط محدود المدة. القبول يفتح المحادثة."
  },
  "detail.openThread": { fr: "Ouvrir le fil", ar: "افتح المحادثة" },
  "detail.noThreadYet": { fr: "pas de fil avant signature de l'accord", ar: "لا محادثة قبل توقيع الاتفاقية" },
  "detail.analyseAnother": { fr: "Nouveau contrat", ar: "عقد جديد" },
  "detail.notYours": { fr: "Ce n'est pas votre contrat.", ar: "هذا العقد ليس ملكك." },
  "detail.invitationCreated": {
    fr: "Une invitation a été créée — partagez le lien et le code avec l'autre partie.",
    ar: "تم إنشاء دعوة — شارك الرابط والرمز مع الطرف الآخر."
  },

  // -------------------------------------------------------------- invitepanel
  "ipanel.create": { fr: "Créer l'invitation", ar: "إنشاء الدعوة" },
  "ipanel.creating": { fr: "Création…", ar: "جارٍ الإنشاء…" },
  "ipanel.title": { fr: "Inviter votre contrepartie", ar: "دعوة الطرف المقابل" },
  "ipanel.desc": {
    fr: "Envoyez ce lien et ce code à l'autre partie par votre propre canal. Expire le {date}.",
    ar: "أرسل الرابط والرمز إلى الطرف الآخر عبر قناتك الخاصة. تنتهي الصلاحية في {date}."
  },
  "ipanel.link": { fr: "Lien d'invitation", ar: "رابط الدعوة" },
  "ipanel.copied": { fr: "Copié", ar: "تم النسخ" },
  "ipanel.copy": { fr: "Copier", ar: "نسخ" },
  "ipanel.code": { fr: "Code de confirmation (à partager séparément)", ar: "رمز التأكيد (يُشارك على حدة)" },
  "ipanel.note": {
    fr: "Le fil de ce contrat s'ouvre à la partie invitée une fois l'accord signé. Une invitation par contrat — réutiliser le lien est sans problème.",
    ar: "تفتح محادثة هذا العقد للطرف المدعو بعد توقيع الاتفاقية. دعوة واحدة لكل عقد — إعادة استعمال الرابط أمر مقبول."
  },
  "ipanel.errCreate": { fr: "impossible de créer l'invitation", ar: "تعذّر إنشاء الدعوة" },

  // ------------------------------------------------------------- contract builder
  "harden.stepContract": { fr: "Contrat", ar: "العقد" },
  "harden.stepAnalyse": { fr: "Analyse", ar: "التحليل" },
  "harden.stepAncrage": { fr: "Ancrage", ar: "التثبيت" },
  "harden.stepLitige": { fr: "Différend", ar: "النزاع" },
  "harden.title": { fr: "Nouveau contrat", ar: "عقد جديد" },
  "harden.intro": {
    fr: "Composez votre contrat ou déposez un contrat existant pour le faire auditer : les parties, les éléments essentiels, puis l'analyse de lacunes. Insaf détecte les anomalies et ne modifie jamais votre texte.",
    ar: "أنشئ عقدك أو أودع عقدًا قائمًا لمراجعته: الطرفان، الأركان، ثم تحليل النواقص. تكتشف إنصاف الملاحظات ولا تُعدّل نصّك أبدًا."
  },
  "harden.agentOk": { fr: "agent : prêt", ar: "الوكيل: جاهز" },
  "harden.agentDown": { fr: "hors ligne", ar: "غير متصل" },
  "harden.agentDownBanner": { fr: "Le service d'analyse est hors ligne — réessayez dans un instant.", ar: "خدمة التحليل غير متاحة — حاول مجددًا بعد قليل." },
  "harden.noCorpusBanner": {
    fr: "Le corpus juridique n'est pas chargé : les citations légales seront absentes jusqu'à son installation. L'analyse fonctionne quand même.",
    ar: "المدونة القانونية غير محمّلة: لن تظهر أي استشهادات قانونية حتى تركيبها. يعمل التحليل على أي حال."
  },
  "harden.builtTitle": { fr: "Votre contrat — version initiale (non modifiée)", ar: "عقدك — النسخة الأولية (غير معدَّلة)" },
  "harden.ingestedTitle": { fr: "Contrat déposé — version initiale", ar: "العقد المُودَع — النسخة الأولية" },
  "findings.contractAnchored": { fr: "Contrat ancré sur la chaîne", ar: "العقد مُثبَّت على السلسلة" },
  "findings.analysisAnchored": { fr: "Analyse ancrée — audit vérifiable", ar: "التحليل مُثبَّت — مراجعة قابلة للتحقق" },
  "findings.analysisTx": { fr: "empreinte de l'audit", ar: "بصمة المراجعة" },
  "findings.analysisSummary": {
    fr: "{total} anomalies (dont {grounded} fondées) · {gaps} clauses manquantes",
    ar: "الملاحظات: {total} (منها {grounded} مستندة) · النواقص: {gaps}"
  },
  "events.analysis": { fr: "analyse ancrée", ar: "تحليل مُثبَّت" },
  "harden.modeCreate": { fr: "Créer un contrat", ar: "إنشاء عقد" },
  "harden.modeAudit": { fr: "Analyser un contrat existant", ar: "تحليل عقد قائم" },
  "harden.ingestIntro": {
    fr: "Collez le texte d'un contrat déjà en circulation : Insaf y détecte les anomalies, les lacunes et les obligations, et n'applique aucune modification.",
    ar: "ألصق نص عقد متداول: تكتشف إنصاف الملاحظات والنواقص والالتزامات، ولا تُجري أي تعديل."
  },
  "harden.loadBadDemo": { fr: "Charger le contrat non conforme (démo)", ar: "تحميل العقد غير الممتثل (تجريبي)" },
  "harden.badDemoHint": {
    fr: "Exemple fourni en français — quantités approximatives, délai raisonnable, résiliation unilatérale… L'analyse cite le COC (FR).",
    ar: "المثال بالفرنسية — كميات تقريبية، أجل معقول، فسخ أحادي الجانب… يستند التحليل إلى مجلّة الالتزامات والعقود (FR)."
  },
  "harden.analyseContract": { fr: "Analyser le contrat", ar: "تحليل العقد" },
  "harden.pastePlaceholder": { fr: "Collez ici le texte intégral du contrat…", ar: "ألصق هنا النص الكامل للعقد…" },
  "harden.obligationsNote": {
    fr: "Les obligations sont extraites de votre texte et ancrées quand confirmées — voir le fil. Le silence est un fait enregistré, pas une accusation.",
    ar: "تُستخرج الالتزامات من نصّك وتُثبَّت على السلسلة عند تأكيدها — راجع المحادثة. الصمت حقيقة مسجّلة، وليس اتهامًا."
  },

  // ----------------------------------------------------------------- parties
  "parties.title": { fr: "Les parties", ar: "الطرفان" },
  "parties.a": { fr: "Partie A — vous", ar: "الطرف أ — أنت" },
  "parties.b": { fr: "Partie B — la contrepartie", ar: "الطرف ب — الطرف المقابل" },
  "parties.type": { fr: "Type de personne", ar: "نوع الشخص" },
  "form.physique": { fr: "Personne physique", ar: "شخص طبيعي" },
  "form.morale": { fr: "Personne morale", ar: "شخص معنوي" },
  "form.givenName": { fr: "Prénom / Raison sociale", ar: "الاسم / التسمية الاجتماعية" },
  "form.familyName": { fr: "Nom / Sigle", ar: "اللقب / الاختصار" },
  "form.cin": { fr: "N° de carte d'identité nationale (CIN)", ar: "رقم بطاقة التعريف الوطنية" },
  "form.legalForm": { fr: "Forme juridique", ar: "الشكل القانوني" },
  "form.matricule": { fr: "Matricule fiscal", ar: "المعرّف الجبائي" },
  "form.address": { fr: "Adresse", ar: "العنوان" },
  "legal.ei": { fr: "Entreprise individuelle", ar: "مؤسسة فردية" },
  "legal.sarl": { fr: "Société à responsabilité limitée", ar: "شركة ذات مسؤولية محدودة" },
  "legal.suarl": { fr: "Société unipersonnelle à responsabilité limitée", ar: "شركة ذات مسؤولية محدودة بشريك وحيد" },
  "legal.sa": { fr: "Société anonyme", ar: "شركة مساهمة" },
  "legal.snc": { fr: "Société en nom collectif", ar: "شركة تضامن" },
  "legal.scs": { fr: "Société en commandite simple", ar: "شركة مقارضة بسيطة" },
  "legal.sca": { fr: "Société en commandite par actions", ar: "شركة مقارضة بالأسهم" },
  "legal.participation": { fr: "Société en participation", ar: "شركة محاصة / شركة مشاركة" },
  "legal.civile": { fr: "Société civile", ar: "شركة مدنية" },
  "legal.gie": { fr: "Groupement d'intérêt économique", ar: "مجموعة ذات نفع اقتصادي" },

  // --------------------------------------------------------------- essentials
  "essentials.title": { fr: "Éléments essentiels du contrat", ar: "أركان العقد" },
  "essentials.sub": {
    fr: "La capacité, le consentement, la cause et l'objet sont les éléments qu'un contrat tunisien doit contenir (art. 1 COC). Leurs déclarations sont déjà rédigées — modifiez-les librement.",
    ar: "الأهلية والرضا والسبب والمحل أركان يجب أن يتضمنها العقد التونسي (الفصل 1 مجلة الالتزامات والعقود). بياناتها جاهزة — عدّل بحرية."
  },
  "essentials.capacite": { fr: "Capacité", ar: "الأهلية" },
  "essentials.consentement": { fr: "Consentement", ar: "الرضا" },
  "essentials.cause": { fr: "Cause", ar: "السبب" },
  "essentials.objet": { fr: "Objet (déterminé, licite, quantifié, valorisé)", ar: "المحل (معيّن، جائز، محدد الكمية، ذو قيمة)" },
  "objet.possible": { fr: "Licite et possible", ar: "جائز وممكن" },
  "objet.specifique": { fr: "Description des biens / prestations", ar: "وصف السلع / الخدمات" },
  "objet.quantite": { fr: "Quantité", ar: "الكمية" },
  "objet.valorisation": { fr: "Prix / valorisation", ar: "الثمن / القيمة" },

  // ---------------------------------------------------------------- clauses
  "clauses.title": { fr: "Clauses du contrat", ar: "شروط العقد" },
  "clauses.sub": {
    fr: "Ajoutez les clauses que vous voulez couvrir (livraison, paiement, garantie, résiliation…). Ce qui manque sera signalé par l'analyse.",
    ar: "أضف الشروط التي تريد تغطيتها (التسليم، الدفع، الضمان، الفسخ…). سيشير التحليل إلى ما هو ناقص."
  },
  "clauses.add": { fr: "Ajouter une clause", ar: "أضف شرطًا" },
  "clauses.remove": { fr: "Retirer", ar: "حذف" },
  "clauses.titlePlaceholder": { fr: "Titre de la clause (ex. : Livraison)", ar: "عنوان الشرط (مثال: التسليم)" },
  "clauses.textPlaceholder": { fr: "Texte complet de la clause…", ar: "نص الشرط كاملًا…" },
  "clauses.empty": {
    fr: "Des clauses par défaut (livraison, paiement) sont déjà proposées. Ajoutez les vôtres en partant de ce modèle.",
    ar: "شروط افتراضية (التسليم، الدفع) مقترحة مسبقًا. أضف شروطك انطلاقًا من هذا النموذج."
  },

  // ---------------------------------------------------------------- builder
  "builder.submit": { fr: "Rédiger le contrat et analyser", ar: "صياغة العقد وتحليله" },
  "builder.busy": {
    fr: "Rédaction en cours — le contrat est analysé, ancré, consolidé…",
    ar: "جارٍ الصياغة — يتم تحليل العقد وتثبيته وتحصينه…"
  },
  "builder.partyNamesWarn": {
    fr: "Les deux parties doivent avoir un nom pour être identifiées — remplissez Partie A et Partie B.",
    ar: "يجب أن يحمل الطرفان اسمًا ليتم التعرف عليهما — عبّئ الطرف أ والطرف ب."
  },
  "clause.seedDelivery": {
    fr: "Livraison",
    ar: "التسليم"
  },
  "clause.seedDeliveryText": {
    fr: "Le fournisseur livre les marchandises commandées dans un délai de 7 jours ouvrables à compter de la confirmation de la commande.",
    ar: "يسلّم المورد البضائع المطلوبة في أجل سبعة أيام عمل من تأكيد الطلب."
  },
  "clause.seedPayment": {
    fr: "Paiement",
    ar: "الدفع"
  },
  "clause.seedPaymentText": {
    fr: "L'acheteur règle le prix convenu par virement bancaire dans un délai de 30 jours à compter de la livraison.",
    ar: "يخلص المشتري الثمن المتفق عليه بالتحويل البنكي في أجل 30 يوما من التسليم."
  },
  "essencial.defaultCapacite": {
    fr: "Les parties déclarent avoir la capacité juridique requise pour contracter.",
    ar: "يصرّح الطرفان بأن لديهما الأهلية القانونية المطلوبة للتعاقد."
  },
  "essencial.defaultConsentement": {
    fr: "Les parties consentent à ce contrat en pleine connaissance de cause.",
    ar: "يرضى الطرفان بهذا العقد عن علم ويقين."
  },
  "essencial.defaultCause": {
    fr: "La cause de cette obligation est une contrepartie licite, déterminée et convenue entre les parties.",
    ar: "سبب هذا الالتزام مقابِل جائز معيّن ومتفق عليه بين الطرفين."
  },
  "objet.defaultPossible": {
    fr: "La prestation ci-dessous est licite et possible.",
    ar: "الخدمة المذكورة أدناه جائزة وممكنة."
  },

  // -------------------------------------------------------------- demo content
  "demo.personA": { fr: "Ines Trabelsi", ar: "إيناس الطرابلسي" },
  "demo.cinA": { fr: "1371718", ar: "1371718" },
  "demo.addrA": { fr: "Tunis, Cité El Khadra", ar: "تونس — حي الخضراء" },
  "demo.moraleB": { fr: "Bois du Nord", ar: "بوا دو نورد" },
  "demo.formB": { fr: "SARL", ar: "SARL" },
  "demo.matriculeB": { fr: "1371907/D", ar: "1371907/D" },
  "demo.addrB": { fr: "Ariana", ar: "أريانة" },
  "demo.fill": { fr: "Remplir avec la démo", ar: "تعبئة بالبيانات التجريبية" },

  // ------------------------------------------ findings / accept / dispute steps
  "findings.missingCount": { fr: "Clauses obligatoires manquantes :", ar: "شروط إلزامية ناقصة:" },
  "findings.recommendationsCount": { fr: "Anomalies & recommandations :", ar: "الملاحظات والتوصيات:" },
  "findings.anomalyNote": {
    fr: "L'IA détecte des anomalies et ne modifie jamais votre contrat : rien de ce qui suit n'est appliqué au texte. Le cas échéant, une correction reste votre décision.",
    ar: "تُحدِّد الذكاء الاصطناعي الملاحظات ولا تُعدِّل عقدك أبدًا: لا شيء مما يلي يُطبَّق على النص. أي تصحيح يبقى قرارك."
  },
  "findings.currentClause": { fr: "Clause actuelle — non modifiée", ar: "النص الحالي — غير معدَّل" },
  "findings.suggestionNotApplied": { fr: "Piste de rédaction — non appliquée", ar: "اقتراح صياغة — غير مطبَّق" },
  "findings.basis": { fr: "Base légale :", ar: "الأساس القانوني:" },
  "findings.noBasis": {
    fr: "Aucune base légale retrouvée pour ce point — à vérifier avec votre juriste.",
    ar: "لا أساس قانوني مسترجَع لهذه النقطة — راجعها مع مستشارك القانوني."
  },
  "findings.noneMissing": { fr: "Aucune clause obligatoire manquante.", ar: "لا شروط إلزامية ناقصة." },
  "findings.noneRecommendations": { fr: "Aucune anomalie détectée.", ar: "لا ملاحظات مكتشفة." },
  "findings.obligations": { fr: "Obligations extraites", ar: "الالتزامات المستخرجة" },
  "findings.acknowledge": { fr: "J'ai pris connaissance", ar: "اطّلعت" },
  "findings.toDispute": { fr: "Passer au différend (simulation)", ar: "الانتقال إلى النزاع (محاكاة)" },
  "accept.versions": { fr: "Versions du contrat", ar: "إصدارات العقد" },
  "accept.storedOnChain": {
    fr: "Contrat stocké automatiquement sur la chaîne après l'analyse",
    ar: "العقد يُخزَّن تلقائيًا على السلسلة بعد التحليل"
  },
  "accept.note": {
    fr: "Aucune modification n'a été apportée par l'IA : le contrat reste tel que déposé et seule son empreinte est ancrée sur la chaîne. Rien n'est jamais supprimé — ajout seul.",
    ar: "لم تُجرِ الذكاء الاصطناعي أي تعديل: يبقى العقد كما أُودِع ويُثبَّت على السلسلة لفظُ فقط. لا يُحذف شيء أبدًا — إضافة فقط."
  },
  "accept.parent": { fr: "parent", ar: "السلف" },
  "accept.anchored": { fr: "ancrée", ar: "مثبَّتة" },
  "accept.notAnchored": { fr: "non ancrée", ar: "غير مثبَّتة" },
  "accept.nothingAnchored": { fr: "Rien d'ancré pour l'instant.", ar: "لا شيء مثبَّت بعد." },
  "accept.toDashboard": { fr: "Voir dans le tableau de bord →", ar: "عرض في لوحة التحكم ←" },
  "dispute.intro": {
    fr: "Insaf est un terrain neutre : les deux parties voient le même bilan et les mêmes chiffres. Estimez l'issue judiciaire avant de décider d'une transaction.",
    ar: "إنصاف فضاء محايد: يرى الطرفان الحصيلة والأرقام نفسها. قدّر نتيجة التقاضي قبل البت في الصلح."
  },
  "dispute.versionBuyer": { fr: "Version de l'acheteur", ar: "رواية المشتري" },
  "dispute.versionSupplier": { fr: "Version du fournisseur", ar: "رواية المورد" },
  "dispute.statementBuyerDefault": {
    fr: "Les marchandises livrées ne sont pas conformes : livraison partielle et spécifications non respectées malgré mise en demeure.",
    ar: "البضائع المسلّمة غير مطابقة: تسليم جزئي وعدم احترام للمواصفات رغم الإنذار."
  },
  "dispute.statementSupplierDefault": {
    fr: "Toutes les commandes ont été livrées et le prix reste impayé malgré plusieurs relances.",
    ar: "تمّ تسليم جميع الطلبات ويبقى الثمن غير مُخلص رغم عدة تذكيرات."
  },
  "dispute.amount": { fr: "Montant en cause (TND)", ar: "المبلغ المتنازع فيه (دينار)" },
  "dispute.contested": { fr: "La dette est-elle contestée ?", ar: "هل الدَين متنازع فيه؟" },
  "dispute.yes": { fr: "Oui", ar: "نعم" },
  "dispute.no": { fr: "Non", ar: "لا" },
  "dispute.analyse": { fr: "Analyser le différend", ar: "تحليل النزاع" },
  "dispute.analysing": { fr: "Analyser…", ar: "جارٍ التحليل…" },
  "dispute.applicableVersion": { fr: "Version applicable", ar: "النسخة السارية" },
  "dispute.facts": { fr: "Tableau des faits", ar: "جدول الوقائع" },
  "dispute.agreed": { fr: "convenu", ar: "متّفق عليه" },
  "dispute.disputed": { fr: "contesté", ar: "متنازع فيه" },
  "dispute.unsupported": { fr: "non étayé", ar: "غير مدعَّم" },
  "dispute.noClause": { fr: "aucune clause rattachée", ar: "لا شرط مرتبط" },
  "dispute.courtOutlook": {
    fr: "Si vous allez au tribunal (données Doing Business 2020, Tunisie)",
    ar: "إذا لجأت إلى المحكمة (بيانات Doing Business 2020، تونس)"
  },
  "dispute.duration": { fr: "Durée :", ar: "المدة:" },
  "dispute.days": { fr: "jours", ar: "يومًا" },
  "dispute.cost": { fr: "Frais :", ar: "التكاليف:" },
  "dispute.source": { fr: "Source :", ar: "المصدر:" },
  "dispute.settlement": { fr: "Options de règlement", ar: "خيارات التسوية" },
  "dispute.monetary": { fr: "monétaire", ar: "مادي" },
  "dispute.nonMonetary": { fr: "non-monétaire", ar: "غير مادي" },
  "dispute.lawyerReview": { fr: "Revue par un avocat requise avant signature.", ar: "مراجعة محامٍ مطلوبة قبل التوقيع." },
  "err.network": { fr: "erreur réseau", ar: "خطأ في الشبكة" },
  "err.couldNotPost": { fr: "impossible d'envoyer", ar: "تعذّر الإرسال" },
  "err.assistantUnreachable": { fr: "l'assistant est injoignable", ar: "المساعد غير متاح" },
  "err.genFailed": { fr: "génération échouée", ar: "فشل الإنشاء" },
  "err.demoFailed": { fr: "démo échouée", ar: "فشلت التجربة" },
  "err.acceptFailed": { fr: "échec de l'acceptation", ar: "تعذّر القبول" },
  "severity.critical": { fr: "critique", ar: "حرجة" },
  "severity.high": { fr: "élevée", ar: "عالية" },
  "severity.medium": { fr: "moyenne", ar: "متوسطة" },
  "severity.low": { fr: "faible", ar: "منخفضة" }
} as const satisfies Record<string, { fr: string; ar: string }>;