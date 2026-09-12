"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, esc, fmtTime, unreadCount } from "@/lib/api";
import TopBar from "@/components/TopBar";
import InvitePanel from "@/components/InvitePanel";

interface Row {
  contract_id: string;
  source: "wizard" | "hardened";
  msme_owner: string | null;
  counterparty: string | null;
  generated_at: string | null;
  version_count: number;
  consent_tier: string | null;
  signed: boolean;
  onchain: { hash: string } | null;
  thread_message_count: number;
  thread_last_sent_at: string | null;
  invite_active: boolean;
  invite_expires_at: string | null;
}

interface Mine {
  rows: Row[];
  chain_mode: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [chainMode, setChainMode] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [openInvite, setOpenInvite] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = useCallback(async () => {
    const { ok, status, body } = await api<Mine | { error?: string }>("/api/dashboard/mine");
    if (!ok) {
      if (status === 401) {
        router.replace("/");
        return;
      }
      setError(String((body as { error?: string }).error || "could not load your contracts"));
      setRows([] as Row[]);
      return;
    }
    const data = body as Mine;
    setRows(data.rows);
    setChainMode(data.chain_mode);

    const targets = data.rows.filter((r) => r.signed && r.thread_message_count > 0);
    const counts: Record<string, number> = {};
    await Promise.all(
      targets.map(async (r) => {
        counts[r.contract_id] = await unreadCount(r.contract_id, r.thread_last_sent_at);
      })
    );
    setUnread(counts);
  }, [router]);

  async function generateDemo() {
    setError("");
    setAdding(true);
    try {
      const rel = await api<{ relationship_id?: string; error?: string }>("/api/relationships/demo", {
        method: "POST"
      });
      if (!rel.ok || !rel.body.relationship_id) throw new Error(String(rel.body.error || "demo failed"));
      const gen = await api<{ contract_id?: string; error?: string }>("/api/contracts/generate", {
        method: "POST",
        body: JSON.stringify({ relationship_id: rel.body.relationship_id })
      });
      if (!gen.ok || !gen.body.contract_id) throw new Error(String(gen.body.error || "generation failed"));
      const id = gen.body.contract_id;
      const created = await api<{ invite?: { invite_url: string }; contract_id?: string }>(
        `/api/invites/${encodeURIComponent(id)}`,
        { method: "POST" }
      );
      if (created.ok && created.body.invite) {
        router.push(`/contracts/${encodeURIComponent(id)}?invited=1`);
      } else {
        router.push(`/contracts/${encodeURIComponent(id)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "generation failed");
      setAdding(false);
    }
  }

  const totalSigned = rows ? rows.filter((r) => r.signed).length : 0;
  const totalMsgs = rows ? rows.reduce((n, r) => n + r.thread_message_count, 0) : 0;

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Dashboard</h1>
          <span className="pill">chain: {chainMode || "…"}</span>
        </div>
        <p className="muted" style={{ marginTop: 4 }}>
          From one place: harden a contract, invite the other party, keep the
          signed record, track obligations and settle disputes before court.
        </p>

        <div className="grid-stats" style={{ marginTop: 14 }}>
          <div className="stat">
            <div className="stat-num">{rows ? rows.length : "–"}</div>
            <div className="stat-label">Contracts you own</div>
          </div>
          <div className="stat">
            <div className="stat-num">{totalSigned}</div>
            <div className="stat-label">Signed / executed</div>
          </div>
          <div className="stat">
            <div className="stat-num">{totalMsgs}</div>
            <div className="stat-label">Thread messages</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <Link href="/harden" className="btn btn-primary">
            Analyse a contract (harden it)
          </Link>
          <button className="btn btn-warm" onClick={generateDemo} disabled={adding}>
            {adding ? "Generating demo…" : "Generate a demo relationship"}
          </button>
        </div>

        {error && <div className="banner banner-danger">{error}</div>}

        <div className="section-title">
          <h2>Contracts</h2>
          <span className="muted">one contract identity · many versions · append-only</span>
        </div>

        {rows === null || rows.length === 0 ? (
          <div className="card">
            {rows === null ? (
              <p className="muted">Loading…</p>
            ) : (
              <p className="muted">
                Nothing here yet. Generate a demo relationship above, or analyse a
                contract you already have.
              </p>
            )}
          </div>
        ) : (
          rows.map((r) => (
            <div className="card" key={r.contract_id} style={{ padding: 6, marginBottom: 12 }}>
              <div className="row">
                <div className="row-main">
                  <div className="row-title">
                    {esc(r.msme_owner || "MSME")} → {esc(r.counterparty || "Counterparty")}
                    <span className="pill pill-accent" style={{ marginLeft: 8 }}>
                      {r.source}
                    </span>
                    {r.signed && <span className="pill pill-ok" style={{ marginLeft: 6 }}>signed</span>}
                    {!r.signed && <span className="pill pill-warn" style={{ marginLeft: 6 }}>draft</span>}
                  </div>
                  <div className="row-sub">
                    <span className="hash-tag">{r.contract_id}</span>
                    {r.version_count > 0 && <> · {r.version_count} version{r.version_count > 1 ? "s" : ""}</>}
                    {r.consent_tier && <> · tier {esc(r.consent_tier)}</>}
                    {r.generated_at && <> · {fmtTime(r.generated_at)}</>}
                    {r.invite_active && (
                      <>
                        {" · "}
                        invite open
                        {r.invite_expires_at && <> until {fmtTime(r.invite_expires_at)}</>}
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Link href={`/contracts/${encodeURIComponent(r.contract_id)}`} className="btn btn-sm">
                    Details
                  </Link>
                  {r.signed ? (
                    <Link href={`/thread?contract_id=${encodeURIComponent(r.contract_id)}`} className="btn btn-sm btn-primary">
                      Thread
                      {unread[r.contract_id] > 0 && (
                        <span className="badge-unread" style={{ marginLeft: 6 }}>
                          {unread[r.contract_id]}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <span className="pill pill-warn">no thread until signed</span>
                  )}
                  <button className="btn btn-sm" onClick={() => setOpenInvite(openInvite === r.contract_id ? null : r.contract_id)}>
                    {openInvite === r.contract_id ? "Close invite" : "Invite"}
                  </button>
                </div>
              </div>
              {openInvite === r.contract_id && (
                <div style={{ padding: "0 4px 14px" }}>
                  <InvitePanel contractId={r.contract_id} />
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}