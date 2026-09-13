"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, fmtDate } from "@/lib/api";
import { useI18n, type MsgKey } from "@/lib/i18n";
import TopBar from "@/components/TopBar";

interface Fact {
  fact: string;
  status: "agreed" | "disputed" | "unsupported";
  clause_ids: string[];
  source_evidence: string[];
}

interface Range { low: number; high: number; unit: string }

interface Option {
  option_id: string;
  label: string;
  summary: string;
  terms: string[];
  resolves: string[];
  addresses_root_cause: boolean;
}

interface Suggestion {
  suggestion_id: string;
  title: string;
  body: string;
  action: string;
}

interface Report {
  status: string;
  dispute_id?: string;
  contract_id?: string;
  opened_at?: string;
  viewer?: "owner" | "counterparty" | null;
  governing_version?: { version_id: string; doc_type: string; explanation: string };
  claims?: string[];
  fact_ledger?: {
    note: string;
    facts: Fact[];
    summary: { agreed: number; disputed: number; unsupported: number; total: number };
  };
  batna?: {
    path_label: string; source: string; scope: string; note: string;
    claim_amount: number | null;
    duration_days: Range | null; cost_percent: Range | null; cost_amount: Range | null;
    caveats: string[];
  };
  settlement_options?: Option[];
  suggestions?: Suggestion[];
  negotiation?: { rounds: { responses: Record<string, Record<string, string>> }[] };
  settled_option_id?: string | null;
  anchor?: { attest_tx?: string };
  liability?: { lawyer_review_required: boolean; note: string };
  error?: string;
}

const STATUS_KEY: Record<string, MsgKey> = {
  agreed: "dp.agreed",
  disputed: "dp.disputed",
  unsupported: "dp.unsupported"
};

const STATUS_PILL: Record<string, string> = {
  agreed: "pill-ok",
  disputed: "pill-warn",
  unsupported: "pill"
};

