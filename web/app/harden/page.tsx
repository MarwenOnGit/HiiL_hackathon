"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, esc } from "@/lib/api";
import TopBar from "@/components/TopBar";

const DEMO_CONTRACT = `CONTRAT DE FOURNITURE DE PANNEAUX DE BOIS

Article 1 - Parties
Entre les soussignes: Atelier Trabelsi, menuiserie sise a Tunis, designe ci-apres
"l'Acheteur", et Societe Bois du Nord, designe ci-apres "le Fournisseur".

Article 2 - Objet du contrat
Le Fournisseur s'engage a fournir a l'Acheteur des panneaux de contreplaque de
18mm, en quantite approximative de 40 unites par mois.

Article 3 - Prix
Le prix est fixe a 45 TND par panneau, soit un montant de 1800 TND par commande
mensuelle. Le prix pourra etre revise selon le prix du marche.

Article 4 - Livraison
Le Fournisseur livre les marchandises dans un delai raisonnable a compter de la
reception de la commande. En cas d'empechement, il previendra l'Acheteur dans
les meilleurs delais.

Article 5 - Paiement
L'Acheteur procede au paiement a 30 jours a compter de la livraison, par
virement bancaire.

Article 6 - Qualite
Les marchandises seront conformes a la qualite convenue entre les parties.

Article 7 - Resiliation
Le Fournisseur pourra resilier a tout moment et sans preavis en cas de
difficulte d'approvisionnement. Le Fournisseur ne pourra en aucun cas etre tenu
responsable des consequences d'une rupture de stock.`;

interface Health {
  agent_available: boolean;
  corpus_size?: number;
  grounding_available?: boolean;
  detail?: string;
}

interface Redline {
  rationale: string;
  risk_kind: string;
  original: string;
  proposed: string;
  grounded: boolean;
  legal_basis?: { source_doc: string; article_ref: string; excerpt?: string }[];
  no_legal_basis?: { message: string };
}

interface Findings {
  contract_id: string;
  clauses: { clause_id: string; type: string }[];
  gaps: { label: string; why: string; severity: string }[];
  redlines: Redline[];
  obligations: { obligor: string; obligee: string; action: string; trigger: string }[];
  grounding: { total_redlines: number; grounded_redlines: number };
}

interface DisputeReport {
  governing_version: { explanation: string };
  fact_ledger: { summary: { agreed: number; disputed: number; unsupported: number }; facts: { fact: string; status: string; clause_ids: string[] }[]; note: string };
  batna: { path_label: string; duration_days: { low: number; high: number } | null; cost_amount: { low: number; high: number } | null; source: string; scope: string; note: string; caveats: string[] };
  settlement_options: { label: string; detail: string; monetary?: boolean }[];
  negotiation: { human_gate_note: string; lawyer_review_required: boolean };
}

type Step = "ingest" | "findings" | "accept" | "dispute";
const ORDER: Step[] = ["ingest", "findings", "accept", "dispute"];

