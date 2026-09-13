"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useI18n, type MsgKey } from "@/lib/i18n";
import TopBar from "@/components/TopBar";
import { BAD_SUPPLY_CONTRACT } from "./demoContract";

interface Health {
  agent_available: boolean;
  corpus_size?: number;
  grounding_available?: boolean;
  detail?: string;
}

interface Recommendation {
  rationale: string;
  risk_kind: string;
  original: string;
  proposed: string;
  applied: boolean;
  grounded: boolean;
  legal_basis?: { source_doc: string; article_ref: string; excerpt?: string }[];
  no_legal_basis?: { message: string };
}

interface Findings {
  contract_id: string;
  clauses: { clause_id: string; type: string }[];
  gaps: { label: string; why: string; severity: string }[];
  recommendations: Recommendation[];
  obligations: { obligor: string; obligee: string; action: string; trigger: string }[];
  grounding: { total_recommendations: number; grounded_recommendations: number };
  anchor?: { doc_id?: string; tx_hash?: string };
  analysis_anchor?: {
    attested?: boolean;
    tx_hash?: string;
    findings_hash?: string;
    total?: number;
    grounded?: number;
    gaps?: number;
  };
}

type Step = "builder" | "findings" | "accept";
const ORDER: Step[] = ["builder", "findings", "accept"];

interface PartyState {
  type: "physique" | "morale";
  givenName: string;
  familyName: string;
  cin: string;
  legalForm: string;
  matricule: string;
  address: string;
}

interface ClauseState {
  id: number;
  title: string;
  text: string;
}

const LEGAL_FORMS: { value: string; labelKey: MsgKey }[] = [
  { value: "EI", labelKey: "legal.ei" },
  { value: "SARL", labelKey: "legal.sarl" },
  { value: "SUARL", labelKey: "legal.suarl" },
  { value: "SA", labelKey: "legal.sa" },
  { value: "SNC", labelKey: "legal.snc" },
  { value: "SCS", labelKey: "legal.scs" },
  { value: "SCA", labelKey: "legal.sca" },
  { value: "Société en participation", labelKey: "legal.participation" },
  { value: "Société civile", labelKey: "legal.civile" },
  { value: "GIE", labelKey: "legal.gie" }
];

const SEVERITY_KEYS: Record<string, MsgKey> = {
  critical: "severity.critical",
  high: "severity.high",
  medium: "severity.medium",
  low: "severity.low"
};

const EVENT_LABELS: Record<string, MsgKey> = {
  analysis_completed: "events.analysis"
};

function partyDisplayName(p: PartyState): string {
  return [p.givenName.trim(), p.familyName.trim()].filter(Boolean).join(" ");
}

function identityPayload(p: PartyState): Record<string, string> {
  const id: Record<string, string> = {
    person_type: p.type,
    given_name: p.givenName.trim(),
    family_name: p.familyName.trim(),
    address: p.address.trim()
  };
  if (p.type === "physique") {
    id.cin = p.cin.trim();
  } else {
    id.legal_form = p.legalForm;
    id.matricule = p.matricule.trim();
  }
  return id;
}

