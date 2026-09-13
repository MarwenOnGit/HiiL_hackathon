"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, esc, fmtDate, fmtTime, getMe } from "@/lib/api";
import { useI18n, type MsgKey } from "@/lib/i18n";
import TopBar from "@/components/TopBar";
import InvitePanel from "@/components/InvitePanel";

interface Row {
  contract_id: string;
  source: "wizard" | "hardened";
  msme_owner: string | null;
  counterparty: string | null;
  signed: boolean;
  version_count: number;
  consent_tier: string | null;
  onchain: { agreement_onchain_id?: string; tx_hash?: string; hash?: string; consent_tier?: string; executed?: boolean; signed_a?: boolean; signed_b?: boolean } | null;
}

interface Ob { obligation_id: string; clause_id: string; obligor: string; obligee: string; action: string; trigger: string; due_date: string | null; evidence_required?: string; state: string }

const STATE_KEYS: Record<string, MsgKey> = {
  pending: "state.pending",
  overdue_unconfirmed: "state.overdue_unconfirmed",
  performed: "state.performed",
  breached: "state.breached",
  waived: "state.waived",
  cured: "state.cured"
};

const EVENT_LABELS: Record<string, MsgKey> = {
  analysis_completed: "events.analysis"
};

const DOCTYPE_KEYS: Record<string, MsgKey> = {
  original: "doctype.original",
  hardened: "doctype.hardened",
  signed: "doctype.signed",
  amendment: "doctype.amendment"
};

const STATUS_KEYS: Record<string, MsgKey> = {
  in_force: "status.in_force",
  proposed: "status.proposed",
  superseded: "status.superseded"
};

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const contractId = params.id;
  const { t } = useI18n();

  const [row, setRow] = useState<Row | null>(null);
  const [notFound, setNotFound] = useState("");
  const [wizard, setWizard] = useState<{ contract: any; onchain: any } | null>(null);
  const [versions, setVersions] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [obligations, setObligations] = useState<Ob[] | null>(null);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("invited")) {
      setInvited(true);
    }
    (async () => {
      const me = await getMe();
      if (!me.authenticated || me.kind !== "msme") {
        window.location.href = "/";
        return;
      }
      const mine = await api<{ rows: Row[] }>("/api/dashboard/mine");
      if (!mine.ok) return;
      const found = mine.body.rows.find((r) => r.contract_id === contractId);
      if (!found) {
        setNotFound(t("detail.notYours"));
        return;
      }
      setRow(found);

      if (found.source === "wizard") {
        const d = await api<{ contract: any; onchain: any }>("/api/contracts/" + encodeURIComponent(contractId));
        if (d.ok) setWizard(d.body);
      } else {
        const v = await api<any>("/api/agent/contracts/" + encodeURIComponent(contractId));
        const h = await api<any>("/api/agent/contracts/" + encodeURIComponent(contractId) + "/history");
        if (v.ok) {
          setVersions(v.body.versions || []);
          setObligations(v.body.obligations || []);
        }
        if (h.ok) setHistory(h.body.entries || []);
      }
    })();
  }, [contractId, t]);

  if (notFound) {
    return (
      <div className="app">
        <TopBar />
        <main className="main main-narrow">
          <div className="banner banner-warn">
            <strong>{t("detail.notYours")}</strong> {esc(notFound)}
          </div>
          <Link className="btn" href="/dashboard">{t("detail.dashboard")}</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
          <span className="rtl-flip">←</span> {t("detail.dashboard")}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>
            {row ? `${esc(row.msme_owner || t("dashboard.msme"))} → ${esc(row.counterparty || t("dashboard.counterparty"))}` : contractId}
          </h1>
          {row && (
            <>
              <span className="hash-tag">{row.contract_id}</span>
              <span className="pill pill-accent">{row.source === "wizard" ? t("common.wizard") : t("common.hardened")}</span>
              {row.source === "hardened" ? (
                <span className="pill pill-ok">{t("common.anchored")}</span>
              ) : row.signed ? (
                <span className="pill pill-ok">{t("common.signed")}</span>
              ) : (
                <span className="pill pill-warn">{t("common.draft")}</span>
              )}
              {row.consent_tier && <span className="pill">{t("dashboard.tier")} {esc(row.consent_tier)}</span>}
            </>
          )}
        </div>

        {!row && !notFound && <p className="muted">{t("common.loading")}</p>}

        {invited && (
          <div className="banner banner-ok">{t("detail.invitationCreated")}</div>
        )}

        {row && longRow(row, wizard, versions, history, obligations, contractId, t)}
      </main>
    </div>
  );
}