function nf(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

function DisputeInner() {
  const params = useSearchParams();
  const contractId = params.get("contract_id") || "";
  const token = params.get("token") || "";
  const { t } = useI18n();

  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!contractId) return;
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const { ok, body } = await api<Report>(`/api/disputes/${encodeURIComponent(contractId)}${qs}`);
    if (!ok) {
      setError(String(body.error || "impossible d'ouvrir ce litige"));
      return;
    }
    setReport(body);
  }, [contractId, token]);

  useEffect(() => { load(); }, [load]);

  async function respond(optionId: string, response: "accepted" | "declined") {
    if (busy) return;
    setBusy(true);
    const { ok, body } = await api<{ dispute?: Report; error?: string }>(
      `/api/disputes/${encodeURIComponent(contractId)}`,
      { method: "POST", body: JSON.stringify({ option_id: optionId, response, ...(token ? { token } : {}) }) }
    );
    if (!ok) setError(String(body.error || "réponse refusée"));
    else if (body.dispute) setReport({ ...body.dispute, viewer: report?.viewer ?? null });
    setBusy(false);
  }

  const threadHref = `/thread?contract_id=${encodeURIComponent(contractId)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;

  if (error) {
    return (
      <div className="app">
        <TopBar />
        <main className="main main-narrow">
          <div className="banner banner-danger"><strong>{t("dp.title")}</strong> {error}</div>
          <Link className="btn" href={threadHref}>{t("dp.backThread")}</Link>
        </main>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="app">
        <TopBar />
        <main className="main main-narrow"><p className="muted">{t("common.loading")}</p></main>
      </div>
    );
  }

  if (report.status === "none") {
    return (
      <div className="app">
        <TopBar />
        <main className="main main-narrow">
          <div className="card"><p className="muted">{t("dp.noneYet")}</p></div>
          <Link className="btn" href={threadHref}>{t("dp.backThread")}</Link>
        </main>
      </div>
    );
  }

  const ledger = report.fact_ledger;
  const batna = report.batna;
  const viewerParty = report.viewer === "counterparty" ? "p_supplier" : "p_buyer";
  const otherParty = viewerParty === "p_buyer" ? "p_supplier" : "p_buyer";
  const responses = report.negotiation?.rounds?.[0]?.responses || {};
  const settledOption = report.settlement_options?.find((o) => o.option_id === report.settled_option_id);

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <Link href={threadHref} className="muted" style={{ fontSize: 13 }}>
          <span className="rtl-flip">←</span> {t("dp.backThread")}
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>{t("dp.title")}</h1>
          <span className="hash-tag">{contractId}</span>
          {report.status === "settled"
            ? <span className="pill pill-ok">{t("dp.settled")}</span>
            : <span className="pill pill-warn">{report.dispute_id}</span>}
        </div>
        <p className="muted" style={{ maxWidth: 660 }}>{t("dp.subtitle")}</p>

        {report.status === "settled" && settledOption && (
          <div className="banner banner-ok">
            <strong>{t("dp.settled")}</strong>
            {t("dp.settledBody").replace("{label}", settledOption.label)}
          </div>
        )}

        {/* ---- governing version ---- */}
        {report.governing_version && (
          <div className="card" style={{ marginTop: 14 }}>
            <h3>{t("dp.governing")}</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="hash-tag">{report.governing_version.version_id}</span>
              <span className="pill pill-accent">{report.governing_version.doc_type}</span>
              {report.anchor?.attest_tx && (
                <span className="pill pill-ok">
                  {t("dp.anchoredAt")} · {report.anchor.attest_tx.slice(0, 12)}…
                </span>
              )}
            </div>
            <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
              {report.governing_version.explanation}
            </p>
          </div>
        )}

        {/* ---- claims ---- */}
        {report.claims && report.claims.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <h3>{t("dp.claims")}</h3>
            {report.claims.map((c, i) => (
              <div className="row" key={i}>
                <span className="pill pill-accent">{i + 1}</span>
                <div className="row-main"><div style={{ fontSize: 13.5 }}>{c}</div></div>
              </div>
            ))}
          </div>
        )}

        {/* ---- fact ledger ---- */}
        {ledger && (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{t("dp.ledger")}</h3>
              <span className="pill pill-ok">{ledger.summary.agreed} {t("dp.agreed")}</span>
              <span className="pill pill-warn">{ledger.summary.disputed} {t("dp.disputed")}</span>
              <span className="pill">{ledger.summary.unsupported} {t("dp.unsupported")}</span>
            </div>
            <div className="ledger">
              {ledger.facts.map((f, i) => (
                <div className="fact" key={i}>
                  <span className={"pill " + (STATUS_PILL[f.status] || "pill")}>
                    {t(STATUS_KEY[f.status])}
                  </span>
                  <div>
                    <div className="fact-text">{f.fact}</div>
                    <div className="fact-src">
                      {f.clause_ids.map((c) => <span className="chip-src" key={c}>{c}</span>)}
                      {f.source_evidence.join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 0, marginTop: 12 }}>{ledger.note}</p>
          </div>
        )}

        {/* ---- BATNA ---- */}
        {batna && (
          <div className="card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>{t("dp.batna")}</h3>
              <span className="pill pill-warn">{batna.path_label}</span>
            </div>
            <div className="batna">
              {batna.duration_days && (
                <div className="batna-cell">
                  <div className="batna-val">{nf(batna.duration_days.low)}–{nf(batna.duration_days.high)}</div>
                  <div className="batna-label">{t("dp.duration")} ({batna.duration_days.unit})</div>
                </div>
              )}
              {batna.cost_amount && (
                <div className="batna-cell">
                  <div className="batna-val">{nf(batna.cost_amount.low)}–{nf(batna.cost_amount.high)}</div>
                  <div className="batna-label">{t("dp.cost")} ({batna.cost_amount.unit})</div>
                </div>
              )}
              {batna.cost_percent && (
                <div className="batna-cell">
                  <div className="batna-val">{batna.cost_percent.low}–{batna.cost_percent.high} %</div>
                  <div className="batna-label">{t("dp.costPct")}</div>
                </div>
              )}
              {batna.claim_amount != null && (
                <div className="batna-cell">
                  <div className="batna-val">{nf(batna.claim_amount)}</div>
                  <div className="batna-label">{t("dp.claimAmount")} (TND)</div>
                </div>
              )}
            </div>
            <p style={{ fontSize: 13, marginBottom: 0 }}>{batna.note}</p>
            <div className="batna-source">
              <strong>{t("dp.source")} :</strong> {batna.source}<br />
              {batna.scope}
              <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
                {batna.caveats.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* ---- agent suggestions ---- */}
        {report.suggestions && report.suggestions.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            <h3>{t("dp.suggestions")}</h3>
            <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>{t("dp.suggestionsNote")}</p>
            {report.suggestions.map((s) => (
              <div className="suggestion" key={s.suggestion_id}>
                <h4>{s.title}</h4>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        )}

        {/* ---- settlement options ---- */}
        {report.settlement_options && (
          <div className="card" style={{ marginTop: 12 }}>
            <h3>{t("dp.options")}</h3>
            <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>{t("dp.optionsNote")}</p>

            {report.settlement_options.map((o) => {
              const r = responses[o.option_id] || {};
              const mine = r[viewerParty];
              const theirs = r[otherParty];
              const both = mine === "accepted" && theirs === "accepted";
              return (
                <div className={"option " + (both ? "option-accepted" : "")} key={o.option_id}>
                  <div className="option-head">
                    <h4>{o.label}</h4>
                    {o.addresses_root_cause && (
                      <span className="pill pill-accent">{t("dp.fixesRoot")}</span>
                    )}
                    {both && <span className="pill pill-ok">{t("dp.bothAccepted")}</span>}
                  </div>
                  <p style={{ fontSize: 13.5, margin: "8px 0 0" }}>{o.summary}</p>
                  <ul className="option-terms">
                    {o.terms.map((term, i) => <li key={i}>{term}</li>)}
                  </ul>
                  <div className="option-actions">
                    {!both && report.status !== "settled" && (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={busy || mine === "accepted"}
                          onClick={() => respond(o.option_id, "accepted")}
                        >
                          {t("dp.accept")}
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={busy || mine === "declined"}
                          onClick={() => respond(o.option_id, "declined")}
                        >
                          {t("dp.decline")}
                        </button>
                      </>
                    )}
                    {mine === "accepted" && !both && (
                      <span className="pill pill-ok">{t("dp.youAccepted")} · {t("dp.waiting")}</span>
                    )}
                    {mine === "declined" && <span className="pill">{t("dp.youDeclined")}</span>}
                    {theirs === "accepted" && !both && (
                      <span className="pill pill-accent">{t("dp.otherAccepted")}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {report.liability?.lawyer_review_required && (
              <div className="banner banner-warn" style={{ marginBottom: 0 }}>
                <strong>{t("dp.lawyer")}</strong>
                {report.liability.note}
              </div>
            )}
          </div>
        )}

        {report.opened_at && (
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            {t("dp.anchoredAt")} · {fmtDate(report.opened_at)}
          </p>
        )}
      </main>
    </div>
  );
}

export default function DisputePage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<div className="main"><p className="muted">{t("common.loading")}</p></div>}>
      <DisputeInner />
    </Suspense>
  );
}
