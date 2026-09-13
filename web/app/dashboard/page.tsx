"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, esc, fmtTime, unreadCount } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [chainMode, setChainMode] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
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
      setError(String((body as { error?: string }).error || t("dashboard.errLoad")));
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
  }, [router, t]);



  const totalSigned = rows ? rows.filter((r) => r.signed).length : 0;
  const totalMsgs = rows ? rows.reduce((n, r) => n + r.thread_message_count, 0) : 0;

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>{t("dashboard.title")}</h1>
          <span className="pill">{t("dashboard.chain")} {chainMode || "…"}</span>
        </div>
        <p className="muted" style={{ marginTop: 4 }}>
          {t("dashboard.intro")}
        </p>

        <div className="grid-stats" style={{ marginTop: 14 }}>
          <div className="stat">
            <div className="stat-num">{rows ? rows.length : "–"}</div>
            <div className="stat-label">{t("dashboard.statContracts")}</div>
          </div>
          <div className="stat">
            <div className="stat-num">{totalSigned}</div>
            <div className="stat-label">{t("dashboard.statSigned")}</div>
          </div>
          <div className="stat">
            <div className="stat-num">{totalMsgs}</div>
            <div className="stat-label">{t("dashboard.statThreads")}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <Link href="/harden" className="btn btn-primary">
            {t("dashboard.analyse")}
          </Link>
        </div>

        {error && <div className="banner banner-danger">{error}</div>}

        <div className="section-title">
          <h2>{t("dashboard.sectionTitle")}</h2>
          <span className="muted">{t("dashboard.sectionSub")}</span>
        </div>

        {rows === null || rows.length === 0 ? (
          <div className="card">
            {rows === null ? (
              <p className="muted">{t("common.loading")}</p>
            ) : (
              <p className="muted">{t("dashboard.empty")}</p>
            )}
          </div>
        ) : (
          rows.map((r) => (
            <div className="card" key={r.contract_id} style={{ padding: 6, marginBottom: 12 }}>
              <div className="row">
                <div className="row-main">
                  <div className="row-title">
                    {esc(r.msme_owner || t("dashboard.msme"))} → {esc(r.counterparty || t("dashboard.counterparty"))}
                    <span className="pill pill-accent" style={{ marginInlineStart: 8 }}>
                      {r.source === "wizard" ? t("common.wizard") : t("common.hardened")}
                    </span>
                    {r.source === "hardened" ? (
                      <span className="pill pill-ok" style={{ marginInlineStart: 6 }}>{t("common.anchored")}</span>
                    ) : r.signed ? (
                      <span className="pill pill-ok" style={{ marginInlineStart: 6 }}>{t("common.signed")}</span>
                    ) : (
                      <span className="pill pill-warn" style={{ marginInlineStart: 6 }}>{t("common.draft")}</span>
                    )}
                  </div>
                  <div className="row-sub">
                    <span className="hash-tag">{r.contract_id}</span>
                    {r.version_count > 0 && (
                      <> · {r.version_count} {r.version_count > 1 ? t("dashboard.versionsMany") : t("dashboard.versions")}</>
                    )}
                    {r.consent_tier && <> · {t("dashboard.tier")} {esc(r.consent_tier)}</>}
                    {r.generated_at && <> · {fmtTime(r.generated_at)}</>}
                    {r.invite_active && (
                      <>
                        {" · "}
                        {t("dashboard.inviteOpen")}
                        {r.invite_expires_at && <> {t("dashboard.until")} {fmtTime(r.invite_expires_at)}</>}
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Link href={`/contracts/${encodeURIComponent(r.contract_id)}`} className="btn btn-sm">
                    {t("dashboard.details")}
                  </Link>
                  {r.signed || r.source === "hardened" ? (
                    <Link href={`/thread?contract_id=${encodeURIComponent(r.contract_id)}`} className="btn btn-sm btn-primary">
                      {t("dashboard.thread")}
                      {unread[r.contract_id] > 0 && (
                        <span className="badge-unread" style={{ marginInlineStart: 6 }}>
                          {unread[r.contract_id]}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <span className="pill pill-warn">{t("dashboard.noThread")}</span>
                  )}
                  <button className="btn btn-sm" onClick={() => setOpenInvite(openInvite === r.contract_id ? null : r.contract_id)}>
                    {openInvite === r.contract_id ? t("dashboard.closeInvite") : t("dashboard.invite")}
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