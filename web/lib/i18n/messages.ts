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
  "common.anchored": { fr: "Horodaté et enregistré", ar: "مؤرَّخ ومسجَّل" },
  "common.wizard": { fr: "assistant", ar: "معالج" },
  "common.hardened": { fr: "analysé", ar: "مُحلَّل" },

  // ----------------------------------------------------------------- topbar
  "topbar.tagline": {
    fr: "Insaf — justice commerciale pour les TPME",
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
    fr: "Pour les dirigeants de TPME : consolider un contrat, inviter l'autre partie, conserver une trace infalsifiable et régler les litiges avant le tribunal.",
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
  "dashboard.sectionTitle": { fr: "Contrats", ar: "العقود" },
  "dashboard.sectionSub": {
    fr: "une identité de contrat · plusieurs versions · ajout seul",
    ar: "هوية عقد واحدة · عدة إصدارات · إضافة فقط"
  },
  "dashboard.empty": {
    fr: "Rien ici pour l'instant. Créez un contrat avec « Nouveau contrat » ci-dessus, ou déposez-y un contrat existant pour le faire analyser.",
    ar: "لا شيء بعد. أنشئ عقدًا عبر «عقد جديد» أعلاه، أو أودِع عقدًا قائمًا لتحليله."
  },
  "dashboard.errLoad": { fr: "impossible de charger vos contrats", ar: "تعذّر تحميل عقودك" },
  "dashboard.msme": { fr: "TPME", ar: "المؤسسة" },
  "dashboard.counterparty": { fr: "Contrepartie", ar: "الطرف المقابل" },
  "dashboard.versions": { fr: "version", ar: "إصدار" },
  "dashboard.versionsMany": { fr: "versions", ar: "إصدارات" },
  "dashboard.tier": { fr: "niveau", ar: "المستوى" },
  "dashboard.inviteOpen": { fr: "invitation ouverte", ar: "الدعوة مفتوحة" },
  "dashboard.until": { fr: "Échéance :", ar: "الأجل:" },
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
  // Dispute-prevention monitoring: the chat is the check-in surface.
  "thread.monitorTitle": { fr: "Suivi préventif", ar: "المتابعة الوقائية" },
  "thread.monitorBody": {
    fr: "Les échéances du contrat sont suivies : une confirmation est horodatée, puis ancrée sur la chaîne. Les deux parties voient exactement les mêmes faits.",
    ar: "تُتتبَّع آجال العقد: يُسجَّل التأكيد بوقته ثم يُثبَّت على السلسلة. يرى الطرفان نفس الوقائع تمامًا."
  },
  "thread.monitorDelivery": { fr: "Livraison attendue", ar: "التسليم المتوقَّع" },
  "thread.monitorPayment": { fr: "Paiement attendu", ar: "الدفع المتوقَّع" },
  "thread.monitorGeneric": { fr: "Échéance", ar: "أجل" },
  "thread.monitorDueSoon": { fr: "dans {days} jour(s)", ar: "خلال {days} يومًا" },
  "thread.monitorDueToday": { fr: "aujourd'hui", ar: "اليوم" },
  "thread.monitorOverdue": {
    fr: "En retard — exécution non confirmée (échéance : {date})",
    ar: "مستحق في {date}، لا تأكيد مسجَّل"
  },
  "thread.monitorEstimated": { fr: "échéance estimée", ar: "أجل تقديري" },
  "thread.monitorAtRisk": { fr: "à confirmer", ar: "بانتظار التأكيد" },
  "thread.monitorComplete": { fr: "Exécutée", ar: "مُنفَّذة" },
  "thread.monitorConfirmPerformed": {
    fr: "Confirmer la réalisation",
    ar: "تأكيد الإنجاز"
  },
  "thread.monitorConfirmNotYet": { fr: "Pas encore", ar: "ليس بعد" },
  "thread.monitorBreach": {
    fr: "Signaler comme non réalisée",
    ar: "الإبلاغ عن عدم الإنجاز"
  },
  "thread.monitorEscalate": {
    fr: "Entamer une résolution amiable",
    ar: "الشروع في حلٍّ ودي"
  },
  "thread.monitorAdvance": { fr: "Simuler +4 jours", ar: "محاكاة +4 أيام" },
  "thread.monitorAmicable": {
    fr: "Phase amiable ouverte — une résolution est tentée entre les parties.",
    ar: "مفتوحة — يُحاول التوصل إلى حلٍّ ودي بين الطرفين."
  },
  "thread.monitorStatus": { fr: "Statut", ar: "الحالة" },
  "thread.monitorAnchored": { fr: "ancrée", ar: "مثبَّتة" },

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
  "detail.chainLog": { fr: "Journal des événements", ar: "سجل الأحداث" },
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
  "findings.contractAnchored": { fr: "Contrat horodaté et enregistré", ar: "العقد مؤرَّخ ومسجَّل" },
  "findings.analysisAnchored": { fr: "Analyse authentifiée — vérifiable", ar: "تحليل موثَّق — قابل للتحقق" },
  "findings.analysisTx": { fr: "empreinte de l'audit", ar: "بصمة المراجعة" },
  "findings.analysisSummary": {
    fr: "{total} anomalies (dont {grounded} fondées) · {gaps} clauses manquantes",
    ar: "الملاحظات: {total} (منها {grounded} مستندة) · النواقص: {gaps}"
  },
  "events.obligation_performed": { fr: "Obligation exécutée", ar: "التزام مُنفَّذ" },
  "events.obligation_breached": { fr: "Obligation non respectée", ar: "التزام غير محترَم" },
  "events.obligation_attested": { fr: "Obligation attestée", ar: "التزام مُثبَت" },
  "events.dispute_opened": { fr: "Litige ouvert", ar: "نزاع مفتوح" },
  "events.dispute_resolved": { fr: "Litige résolu", ar: "نزاع مُسوَّى" },
  "events.settlement_signed": { fr: "Accord signé", ar: "اتفاق موقَّع" },
  "events.analysis_completed": { fr: "Analyse authentifiée", ar: "تحليل موثَّق" },
  "party.p_buyer": { fr: "Acheteur", ar: "المشتري" },
  "party.p_supplier": { fr: "Fournisseur", ar: "المزوّد" },
  "detail.versionsNote": { fr: "Les nouvelles versions sont ajoutées sans écraser les précédentes.", ar: "تُضاف النسخ الجديدة دون حذف السابقة." },
  "ms.performedOn": { fr: "Exécutée le {date}", ar: "نُفِّذت في {date}" },
  "ms.dueOn": { fr: "Échéance : {date}", ar: "الأجل: {date}" },
  "events.analysis": { fr: "Analyse authentifiée", ar: "تحليل موثَّق" },
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
  "accept.anchored": { fr: "Horodatée et enregistrée", ar: "مؤرَّخة ومسجَّلة" },
  "accept.notAnchored": { fr: "Non enregistrée", ar: "غير مسجَّلة" },
  "accept.nothingAnchored": { fr: "Rien d'ancré pour l'instant.", ar: "لا شيء مثبَّت بعد." },
  "accept.toDashboard": { fr: "Voir dans le tableau de bord →", ar: "عرض في لوحة التحكم ←" },
  "err.network": { fr: "erreur réseau", ar: "خطأ في الشبكة" },
  "err.couldNotPost": { fr: "impossible d'envoyer", ar: "تعذّر الإرسال" },
  "err.assistantUnreachable": { fr: "l'assistant est injoignable", ar: "المساعد غير متاح" },
  "err.demoFailed": { fr: "démo échouée", ar: "فشلت التجربة" },
  "err.acceptFailed": { fr: "échec de l'acceptation", ar: "تعذّر القبول" },
  "severity.critical": { fr: "Risque critique", ar: "خطر حرج" },
  "severity.high": { fr: "Risque élevé", ar: "خطر عالٍ" },
  "severity.medium": { fr: "Risque moyen", ar: "خطر متوسط" },
  "cs.title": { fr: "Avant d'entrer dans la conversation", ar: "قبل الدخول إلى المحادثة" },
  "cs.intro": {
    fr: "Ce fil est un registre partagé. Avant d'y participer, indiquez ce que vous acceptez.",
    ar: "هذه المحادثة سجلّ مشترك. قبل المشاركة فيها، بيّن ما توافق عليه."
  },
  "cs.required": { fr: "obligatoire", ar: "إلزامي" },
  "cs.optional": { fr: "facultatif", ar: "اختياري" },
  "cs.recordTitle": { fr: "Enregistrement de la conversation", ar: "تسجيل المحادثة" },
  "cs.recordBody": {
    fr: "Vos messages, les dates et les confirmations d'échéances sont enregistrés et conservés. Ils constituent la trace du contrat et ne peuvent pas être supprimés une fois écrits.",
    ar: "تُسجَّل رسائلك وتواريخها وتأكيدات الآجال وتُحفَظ. تشكّل أثر العقد ولا يمكن حذفها بعد كتابتها."
  },
  "cs.shareTitle": { fr: "Visibilité par l'autre partie", ar: "اطّلاع الطرف الآخر" },
  "cs.shareBody": {
    fr: "L'autre partie voit exactement le même fil que vous, y compris vos messages et vos confirmations. Rien ne lui est caché, et rien ne vous est caché.",
    ar: "يرى الطرف الآخر المحادثة نفسها تمامًا، بما في ذلك رسائلك وتأكيداتك. لا شيء يُخفى عنه ولا عنك."
  },
  "cs.termsTitle": { fr: "Empreinte sur registre infalsifiable", ar: "بصمة على سجل غير قابل للتغيير" },
  "cs.termsBody": {
    fr: "L'empreinte de certains événements (confirmation d'une échéance, ouverture d'un litige, accord signé) est inscrite sur un registre infalsifiable. Le contenu de vos messages n'y est jamais inscrit — seulement une empreinte et une date.",
    ar: "تُدوَّن بصمة بعض الأحداث (تأكيد أجل، فتح نزاع، اتفاق موقَّع) على سجل غير قابل للتغيير. لا يُدوَّن مضمون رسائلك أبدًا، بل البصمة والتاريخ فقط."
  },
  "cs.notifyTitle": { fr: "Rappels d'échéance", ar: "تذكيرات الآجال" },
  "cs.notifyBody": {
    fr: "Recevoir un rappel neutre lorsqu'une échéance approche. Vous pouvez participer sans l'activer.",
    ar: "تلقّي تذكير محايد عند اقتراب أجل. يمكنك المشاركة دون تفعيله."
  },
  "cs.rights": {
    fr: "Vous pouvez demander une copie de vos données ou retirer votre consentement à tout moment en écrivant à la partie qui vous a invité. Le retrait vaut pour l'avenir : il n'efface pas les faits déjà enregistrés, qui font partie de la trace du contrat.",
    ar: "يمكنك طلب نسخة من بياناتك أو سحب موافقتك في أي وقت بمراسلة الطرف الذي دعاك. يسري السحب على المستقبل ولا يمحو الوقائع المسجَّلة سابقًا، فهي جزء من أثر العقد."
  },
  "cs.acceptAll": { fr: "Tout accepter", ar: "قبول الكل" },
  "cs.continue": { fr: "Accepter et continuer", ar: "الموافقة والمتابعة" },
  "cs.mustAccept": {
    fr: "Les trois premiers points sont nécessaires pour participer au fil.",
    ar: "النقاط الثلاث الأولى ضرورية للمشاركة في المحادثة."
  },
  "cs.errFailed": { fr: "enregistrement du consentement impossible", ar: "تعذّر تسجيل الموافقة" },
  "cs.recorded": { fr: "Consentement enregistré le {date}", ar: "سُجِّلت الموافقة في {date}" },
  "severity.low": { fr: "Risque faible", ar: "خطر منخفض" },

  // ------------------------------------------------------- staged demo
  "demo.bar": { fr: "Scénario de démonstration", ar: "سيناريو تجريبي" },
  "demo.barBody": {
    fr: "Contrat réel, anomalies réelles, litige en cours. Toutes les données sont préchargées.",
    ar: "عقد حقيقي، مخالفات حقيقية، نزاع جارٍ. جميع البيانات محمّلة مسبقًا."
  },
  "demo.reset": { fr: "Réinitialiser", ar: "إعادة التعيين" },
  "demo.resetDone": { fr: "Scénario réinitialisé.", ar: "أُعيد ضبط السيناريو." },

  // ------------------------------------------------------- monitoring
  "ms.title": { fr: "Suivi des échéances", ar: "متابعة الآجال" },
  "ms.open": { fr: "{n} en attente", ar: "{n} قيد الانتظار" },
  "ms.done": { fr: "{n} confirmée(s)", ar: "{n} مؤكَّدة" },
  "ms.expected": { fr: "attendu", ar: "المتوقَّع" },
  "ms.received": { fr: "reçu", ar: "المستلَم" },
  "ms.short": { fr: "manquant : {n}", ar: "الناقص: {n}" },
  "ms.evidence": { fr: "Pièce attendue : {what}", ar: "الوثيقة المطلوبة: {what}" },
  "ms.anchoredTag": { fr: "Horodatée et enregistrée", ar: "مؤرَّخة ومسجَّلة" },
  "ms.openDispute": { fr: "Voir le règlement du litige", ar: "عرض تسوية النزاع" },

  // ------------------------------------------------------- analysis
  "an.title": { fr: "Analyse du contrat", ar: "تحليل العقد" },
  "an.statClauses": { fr: "Clauses analysées", ar: "فصول محلَّلة" },
  "an.statGaps": { fr: "Points manquants ou à préciser", ar: "نقاط ناقصة أو تحتاج إلى توضيح" },
  "an.statRisks": { fr: "Anomalies relevées", ar: "مخالفات مرصودة" },
  "an.grounded": {
    fr: "{n} des {total} recommandations citent un article retrouvé dans le corpus.",
    ar: "{n} من أصل {total} توصيات تستند إلى فصل مسترجَع من المدوّنة."
  },
  "an.countUnenforceable": { fr: "risque de non-conformité", ar: "خطر عدم مطابقة" },
  "an.countUnenforceablePl": { fr: "risques de non-conformité", ar: "مخاطر عدم مطابقة" },
  "an.countAmbiguous": { fr: "clause ambiguë", ar: "فصل غامض" },
  "an.countAmbiguousPl": { fr: "clauses ambiguës", ar: "فصول غامضة" },
  "an.countAsymmetric": { fr: "clause déséquilibrée", ar: "فصل غير متوازن" },
  "an.countAsymmetricPl": { fr: "clauses déséquilibrées", ar: "فصول غير متوازنة" },
  "an.kindUnenforceable": { fr: "Risque de non-conformité", ar: "خطر عدم مطابقة" },
  "an.kindAmbiguous": { fr: "Clause ambiguë", ar: "فصل غامض" },
  "an.kindAsymmetric": { fr: "Clause déséquilibrée", ar: "فصل غير متوازن" },
  "an.current": { fr: "Rédaction actuelle", ar: "الصيغة الحالية" },
  "an.proposed": { fr: "Proposition de rédaction", ar: "اقتراح صياغة" },
  "an.notApplied": { fr: "Non appliquée", ar: "غير مطبَّقة" },
  "an.verified": { fr: "Fondement juridique identifié", ar: "أساس قانوني محدَّد" },
  "an.basis": { fr: "Fondement juridique", ar: "الأساس القانوني" },
  "an.noBasis": { fr: "Aucun fondement juridique retrouvé", ar: "لم يُعثر على أساس قانوني" },
  "an.gapsTitle": { fr: "Clauses manquantes ou à préciser", ar: "فصول ناقصة أو تحتاج إلى توضيح" },
  "an.risksTitle": { fr: "Anomalies relevées dans les clauses rédigées", ar: "مخالفات مرصودة في الفصول المحرَّرة" },
  "an.neverModified": {
    fr: "Le système ne modifie jamais le contrat automatiquement. Toute proposition de rédaction reste soumise à validation et signature des parties.",
    ar: "لا يعدّل النظام نصّ العقد أبدًا. لا تدخل أي صيغة مقترحة حيّز النفاذ إلا بتوقيع الطرفين."
  },

  // ------------------------------------------------------- dispute
  "dp.title": { fr: "Règlement du litige", ar: "تسوية النزاع" },
  "dp.subtitle": {
    fr: "Les deux parties voient exactement ce tableau, les mêmes chiffres et les mêmes options.",
    ar: "يرى الطرفان هذا الجدول نفسه، وبالأرقام والخيارات ذاتها."
  },
  "dp.governing": { fr: "Version applicable", ar: "النسخة المنطبقة" },
  "dp.claims": { fr: "Ce que chaque partie demande", ar: "ما يطلبه كل طرف" },
  "dp.ledger": { fr: "Tableau des faits", ar: "جدول الوقائع" },
  "dp.agreed": { fr: "établi", ar: "ثابت" },
  "dp.disputed": { fr: "contesté", ar: "متنازع فيه" },
  "dp.unsupported": { fr: "non étayé", ar: "غير مدعوم" },
  "dp.batna": { fr: "Si vous allez au tribunal", ar: "إذا لجأتم إلى المحكمة" },
  "dp.duration": { fr: "Durée estimée", ar: "المدة المقدَّرة" },
  "dp.cost": { fr: "Coût estimé", ar: "الكلفة المقدَّرة" },
  "dp.costPct": { fr: "Part de la créance", ar: "نسبة من الدين" },
  "dp.claimAmount": { fr: "Montant en jeu", ar: "المبلغ موضوع النزاع" },
  "dp.source": { fr: "Source", ar: "المصدر" },
  "dp.options": { fr: "Options de règlement", ar: "خيارات التسوية" },
  "dp.optionsNote": {
    fr: "Aucune option n'est recommandée : le choix appartient aux parties. Un accord ne prend effet que lorsque les deux parties l'ont accepté.",
    ar: "لا يُوصى بأي خيار: القرار للطرفين. لا يسري الاتفاق إلا بقبول الطرفين معًا."
  },
  "dp.accept": { fr: "Accepter cette option", ar: "قبول هذا الخيار" },
  "dp.decline": { fr: "Écarter", ar: "استبعاد" },
  "dp.youAccepted": { fr: "vous avez accepté", ar: "لقد قبلتَ" },
  "dp.otherAccepted": { fr: "l'autre partie a accepté", ar: "قبل الطرف الآخر" },
  "dp.bothAccepted": { fr: "accord conclu", ar: "تمّ الاتفاق" },
  "dp.youDeclined": { fr: "vous avez écarté", ar: "لقد استبعدتَ" },
  "dp.waiting": { fr: "en attente de l'autre partie", ar: "بانتظار الطرف الآخر" },
  "dp.fixesRoot": { fr: "corrige aussi le contrat", ar: "يصحّح العقد أيضًا" },
  "dp.suggestions": { fr: "Ce que le système observe", ar: "ما يلاحظه النظام" },
  "dp.suggestionsNote": {
    fr: "Observations adressées aux deux parties, jamais à l'une contre l'autre.",
    ar: "ملاحظات موجَّهة إلى الطرفين معًا، لا إلى أحدهما ضد الآخر."
  },
  "dp.lawyer": { fr: "Relecture par un avocat requise avant signature.", ar: "تُشترط مراجعة محامٍ قبل التوقيع." },
  "dp.settled": { fr: "Litige réglé", ar: "سُوّي النزاع" },
  "dp.settledBody": {
    fr: "Les deux parties ont accepté « {label} ». L'accord vaut transaction obligatoire entre les parties ; son empreinte est ancrée.",
    ar: "قبل الطرفان «{label}». يُعدّ الاتفاق صلحًا ملزمًا بين الطرفين، وبصمته مثبَّتة."
  },
  "dp.open": { fr: "Ouvrir le règlement", ar: "فتح التسوية" },
  "dp.backThread": { fr: "Retour au fil", ar: "العودة إلى المحادثة" },
  "dp.noneYet": { fr: "Aucun litige ouvert sur ce contrat.", ar: "لا نزاع مفتوح بشأن هذا العقد." },
  "dp.anchoredAt": { fr: "Ouverture du litige ancrée", ar: "فتح النزاع مثبَّت" },

  // ------------------------------------------------------- verify
  "vf.button": { fr: "Vérifier l'intégrité", ar: "التحقّق من السلامة" },
  "vf.checking": { fr: "Vérification…", ar: "جارٍ التحقّق…" },
  "vf.ok": { fr: "Empreinte conforme", ar: "البصمة مطابقة" },
  "vf.okBody": {
    fr: "Le texte conservé correspond exactement à l'empreinte ancrée ({version}). Aucune modification depuis l'ancrage.",
    ar: "النص المحفوظ يطابق تمامًا البصمة المثبَّتة ({version}). لا تعديل منذ التثبيت."
  },
  "vf.fail": { fr: "Empreinte non conforme", ar: "البصمة غير مطابقة" },
  "vf.failBody": {
    fr: "Le texte conservé ne correspond plus à l'empreinte ancrée. C'est exactement ce que l'ancrage sert à détecter.",
    ar: "لم يعد النص المحفوظ يطابق البصمة المثبَّتة. هذا بالضبط ما يكشفه التثبيت."
  }
} as const satisfies Record<string, { fr: string; ar: string }>;