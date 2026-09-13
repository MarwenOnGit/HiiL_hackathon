"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, esc, getMe } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import TopBar, { InsafMark } from "@/components/TopBar";

interface InviteInfo {
  status: "pending" | "already_confirmed" | "expired";
  contract_id: string | null;
  need_accept: boolean;
  source: "wizard" | "hardened";
  contract: {
    parties: { owner: string; counterparty: string };
    contract_text?: string;
  } | null;
}

function threadUrl(contractId: string, token: string) {
  return `/thread?contract_id=${encodeURIComponent(contractId)}&token=${encodeURIComponent(token)}`;
}

function InviteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const { t } = useI18n();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(params.get("waiting") === "true");
  const [busy, setBusy] = useState(false);
  const [edge, setEdge] = useState<"thread" | "waiting" | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!token) return;
    (async () => {
      const me = await getMe();
      if (me.authenticated && me.kind === "msme") {
        router.replace("/dashboard");
        return;
      }
      const { ok, body } = await api<InviteInfo | { error?: string }>("/api/invites/" + encodeURIComponent(token));
      if (!ok) {
        setError(String((body as { error?: string }).error || t("invite.notFound")));
        return;
      }
      const i = body as InviteInfo;
      setInfo(i);
      // A returning party or one who already accepted goes straight into the
      // thread: the token alone is their identity.
      if (i.status === "already_confirmed" && i.contract_id) {
        setEdge("thread");
        router.replace(threadUrl(i.contract_id, token));
      }
    })();
  }, [token, router, waiting, t]);

  async function accept() {
    if (info?.need_accept && code.trim().length !== 6) {
      setError(t("invite.codeError"));
      return;
    }
    setBusy(true);
    setError("");
    const { ok, body } = await api<{ ok?: boolean; contract_id?: string; executed?: boolean; error?: string; status?: string }>(
      `/api/invites/${encodeURIComponent(token)}/accept`,
      { method: "POST", body: JSON.stringify({ otp_code: code.trim() }) }
    );
    if (!ok || !body.ok) {
      setError(String(body.error || t("err.acceptFailed")));
      setBusy(false);
      return;
    }
    if (body.contract_id) {
      setEdge("thread");
      router.replace(threadUrl(body.contract_id, token));
    } else {
      setEdge("waiting");
    }
  }

  if (!token) {
    return (
      <main className="main main-narrow">
        <div className="card">
          <h3>{t("invite.openTitle")}</h3>
          <p className="muted">{t("invite.paste")}</p>
          <input
            className="input"
            placeholder="invite?token=…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const m = (e.target as HTMLInputElement).value.match(/token=([\w-]+)/);
                if (m) window.location.href = `/invite?token=${m[1]}`;
              }
            }}
          />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="main main-narrow">
        <div className="banner banner-danger">
          <strong>{t("invite.inaccessible")}</strong> {esc(error)}
        </div>
        <a className="btn" href="/">{t("invite.backInsaf")}</a>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="main main-narrow">
        <p className="muted">{t("invite.loading")}</p>
      </main>
    );
  }

  if (edge === "waiting") {
    return (
      <main className="main main-narrow">
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <InsafMark size={40} />
          <h2>{t("invite.confirmedTitle")}</h2>
          <p className="muted">
            {t("invite.confirmedBody")}
          </p>
          <p className="muted">{t("invite.keepLink")}</p>
          <button className="btn" onClick={() => window.location.reload()}>{t("invite.checkAgain")}</button>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <main className="main main-narrow">
        <div className="card">
          <h1 style={{ fontSize: 22, marginTop: 0 }}>{t("invite.beenInvited")}</h1>
          <p className="muted">
            {t("invite.beenInvitedBody", { owner: esc(info.contract?.parties.owner || t("dashboard.msme")) })}
          </p>

          {info.contract && (
            <div className="banner banner-info">
              <strong>{esc(info.contract.parties.owner)} → {esc(info.contract.parties.counterparty)}</strong>
              <span className="pill pill-accent" style={{ marginInlineStart: 8 }}>
                {info.source === "wizard" ? t("common.wizard") : t("common.hardened")}
              </span>
              <span className="hash-tag" style={{ marginInlineStart: 8 }}>{info.contract_id}</span>
            </div>
          )}

          {info.contract?.contract_text && (
            <div style={{ margin: "12px 0" }}>
              <details>
                <summary className="muted" style={{ cursor: "pointer" }}>{t("invite.preview")}</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, background: "var(--surface-alt)", padding: 12, borderRadius: 10, marginTop: 8 }}>{info.contract.contract_text}</pre>
              </details>
            </div>
          )}

          {info.need_accept && (
            <div style={{ margin: "14px 0" }}>
              <label className="muted" style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                {t("invite.code")}
              </label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                placeholder={t("invite.codePlaceholder")}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") accept();
                }}
                autoFocus
              />
            </div>
          )}

          {error && <div className="banner banner-danger">{error}</div>}

          <button className="btn btn-primary btn-block" onClick={accept} disabled={busy}>
            {busy ? t("invite.recording") : info.need_accept ? t("invite.accept") : t("invite.return")}
          </button>

          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            {t("invite.humanNote")}
          </p>
        </div>
      </main>
    </div>
  );
}

function InviteLoader() {
  const { t } = useI18n();
  return <div className="main main-narrow"><p className="muted">{t("common.loading")}</p></div>;
}

export default function InvitePage() {
  return (
    <Suspense fallback={<InviteLoader />}>
      <InviteInner />
    </Suspense>
  );
}