"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, esc, fmtDate, fmtTime, getMe } from "@/lib/api";
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

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const contractId = params.id;

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
        setNotFound("You're not the owner of this contract, or it no longer exists.");
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
  }, [contractId]);

  if (notFound) {
    return (
      <div className="app">
        <TopBar />
        <main className="main main-narrow">
          <div className="banner banner-warn">
            <strong>Not your contract.</strong> {esc(notFound)}
          </div>
          <Link className="btn" href="/dashboard">← Dashboard</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>← Dashboard</Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>
            {row ? `${esc(row.msme_owner || "MSME")} → ${esc(row.counterparty || "Counterparty")}` : contractId}
          </h1>
          {row && (
            <>
              <span className="hash-tag">{row.contract_id}</span>
              <span className="pill pill-accent">{row.source}</span>
              {row.signed ? <span className="pill pill-ok">signed</span> : <span className="pill pill-warn">draft</span>}
              {row.consent_tier && <span className="pill">tier {esc(row.consent_tier)}</span>}
            </>
          )}
        </div>

        {!row && !notFound && <p className="muted">Loading…</p>}

        {invited && (
          <div className="banner banner-ok">An invitation was created — share the link and code with the other party.</div>
        )}

        {row && longRow(row, wizard, versions, history, obligations, contractId)}
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
  contractId: string
) {
  return (
    <>
      <div className="grid-stats" style={{ marginTop: 14 }}>
        <div className="stat"><div className="stat-num">{row.version_count}</div><div className="stat-label">Versions</div></div>
        <div className="stat"><div className="stat-num">{row.signed ? "✓" : "—"}</div><div className="stat-label">Executed on-chain</div></div>
        <div className="stat"><div className="stat-num">{obligations ? obligations.length : "—"}</div><div className="stat-label">Obligations</div></div>
      </div>

      {wizard && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <h3>Contract (wizard v1)</h3>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "var(--surface-alt)", padding: 14, borderRadius: 12 }}>{wizard.contract.contract_text}</pre>
            <p className="muted" style={{ fontSize: 12 }}>
              Hash <span className="hash-tag">{esc(wizard.contract.contract_text_hash)}</span>
            </p>
          </div>
          {wizard.onchain && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>On-chain record</h3>
              <div className="row"><span className="pill">agreement</span><div className="row-main"><span className="hash-tag">{esc(wizard.onchain.agreement_onchain_id)}</span></div></div>
              <div className="row"><span className="pill">tx</span><div className="row-main"><span className="hash-tag">{esc(wizard.onchain.tx_hash)}</span></div></div>
              <div className="row">
                <span className="pill pill-ok">party A {wizard.onchain.signed_a ? "signed" : "pending"}</span>
                <span className="pill pill-ok">party B {wizard.onchain.signed_b ? "signed" : "pending"}</span>
                <span className={wizard.onchain.executed ? "pill pill-ok" : "pill pill-warn"}>{wizard.onchain.executed ? "executed" : "not executed"}</span>
              </div>
            </div>
          )}
        </>
      )}

      {versions && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3>Version history (append-only)</h3>
          {versions.map((v) => (
            <div className="row" key={v.version_id}>
              <span className="hash-tag">{v.version_id}</span>
              <span className={"pill " + (v.status === "in_force" ? "pill-ok" : v.status === "proposed" ? "pill-warn" : "pill-accent")}>{v.status}</span>
              <div className="row-main">
                <div className="row-title">{v.doc_type}</div>
                <div className="row-sub">
                  parent {esc(v.parent_version_id || "—")} · from {v.effective_from ? fmtDate(v.effective_from) : "proposal"}
                  {v.effective_to ? ` · to ${fmtDate(v.effective_to)}` : ""}
                </div>
              </div>
              {v.anchor_tx ? <span className="pill pill-ok">anchored</span> : <span className="pill pill-warn">draft</span>}
            </div>
          ))}
        </div>
      )}

      {obligations && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Obligations ({obligations.length})</h3>
          {obligations.length === 0 && <p className="muted">No obligations extracted.</p>}
          {obligations.map((o) => (
            <div className="row" key={o.obligation_id}>
              <span className="pill pill-accent">{esc(o.obligor)}</span>
              <div className="row-main">
                <div className="row-title">{esc(o.action)}</div>
                <div className="row-sub">
                  → {esc(o.obligee)} · {esc(o.trigger)}
                  {o.due_date ? ` · due ${fmtDate(o.due_date)}` : ""}
                </div>
              </div>
              <span className={"pill " + (o.state === "pending" ? "pill-warn" : o.state === "performed" ? "pill-ok" : "pill-accent")}>{esc(o.state)}</span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>
            Obligation confirmations are recorded here with timestamps and anchored when
            confirmed — see the thread. Silence is a recorded fact, not an accusation.
          </p>
        </div>
      )}

      {history && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Chain log</h3>
          {history.length === 0 ? (
            <p className="muted">Nothing anchored yet.</p>
          ) : (
            history.map((e, i) => (
              <div className="row" key={i}>
                <span className="pill">{esc(e.detail?.doc_type || e.detail?.event_type)}</span>
                <div className="row-main">
                  <div className="row-title mono" style={{ fontSize: 12.5 }}>{esc(String(e.tx_hash).slice(0, 22))}…</div>
                  <div className="row-sub">
                    doc {esc(e.detail?.doc_id || "—")} · parent {esc(e.detail?.parent_doc_id || "—")}
                  </div>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{fmtTime(e.detail?.timestamp || null)}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Invite the other party</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13, marginBottom: 12 }}>
          They join through a scoped link that expires.
          {row.signed
            ? " The contract is signed — acceptance opens the thread immediately."
            : " The thread opens once the agreement is signed."}
        </p>
        <InvitePanel contractId={contractId} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        {row.signed ? (
          <Link className="btn btn-primary" href={`/thread?contract_id=${encodeURIComponent(contractId)}`}>
            Open the thread →
          </Link>
        ) : (
          <span className="pill pill-warn">no thread until the agreement is signed</span>
        )}
        {row.source === "hardened" && (
          <Link className="btn" href={`/harden`}>Analyse another contract</Link>
        )}
      </div>
    </>
  );
}