function longRow(
  row: Row,
  wizard: any,
  versions: any[] | null,
  history: any[] | null,
  obligations: Ob[] | null,
  contractId: string,
  t: (key: MsgKey, vars?: Record<string, string | number>) => string
) {
  const docTypeLabel = (docType: string) => {
    const key = DOCTYPE_KEYS[docType];
    return key ? t(key) : docType;
  };
  const statusLabel = (status: string) => {
    const key = STATUS_KEYS[status];
    return key ? t(key) : status;
  };
  const stateLabel = (state: string) => {
    const key = STATE_KEYS[state];
    return key ? t(key) : state;
  };

  return (
    <>
      <div className="grid-stats" style={{ marginTop: 14 }}>
        <div className="stat"><div className="stat-num">{row.version_count}</div><div className="stat-label">{t("detail.statVersions")}</div></div>
        <div className="stat"><div className="stat-num">{row.signed ? "✓" : "—"}</div><div className="stat-label">{t("detail.statExecuted")}</div></div>
        <div className="stat"><div className="stat-num">{obligations ? obligations.length : "—"}</div><div className="stat-label">{t("detail.statObligations")}</div></div>
      </div>

      {wizard && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <h3>{t("detail.contractWizard")}</h3>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "var(--surface-alt)", padding: 14, borderRadius: 12, direction: "ltr" }}>{wizard.contract.contract_text}</pre>
            <p className="muted" style={{ fontSize: 12 }}>
              {t("detail.hash")} <span className="hash-tag">{esc(wizard.contract.contract_text_hash)}</span>
            </p>
          </div>
          {wizard.onchain && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>{t("detail.onchain")}</h3>
              <div className="row"><span className="pill">{t("detail.agreement")}</span><div className="row-main"><span className="hash-tag">{esc(wizard.onchain.agreement_onchain_id)}</span></div></div>
              <div className="row"><span className="pill">tx</span><div className="row-main"><span className="hash-tag">{esc(wizard.onchain.tx_hash)}</span></div></div>
              <div className="row">
                <span className="pill pill-ok">{t("detail.partyA")} {wizard.onchain.signed_a ? t("common.signed") : t("detail.pending")}</span>
                <span className="pill pill-ok">{t("detail.partyB")} {wizard.onchain.signed_b ? t("common.signed") : t("detail.pending")}</span>
                <span className={wizard.onchain.executed ? "pill pill-ok" : "pill pill-warn"}>{wizard.onchain.executed ? t("detail.executed") : t("detail.notExecuted")}</span>
              </div>
            </div>
          )}
        </>
      )}

      {versions && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>{t("detail.versionHistory")}</h3>
          {versions.map((v) => (
            <div className="row" key={v.version_id}>
              <span className="hash-tag">{v.version_id}</span>
              <span className={"pill " + (v.status === "in_force" ? "pill-ok" : v.status === "proposed" ? "pill-warn" : "pill-accent")}>{statusLabel(v.status)}</span>
              <div className="row-main">
                <div className="row-title">{docTypeLabel(v.doc_type)}</div>
                <div className="row-sub">
                  {t("detail.parent")} {esc(v.parent_version_id || "—")} · {t("detail.from")} {v.effective_from ? fmtDate(v.effective_from) : t("detail.proposal")}
                  {v.effective_to ? <> · {t("detail.to")} {fmtDate(v.effective_to)}</> : ""}
                </div>
              </div>
              {v.anchor_tx ? <span className="pill pill-ok">{t("common.anchored")}</span> : <span className="pill pill-warn">{t("common.draft")}</span>}
            </div>
          ))}
        </div>
      )}

      {obligations && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{t("detail.obligations", { count: obligations.length })}</h3>
          {obligations.length === 0 && <p className="muted">{t("detail.noObligations")}</p>}
          {obligations.map((o) => (
            <div className="row" key={o.obligation_id}>
              <span className="pill pill-accent">{esc(o.obligor)}</span>
              <div className="row-main">
                <div className="row-title">{esc(o.action)}</div>
                <div className="row-sub">
                  → {esc(o.obligee)} · {esc(o.trigger)}
                  {o.due_date ? <> · {t("dashboard.until")} {fmtDate(o.due_date)}</> : ""}
                </div>
              </div>
              <span className={"pill " + (o.state === "pending" ? "pill-warn" : o.state === "performed" ? "pill-ok" : "pill-accent")}>{stateLabel(o.state)}</span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>
            {t("detail.obligationsNote")}
          </p>
        </div>
      )}

      {history && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{t("detail.chainLog")}</h3>
          {history.length === 0 ? (
            <p className="muted">{t("detail.nothingAnchored")}</p>
          ) : (
            history.map((e, i) => (
              <div className="row" key={i}>
                <span className="pill">{docTypeLabel(e.detail?.doc_type) || (EVENT_LABELS[e.detail?.event_type] ? t(EVENT_LABELS[e.detail.event_type]) : e.detail?.event_type)}</span>
                <div className="row-main">
                  <div className="row-title mono" style={{ fontSize: 12.5 }}>{esc(String(e.tx_hash).slice(0, 22))}…</div>
                  <div className="row-sub">
                    {t("detail.doc")} {esc(e.detail?.doc_id || "—")} · {t("detail.parent")} {esc(e.detail?.parent_doc_id || "—")}
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{fmtTime(e.detail?.timestamp || null)}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3>{t("detail.inviteTitle")}</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13, marginBottom: 12 }}>
          {t("detail.inviteBody")}
        </p>
        <InvitePanel contractId={contractId} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {row.signed || row.source === "hardened" ? (
          <Link className="btn btn-primary" href={`/thread?contract_id=${encodeURIComponent(contractId)}`}>
            {t("detail.openThread")} <span className="rtl-flip">→</span>
          </Link>
        ) : (
          <span className="pill pill-warn">{t("detail.noThreadYet")}</span>
        )}
        {row.source === "hardened" && (
          <Link className="btn" href={`/harden`}>{t("detail.analyseAnother")}</Link>
        )}
      </div>
    </>
  );
}