export default function HardenPage() {
  const { lang, t } = useI18n();
  const [health, setHealth] = useState<Health | null>(null);
  const [step, setStep] = useState<Step>("builder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [contractId, setContractId] = useState("");
  const [findings, setFindings] = useState<Findings | null>(null);
  const [builtText, setBuiltText] = useState("");
  const [versions, setVersions] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);

  const [parties, setParties] = useState<PartyState[]>([
    { type: "physique", givenName: "", familyName: "", cin: "", legalForm: "SARL", matricule: "", address: "" },
    { type: "morale", givenName: "", familyName: "", cin: "", legalForm: "SARL", matricule: "", address: "" }
  ]);
  const [auditMode, setAuditMode] = useState(false); // false = builder, true = ingest an existing contract
  const [ingestText, setIngestText] = useState("");
  const [essentials, setEssentials] = useState({
    possible: "",
    specifique: "",
    quantite: "",
    valorisation: "",
    capacite: "",
    consentement: "",
    cause: ""
  });
  const [clauses, setClauses] = useState<ClauseState[]>([
    { id: 1, title: "", text: "" },
    { id: 2, title: "", text: "" }
  ]);

  async function syncHealth() {
    const { body } = await api<Health>("/api/agent/health");
    setHealth(body);
  }
  if (!health) syncHealth().catch(() => {});

  function show(next: Step) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function patchParty(i: number, field: keyof PartyState, value: string) {
    setParties((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }

  function patchEssentials(field: keyof typeof essentials, value: string) {
    setEssentials((prev) => ({ ...prev, [field]: value }));
  }

  function patchClause(id: number, field: keyof ClauseState, value: string) {
    setClauses((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  function addClause() {
    setClauses((prev) => [...prev, { id: Date.now(), title: "", text: "" }]);
  }

  function removeClause(id: number) {
    setClauses((prev) => prev.filter((c) => c.id !== id));
  }

  function useDemo() {
    setParties([
      { type: "physique", givenName: t("demo.personA").split(" ")[0], familyName: t("demo.personA").split(" ").slice(1).join(" "), cin: t("demo.cinA"), legalForm: "SARL", matricule: "", address: t("demo.addrA") },
      { type: "morale", givenName: t("demo.moraleB"), familyName: "", cin: "", legalForm: "SARL", matricule: t("demo.matriculeB"), address: t("demo.addrB") }
    ]);
    setEssentials({
      possible: t("objet.defaultPossible"),
      specifique: lang === "ar" ? "ألواح خشبية مضغوطة 18 مم" : "Panneaux de contreplaqué 18 mm",
      quantite: lang === "ar" ? "40 لوحاً شهرياً" : "40 unités par mois",
      valorisation: lang === "ar" ? "45 ديناراً للوح الواحد، أي 1800 دينار شهرياً" : "45 TND par panneau, soit 1800 TND par mois",
      capacite: t("essencial.defaultCapacite"),
      consentement: t("essencial.defaultConsentement"),
      cause: t("essencial.defaultCause")
    });
    setClauses([
      { id: 1, title: t("clause.seedDelivery"), text: t("clause.seedDeliveryText") },
      { id: 2, title: t("clause.seedPayment"), text: t("clause.seedPaymentText") }
    ]);
  }

  async function build() {
    setBusy(true);
    setError("");
    try {
      const body = {
        contract_id: `contract_${Date.now()}`,
        language: lang,
        profile: "supply",
        parties: [
          { role: "msme_owner", display_name: partyDisplayName(parties[0]), identity: identityPayload(parties[0]) },
          { role: "counterparty", display_name: partyDisplayName(parties[1]), identity: identityPayload(parties[1]) }
        ],
        essentials: {
          objet_possible: essentials.possible,
          objet_specifique: essentials.specifique,
          objet_quantite: essentials.quantite,
          objet_valorisation: essentials.valorisation,
          capacite: essentials.capacite,
          consentement: essentials.consentement,
          cause: essentials.cause
        },
        clauses: clauses
          .filter((c) => c.text.trim().length > 0)
          .map((c) => ({ title: c.title.trim(), text: c.text.trim() }))
      };
      const { ok, status, body: report } = await api<{ report: Findings; built_text?: string } | { error?: string }>("/api/agent/contracts/build", {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (!ok || !("report" in (report as object))) {
        throw new Error(String((report as { error?: string }).error || `build failed (${status})`));
      }
      const res = report as { report: Findings; built_text?: string };
      setContractId(res.report.contract_id);
      setFindings(res.report);
      setBuiltText(res.built_text || "");
      show("findings");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // Audit an existing contract: the agent anchors v1 untouched, then returns
  // the anomaly report. The text is never modified — the report only points
  // at what is missing, ambiguous, or unbalanced.
  async function ingest() {
    if (!ingestText.trim()) {
      setError("paste the contract text first");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const contract_id = `contract_${Date.now()}`;
      const fd = new FormData();
      fd.append("contract_id", contract_id);
      fd.append("profile", "supply");
      fd.append("text", ingestText);
      const { ok, status, body } = await api<Findings & { error?: string }>("/api/agent/harden", {
        method: "POST",
        body: fd
      });
      if (!ok) throw new Error(String(body.error || `analyse failed (${status})`));
      setContractId(body.contract_id || contract_id);
      setFindings(body as Findings);
      setBuiltText(ingestText); // shown under the "deposited" title
      setStep("findings");
      setAuditMode(true);
      show("findings");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function acknowledge() {
    setBusy(true);
    setError("");
    try {
      // The AI never alters the contract. "Accept" is an acknowledgment
      // recorded so the audit trail shows the findings were read; no version
      // is created and the text stays exactly as filed.
      const { ok, body } = await api<{ error?: string }>(`/api/agent/contracts/${encodeURIComponent(contractId)}/accept`, {
        method: "POST",
        body: JSON.stringify({ accepted_clause_ids: [] })
      });
      if (!ok) throw new Error(String(body.error || "accept failed"));
      await loadVersions();
      show("accept");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadVersions() {
    const v = await api<any>("/api/agent/contracts/" + encodeURIComponent(contractId));
    const h = await api<any>("/api/agent/contracts/" + encodeURIComponent(contractId) + "/history");
    if (v.ok) setVersions(v.body.versions || []);
    if (h.ok) setHistory(h.body.entries || []);
  }

  const steps: MsgKey[] = ["harden.stepContract", "harden.stepAnalyse", "harden.stepAncrage"];
  const unnamedParties = parties.filter((p) => !partyDisplayName(p)).length;

  return (
    <div className="app">
      <TopBar />
      <main className="main main-narrow">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>{t("harden.title")}</h1>
          {health && (
            <span className={"pill " + (health.agent_available ? "pill-ok" : "pill-warn")}>
              {health.agent_available ? t("harden.agentOk") : t("harden.agentDown")}
            </span>
          )}
        </div>
        <p className="muted">{t("harden.intro")}</p>

        <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 12 }}>
          {steps.map((label, i) => (
            <span key={label} className={"pill " + (ORDER.indexOf(step) >= i ? "pill-accent" : "")}>
              {i + 1} · {t(label)}
            </span>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {health && !health.agent_available && (
            <div className="banner banner-warn">
              <strong>{t("harden.agentDownBanner")}</strong>
            </div>
          )}
          {health && health.agent_available && !health.grounding_available && (
            <div className="banner banner-warn">
              <strong>{t("harden.noCorpusBanner")}</strong>
            </div>
          )}
        </div>

        {error && <div className="banner banner-danger">{error}</div>}

        {step === "builder" && (
          <div>
            <div className="card">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 4 }}>
                <button
                  className={"btn " + (!auditMode ? "btn-primary" : "")}
                  onClick={() => setAuditMode(false)}
                  disabled={busy}
                >
                  {t("harden.modeCreate")}
                </button>
                <button
                  className={"btn " + (auditMode ? "btn-primary" : "")}
                  onClick={() => setAuditMode(true)}
                  disabled={busy}
                >
                  {t("harden.modeAudit")}
                </button>
              </div>
            </div>

            {auditMode && (
              <div className="card" style={{ marginTop: 12 }}>
                <h3 style={{ margin: 0 }}>{t("harden.modeAudit")}</h3>
                <p className="muted">{t("harden.ingestIntro")}</p>
                <textarea
                  className="textarea" rows={12}
                  value={ingestText}
                  placeholder={t("harden.pastePlaceholder")}
                  onChange={(e) => setIngestText(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-warm" onClick={() => setIngestText(BAD_SUPPLY_CONTRACT)} disabled={busy}>
                    {t("harden.loadBadDemo")}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={ingest}
                    disabled={busy || !health?.agent_available || !ingestText.trim()}
                  >
                    {busy ? t("builder.busy") : t("harden.analyseContract")}
                  </button>
                </div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>{t("harden.badDemoHint")}</p>
              </div>
            )}

            {!auditMode && (
            <>
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>{t("parties.title")}</h3>
                <button className="btn btn-warm" onClick={useDemo} disabled={busy}>
                  {t("demo.fill")}
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}>
                {[0, 1].map((i) => (
                  <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                    <label style={{ fontWeight: 600, fontSize: 13 }}>{t(i === 0 ? "parties.a" : "parties.b")}</label>
                    <select
                      className="input"
                      style={{ width: "100%", marginTop: 8 }}
                      value={parties[i].type}
                      onChange={(e) => patchParty(i, "type", e.target.value)}
                    >
                      <option value="physique">{t("form.physique")}</option>
                      <option value="morale">{t("form.morale")}</option>
                    </select>
                    <input
                      className="input" style={{ width: "100%", marginTop: 8 }}
                      placeholder={t("form.givenName")}
                      value={parties[i].givenName}
                      onChange={(e) => patchParty(i, "givenName", e.target.value)}
                    />
                    <input
                      className="input" style={{ width: "100%", marginTop: 8 }}
                      placeholder={t("form.familyName")}
                      value={parties[i].familyName}
                      onChange={(e) => patchParty(i, "familyName", e.target.value)}
                    />
                    {parties[i].type === "physique" ? (
                      <input
                        className="input" style={{ width: "100%", marginTop: 8 }}
                        placeholder={t("form.cin")}
                        value={parties[i].cin}
                        onChange={(e) => patchParty(i, "cin", e.target.value)}
                      />
                    ) : (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <select
                          className="input" style={{ flex: 1 }}
                          value={parties[i].legalForm}
                          onChange={(e) => patchParty(i, "legalForm", e.target.value)}
                        >
                          {LEGAL_FORMS.map((f) => (
                            <option key={f.value} value={f.value}>{t(f.labelKey)}</option>
                          ))}
                        </select>
                        <input
                          className="input" style={{ flex: 1 }}
                          placeholder={t("form.matricule")}
                          value={parties[i].matricule}
                          onChange={(e) => patchParty(i, "matricule", e.target.value)}
                        />
                      </div>
                    )}
                    <input
                      className="input" style={{ width: "100%", marginTop: 8 }}
                      placeholder={t("form.address")}
                      value={parties[i].address}
                      onChange={(e) => patchParty(i, "address", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ margin: 0 }}>{t("essentials.title")}</h3>
              <p className="muted">{t("essentials.sub")}</p>
              <label style={{ fontWeight: 600, fontSize: 13 }}>{t("essentials.capacite")}</label>
              <textarea
                className="textarea" rows={2}
                value={essentials.capacite}
                placeholder={t("essencial.defaultCapacite")}
                onChange={(e) => patchEssentials("capacite", e.target.value)}
              />
              <label style={{ fontWeight: 600, fontSize: 13 }}>{t("essentials.consentement")}</label>
              <textarea
                className="textarea" rows={2}
                value={essentials.consentement}
                placeholder={t("essencial.defaultConsentement")}
                onChange={(e) => patchEssentials("consentement", e.target.value)}
              />
              <label style={{ fontWeight: 600, fontSize: 13 }}>{t("essentials.cause")}</label>
              <textarea
                className="textarea" rows={2}
                value={essentials.cause}
                placeholder={t("essencial.defaultCause")}
                onChange={(e) => patchEssentials("cause", e.target.value)}
              />
              <label style={{ fontWeight: 600, fontSize: 13 }}>{t("essentials.objet")}</label>
              <textarea
                className="textarea" rows={2}
                value={essentials.possible}
                placeholder={t("objet.defaultPossible")}
                onChange={(e) => patchEssentials("possible", e.target.value)}
              />
              <input
                className="input" style={{ width: "100%" }}
                placeholder={t("objet.specifique")}
                value={essentials.specifique}
                onChange={(e) => patchEssentials("specifique", e.target.value)}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  className="input" style={{ flex: 1 }}
                  placeholder={t("objet.quantite")}
                  value={essentials.quantite}
                  onChange={(e) => patchEssentials("quantite", e.target.value)}
                />
                <input
                  className="input" style={{ flex: 1 }}
                  placeholder={t("objet.valorisation")}
                  value={essentials.valorisation}
                  onChange={(e) => patchEssentials("valorisation", e.target.value)}
                />
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ margin: 0 }}>{t("clauses.title")}</h3>
              <p className="muted">{t("clauses.sub")}</p>
              <p className="muted" style={{ fontSize: 12.5 }}>{t("clauses.empty")}</p>
              {clauses.map((c) => (
                <div key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="input" style={{ flex: 2 }}
                      placeholder={t("clauses.titlePlaceholder")}
                      value={c.title}
                      onChange={(e) => patchClause(c.id, "title", e.target.value)}
                    />
                    <button className="btn" onClick={() => removeClause(c.id)}>{t("clauses.remove")}</button>
                  </div>
                  <textarea
                    className="textarea" style={{ marginTop: 8 }} rows={3}
                    placeholder={t("clauses.textPlaceholder")}
                    value={c.text}
                    onChange={(e) => patchClause(c.id, "text", e.target.value)}
                  />
                </div>
              ))}
              <button className="btn" onClick={addClause}>{t("clauses.add")}</button>
            </div>

            {unnamedParties > 0 && (
              <div className="banner banner-warn" style={{ marginTop: 12 }}>{t("builder.partyNamesWarn")}</div>
            )}

            <button
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              onClick={build}
              disabled={busy || !health?.agent_available}
            >
              {busy ? t("builder.busy") : t("builder.submit")}
            </button>
            </>
            )}
          </div>
        )}

        {step === "findings" && findings && (
          <div>
            {builtText && (
              <div className="card">
                <h3>{t(auditMode ? "harden.ingestedTitle" : "harden.builtTitle")}</h3>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, margin: 0 }}>{(builtText)}</pre>
              </div>
            )}
            <p className="muted" style={{ marginTop: 12 }}>
              {findings.clauses.length} · {findings.gaps.length} ·{" "}
              {findings.grounding.total_recommendations} ({findings.grounding.grounded_recommendations})
            </p>
            {findings.anchor?.doc_id && (
              <div className="row" style={{ marginTop: 8 }}>
                <span className="pill pill-ok">{t("findings.contractAnchored")}</span>
                <span className="hash-tag">{findings.anchor.doc_id}</span>
                <div className="row-main">
                  <div className="row-sub">{String(findings.anchor.tx_hash || "").slice(0, 18)}…</div>
                </div>
              </div>
            )}
            {findings.analysis_anchor?.attested && (
              <div className="row" style={{ marginTop: 8 }}>
                <span className="pill pill-ok">{t("findings.analysisAnchored")}</span>
                <span className="hash-tag">{String(findings.analysis_anchor.tx_hash || "").slice(0, 18)}</span>
                <div className="row-main">
                  <div className="row-sub">
                    {t("findings.analysisTx")}{" "}
                    {String(findings.analysis_anchor.findings_hash || "").slice(0, 12)}… ·{" "}
                    {t("findings.analysisSummary")
                      .replace("{total}", String(findings.analysis_anchor.total ?? "—"))
                      .replace("{grounded}", String(findings.analysis_anchor.grounded ?? "—"))
                      .replace("{gaps}", String(findings.analysis_anchor.gaps ?? "—"))}
                  </div>
                </div>
              </div>
            )}
            <div className="card">
              <h3>{t("findings.missingCount")}</h3>
              {findings.gaps.map((g, i) => (
                <div className="row" key={i}>
                  <span className={"pill " + (g.severity === "critical" ? "pill-danger" : "pill-warn")}>
                    {SEVERITY_KEYS[g.severity] ? t(SEVERITY_KEYS[g.severity]) : g.severity}
                  </span>
                  <div className="row-main">
                    <div className="row-title">{(g.label)}</div>
                    <div className="row-sub">{(g.why)}</div>
                  </div>
                </div>
              ))}
              {findings.gaps.length === 0 && <p className="muted">{t("findings.noneMissing")}</p>}
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <h3>{t("findings.recommendationsCount")}</h3>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{t("findings.anomalyNote")}</p>
              {findings.recommendations.map((r, i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: "1px solid var(--border)", fontSize: 13.5 }}>
                  <div style={{ fontWeight: 600 }}>
                    {(r.rationale)}{" "}
                    <span className={"pill " + (r.risk_kind === "unenforceable" ? "pill-danger" : r.risk_kind === "asymmetric" ? "pill-warm" : "pill-warn")}>{r.risk_kind}</span>
                  </div>
                  {r.original && <div className="muted" style={{ marginTop: 4 }}>{t("findings.currentClause")} : {(r.original.slice(0, 220))}</div>}
                  {r.proposed && (
                    <div style={{ marginTop: 4 }}>
                      <span className="pill pill-accent">{t("findings.suggestionNotApplied")}</span> {(r.proposed)}
                    </div>
                  )}
                  {r.grounded && r.legal_basis?.length ? (
                    <div className="banner banner-ok" style={{ marginTop: 6 }}>
                      {t("findings.basis")}{" "}
                      {r.legal_basis.map((b, bi) => (
                        <span key={bi} className="hash-tag" style={{ marginRight: 6 }}>
                          {(b.source_doc)} {(b.article_ref)}
                        </span>
                      ))}
                      {r.legal_basis[0].excerpt && <span className="muted"> — {(r.legal_basis[0].excerpt.slice(0, 160))}…</span>}
                    </div>
                  ) : (
                    <div className="banner banner-warn" style={{ marginTop: 6 }}>
                      {(r.no_legal_basis?.message || t("findings.noBasis"))}
                    </div>
                  )}
                </div>
              ))}
              {findings.recommendations.length === 0 && <p className="muted">{t("findings.noneRecommendations")}</p>}
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <h3>
                {t("findings.obligations")}
                <span className="pill pill-accent" style={{ marginLeft: 8 }}>{findings.obligations.length}</span>
              </h3>
              {findings.obligations.map((o, i) => (
                <div className="row" key={i}>
                  <span className="pill pill-accent">{(o.obligor)}</span>
                  <div className="row-main">
                    <div className="row-title">{(o.action)}</div>
                    <div className="row-sub">→ {(o.obligee)} · {(o.trigger)}</div>
                  </div>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 12 }}>{t("harden.obligationsNote")}</p>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={acknowledge} disabled={busy}>
                {t("findings.acknowledge")}
              </button>
            </div>
          </div>
        )}

        {step === "accept" && (
          <div>
            {(() => {
              const originalAnchor = history?.find((e) => e.detail?.doc_type === "original");
              return originalAnchor?.detail?.doc_id ? (
                <div className="banner banner-ok" style={{ marginTop: 0 }}>
                  <strong>{t("accept.storedOnChain")}</strong>{" "}
                  <span className="hash-tag">{String(originalAnchor.detail.doc_id)}</span>
                  <span className="hash-tag">{String(originalAnchor.tx_hash || "").slice(0, 18)}…</span>
                </div>
              ) : null;
            })()}
            <div className="card">
              <h3>{t("accept.versions")}</h3>
              <p className="muted">{t("accept.note")}</p>
              {versions === null ? (
                <p className="muted">{t("common.loading")}</p>
              ) : (
                versions.map((v) => (
                  <div className="row" key={v.version_id}>
                    <span className="hash-tag">{v.version_id}</span>
                    <span className={"pill " + (v.status === "in_force" ? "pill-ok" : v.status === "proposed" ? "pill-warn" : "pill-accent")}>{v.status}</span>
                    <div className="row-main">
                      <div className="row-title">{v.doc_type}</div>
                      <div className="row-sub">
                        {t("accept.parent")} {(v.parent_version_id || "—")} · {v.anchor_tx ? t("accept.anchored") : t("accept.notAnchored")} · {v.clause_count}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <h3>{t("detail.onchain")}</h3>
              {history === null ? (
                <p className="muted">{t("common.loading")}</p>
              ) : history.length === 0 ? (
                <p className="muted">{t("accept.nothingAnchored")}</p>
              ) : (
                history.map((e, i) => (
                  <div className="row" key={i}>
                    <span className="hash-tag">{(e.detail?.doc_id || "event")}</span>
                    <span className="pill">
                      {e.detail?.doc_type
                        ? e.detail.doc_type
                        : EVENT_LABELS[e.detail?.event_type]
                          ? t(EVENT_LABELS[e.detail.event_type])
                          : e.detail?.event_type}
                    </span>
                    <div className="row-sub">
                      {(String(e.tx_hash).slice(0, 18))}…{" "}
                      {e.detail?.payload_hash
                        ? "· " + t("findings.analysisTx") + " " + String(e.detail.payload_hash).slice(0, 12) + "…"
                        : "parent " + (e.detail?.parent_doc_id || "—")}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <Link className="btn" href={`/contracts/${encodeURIComponent(contractId)}`}>
                {t("accept.toDashboard")}
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}