export default function HardenPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [step, setStep] = useState<Step>("ingest");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [contractId, setContractId] = useState("");
  const [findings, setFindings] = useState<Findings | null>(null);
  const [versions, setVersions] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [statementA, setStatementA] = useState("La livraison de juin contenait 12 panneaux fissures\nLe paiement de juin n a pas ete effectue");
  const [statementB, setStatementB] = useState("La livraison de juin ne contenait pas de panneaux fissures\nLe paiement de juin n a pas ete effectue");
  const [claimAmount, setClaimAmount] = useState("1800");
  const [contested, setContested] = useState(true);
  const [dispute, setDispute] = useState<DisputeReport | null>(null);

  async function syncHealth() {
    const { body } = await api<Health>("/api/agent/health");
    setHealth(body);
  }
  if (!health) syncHealth().catch(() => {});

  function show(next: Step) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function analyse(body: FormData) {
    setBusy(true);
    setError("");
    try {
      const { ok, status, body: report } = await api<Findings | { error?: string }>("/api/agent/harden", {
        method: "POST",
        body
      });
      if (!ok) throw new Error(String((report as { error?: string }).error || `analysis failed (${status})`));
      const f = report as Findings;
      setContractId(f.contract_id);
      setFindings(f);
      show("findings");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function useDemo() {
    const form = new FormData();
    form.append("text", DEMO_CONTRACT);
    form.append("contract_id", `contract_${Date.now()}`);
    analyse(form);
  }

  function useFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("contract_id", `contract_${Date.now()}`);
    analyse(form);
  }

  async function acceptRedlines() {
    setBusy(true);
    setError("");
    try {
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

  async function sign() {
    setBusy(true);
    setError("");
    try {
      const { ok, body } = await api<{ error?: string }>(`/api/agent/contracts/${encodeURIComponent(contractId)}/sign`, {
        method: "POST",
        body: JSON.stringify({ lawyer_validated: false })
      });
      if (!ok) throw new Error(String(body.error || "sign failed"));
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function openDispute() {
    setBusy(true);
    setError("");
    const statements = [
      ...statementA.split("\n").filter(Boolean).map((text) => ({ party_id: "p_buyer", text, evidence_refs: [] })),
      ...statementB.split("\n").filter(Boolean).map((text) => ({ party_id: "p_supplier", text, evidence_refs: [] }))
    ];
    try {
      const { ok, body } = await api<DisputeReport | { error?: string }>("/api/agent/disputes", {
        method: "POST",
        body: JSON.stringify({
          contract_id: contractId,
          dispute_id: `dispute_${Date.now()}`,
          event_date: new Date().toISOString(),
          claims: [],
          statements,
          contested,
          claim_amount: parseFloat(claimAmount) || null
        })
      });
      if (!ok) throw new Error(String((body as { error?: string }).error || "dispute analysis failed"));
      setDispute(body as DisputeReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const steps = ["Contrat", "Analyse", "Renforcement", "Différend"];

  return (
    <div className="app">
      <TopBar />
      <main className="main main-narrow">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Analyser un contrat existant</h1>
          {health && (
            <span className={"pill " + (health.agent_available ? "pill-ok" : "pill-warn")}>
              agent: {health.agent_available ? `ok · corpus ${health.corpus_size ?? 0}` : "hors ligne"}
            </span>
          )}
        </div>
        <p className="muted">
          Un contrat, une identité, des versions. L'outil cherche ce qui manque, ce qui est
          ambigu et ce qui est déséquilibré — puis propose des corrections. Rien n'est signé
          sans action humaine.
        </p>

        <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 12 }}>
          {steps.map((label, i) => (
            <span key={label} className={"pill " + (ORDER.indexOf(step) >= i ? "pill-accent" : "")}>
              {i + 1} · {label}
            </span>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {health && !health.agent_available && (
            <div className="banner banner-warn">
              <strong>Service d'analyse indisponible.</strong>
              {esc(health.detail || "")} Les autres fonctionnalités restent utilisables.
            </div>
          )}
          {health && health.agent_available && !health.grounding_available && (
            <div className="banner banner-warn">
              <strong>Corpus juridique non chargé.</strong> Les constats ci-dessous sont des
              constats de <em>rédaction</em>, pas des affirmations juridiques : aucun texte de
              loi n'est cité, parce qu'aucun n'a été fourni. Rien n'est inventé pour combler
              ce vide.
            </div>
          )}
        </div>

        {error && <div className="banner banner-danger">{error}</div>}

        {step === "ingest" && (
          <div className="card">
            <p className="muted">Déposez un contrat déjà signé, ou utilisez le contrat de démonstration.</p>
            <input ref={fileRef} type="file" accept=".txt,.md,.pdf" className="input" style={{ marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={useFile} disabled={busy || !health?.agent_available}>
                Analyser le fichier
              </button>
              <button className="btn btn-warm" onClick={useDemo} disabled={busy || !health?.agent_available}>
                Contrat de démonstration
              </button>
            </div>
          </div>
        )}

        {step === "findings" && findings && (
          <div>
            <p className="muted">
              {findings.clauses.length} clauses analysées · {findings.gaps.length} clauses manquantes ·{" "}
              {findings.grounding.total_redlines} corrections proposées, dont{" "}
              {findings.grounding.grounded_redlines} appuyées sur un texte.
            </p>
            <div className="card">
              <h3>Clauses manquantes</h3>
              {findings.gaps.map((g, i) => (
                <div className="row" key={i}>
                  <span className={"pill " + (g.severity === "critical" ? "pill-danger" : "pill-warn")}>{g.severity}</span>
                  <div className="row-main">
                    <div className="row-title">{esc(g.label)}</div>
                    <div className="row-sub">{esc(g.why)}</div>
                  </div>
                </div>
              ))}
              {findings.gaps.length === 0 && <p className="muted">Aucune clause obligatoire manquante.</p>}
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Corrections proposées</h3>
              {findings.redlines.map((r, i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: "1px solid var(--border)", fontSize: 13.5 }}>
                  <div style={{ fontWeight: 600 }}>
                    {esc(r.rationale)}{" "}
                    <span className={"pill " + (r.risk_kind === "unenforceable" ? "pill-danger" : r.risk_kind === "asymmetric" ? "pill-warm" : "pill-warn")}>{r.risk_kind}</span>
                  </div>
                  {r.original && <div className="muted" style={{ marginTop: 4 }}>→ {esc(r.original.slice(0, 220))}</div>}
                  {r.proposed && <div style={{ marginTop: 4 }}>✓ {esc(r.proposed)}</div>}
                  {r.grounded && r.legal_basis?.length ? (
                    <div className="banner banner-ok" style={{ marginTop: 6 }}>
                      Base légale : {r.legal_basis.map((b, bi) => (
                        <span key={bi} className="hash-tag" style={{ marginRight: 6 }}>
                          {esc(b.source_doc)} {esc(b.article_ref)}
                        </span>
                      ))}
                      {r.legal_basis[0].excerpt && <span className="muted"> — {esc(r.legal_basis[0].excerpt.slice(0, 160))}…</span>}
                    </div>
                  ) : (
                    <div className="banner banner-warn" style={{ marginTop: 6 }}>
                      {esc(r.no_legal_basis?.message || "Aucune base légale retrouvée dans le corpus fourni.")}
                    </div>
                  )}
                </div>
              ))}
              {findings.redlines.length === 0 && <p className="muted">Aucune correction à proposer.</p>}
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Obligations extraites</h3>
              {findings.obligations.map((o, i) => (
                <div className="row" key={i}>
                  <span className="pill pill-accent">{esc(o.obligor)}</span>
                  <div className="row-main">
                    <div className="row-title">{esc(o.action)}</div>
                    <div className="row-sub">→ {esc(o.obligee)} · {esc(o.trigger)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={acceptRedlines} disabled={busy}>
                J'accepte ces corrections
              </button>
              <button className="btn" onClick={() => show("dispute")}>Passer au différend</button>
            </div>
          </div>
        )}

        {step === "accept" && (
          <div>
            <div className="card">
              <h3>Versions du contrat</h3>
              <p className="muted">Rien n'est jamais supprimé : une version remplacée continue de régir les faits survenus pendant sa période.</p>
              {versions === null ? (
                <p className="muted">Loading…</p>
              ) : (
                versions.map((v) => (
                  <div className="row" key={v.version_id}>
                    <span className="hash-tag">{v.version_id}</span>
                    <span className={"pill " + (v.status === "in_force" ? "pill-ok" : v.status === "proposed" ? "pill-warn" : "pill-accent")}>{v.status}</span>
                    <div className="row-main">
                      <div className="row-title">{v.doc_type}</div>
                      <div className="row-sub">
                        parent {esc(v.parent_version_id || "—")} · {v.anchor_tx ? "ancrée" : "non ancrée"} · {v.clause_count} clauses
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Empreinte on-chain</h3>
              {history === null ? (
                <p className="muted">Loading…</p>
              ) : history.length === 0 ? (
                <p className="muted">Rien d'ancré pour l'instant.</p>
              ) : (
                history.map((e, i) => (
                  <div className="row" key={i}>
                    <span className="hash-tag">{esc(e.detail?.doc_id || "event")}</span>
                    <span className="pill">{esc(e.detail?.doc_type || e.detail?.event_type)}</span>
                    <div className="row-sub">
                      {esc(String(e.tx_hash).slice(0, 18))}… parent {esc(e.detail?.parent_doc_id || "—")}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={sign} disabled={busy}>
                {busy ? "Anchoring…" : "Signer (les deux parties)"}
              </button>
              <button className="btn" onClick={() => show("dispute")}>Passer au différend</button>
              <Link className="btn" href={`/contracts/${encodeURIComponent(contractId)}`}>
                Voir dans le tableau de bord →
              </Link>
            </div>
          </div>
        )}

        {step === "dispute" && (
          <div>
            <div className="card">
              <p className="muted" style={{ marginTop: 0 }}>
                Chaque partie donne sa version. L'outil trie les faits en <em>convenus</em>,{" "}
                <em>contestés</em> et <em>non étayés</em> — le même tableau pour les deux parties.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>Version de l'acheteur</label>
                  <textarea className="textarea" rows={5} value={statementA} onChange={(e) => setStatementA(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontWeight: 600, fontSize: 13 }}>Version du fournisseur</label>
                  <textarea className="textarea" rows={5} value={statementB} onChange={(e) => setStatementB(e.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                <label className="muted">Montant en cause (TND)</label>
                <input className="input" style={{ width: 110 }} value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} />
                <label className="muted">La dette est-elle contestée ?</label>
                <select className="input" style={{ width: "auto" }} value={String(contested)} onChange={(e) => setContested(e.target.value === "true")}>
                  <option value="true">Oui</option>
                  <option value="false">Non</option>
                </select>
              </div>
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={openDispute} disabled={busy}>
                {busy ? "Analyser…" : "Analyser le différend"}
              </button>
            </div>

            {dispute && (
              <>
                <div className="card" style={{ marginTop: 12 }}>
                  <h3>Version applicable</h3>
                  <p className="muted">{esc(dispute.governing_version.explanation)}</p>
                </div>
                <div className="card" style={{ marginTop: 12 }}>
                  <h3>
                    Tableau des faits
                    <span className="pill pill-ok" style={{ marginLeft: 8 }}>{dispute.fact_ledger.summary.agreed} convenus</span>
                    <span className="pill pill-warn" style={{ marginLeft: 6 }}>{dispute.fact_ledger.summary.disputed} contestés</span>
                    <span className="pill pill-accent" style={{ marginLeft: 6 }}>{dispute.fact_ledger.summary.unsupported} non étayés</span>
                  </h3>
                  {dispute.fact_ledger.facts.map((f, i) => (
                    <div className="row" key={i}>
                      <span className={"pill " + (f.status === "agreed" ? "pill-ok" : f.status === "disputed" ? "pill-warn" : "pill-accent")}>{f.status}</span>
                      <div className="row-main">
                        <div className="row-title">{esc(f.fact)}</div>
                        <div className="row-sub">
                          {f.clause_ids.length ? "clauses " + f.clause_ids.map(esc).join(", ") : "aucune clause rattachée"}
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="muted" style={{ fontSize: 12 }}>{esc(dispute.fact_ledger.note)}</p>
                </div>
                <div className="card" style={{ marginTop: 12 }}>
                  <h3>Si vous allez au tribunal ({esc(dispute.batna.path_label)})</h3>
                  <p className="muted">
                    {dispute.batna.duration_days
                      ? `Durée : ${dispute.batna.duration_days.low}–${dispute.batna.duration_days.high} jours · `
                      : ""}
                    {dispute.batna.cost_amount
                      ? `Frais : ${dispute.batna.cost_amount.low}–${dispute.batna.cost_amount.high} TND`
                      : ""}
                  </p>
                  <p className="muted" style={{ fontSize: 12 }}>
                    <strong>Source :</strong> {esc(dispute.batna.source)}<br />
                    {esc(dispute.batna.scope)}
                    {(dispute.batna.caveats || []).map((c, i) => (
                      <span key={i}><br />{esc(c)}</span>
                    ))}
                  </p>
                </div>
                <div className="card" style={{ marginTop: 12 }}>
                  <h3>Options de règlement</h3>
                  {dispute.settlement_options.map((o, i) => (
                    <div className="row" key={i}>
                      <span className="pill pill-warm">{esc(o.label)}</span>
                      <div className="row-main">
                        <div className="row-title">{o.monetary ? "monétaire" : "non-monétaire"}</div>
                        <div className="row-sub">{esc(o.detail)}</div>
                      </div>
                    </div>
                  ))}
                  <div className="banner banner-info">
                    {esc(dispute.negotiation.human_gate_note)}
                    {dispute.negotiation.lawyer_review_required && <><br /><strong>Revue par un avocat requise avant signature.</strong></>}
                  </div>
                </div>
              </>
            )}

            <div style={{ marginTop: 14 }}>
              <Link className="btn" href={`/contracts/${encodeURIComponent(contractId)}`}>
                Voir dans le tableau de bord →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}