"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, esc, getMe } from "@/lib/api";
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
        setError(String((body as { error?: string }).error || "invitation not found"));
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
  }, [token, router, waiting]);

  async function accept() {
    if (info?.need_accept && code.trim().length !== 6) {
      setError("Enter the 6-digit confirmation code from the other party.");
      return;
    }
    setBusy(true);
    setError("");
    const { ok, body } = await api<{ ok?: boolean; contract_id?: string; executed?: boolean; error?: string; status?: string }>(
      `/api/invites/${encodeURIComponent(token)}/accept`,
      { method: "POST", body: JSON.stringify({ otp_code: code.trim() }) }
    );
    if (!ok || !body.ok) {
      setError(String(body.error || "acceptance failed"));
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
          <h3>Open your invitation</h3>
          <p className="muted">The invitation link from the other party contains a token. Paste the full link here.</p>
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
          <strong>Invitation inaccessible.</strong> {esc(error)}
        </div>
        <a className="btn" href="/">Back to Insaf</a>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="main main-narrow">
        <p className="muted">Loading invitation…</p>
      </main>
    );
  }

  if (edge === "waiting") {
    return (
      <main className="main main-narrow">
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <InsafMark size={40} />
          <h2>You're confirmed.</h2>
          <p className="muted">
            Your acceptance has been recorded. The secure thread opens once the
            owner has signed the agreement — you'll be notified here.
          </p>
          <p className="muted">Keep this link: returning with it signs you straight into the thread.</p>
          <button className="btn" onClick={() => window.location.reload()}>Check again</button>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <main className="main main-narrow">
        <div className="card">
          <h1 style={{ fontSize: 22, marginTop: 0 }}>You've been invited</h1>
          <p className="muted">
            <strong>{esc(info.contract?.parties.owner || "An MSME owner")}</strong> wants you to
            join a contract on Insaf. Join to see the same signed record and talk
            in a neutral, tamper-proof thread before anything reaches a court.
          </p>

          {info.contract && (
            <div className="banner banner-info">
              <strong>{esc(info.contract.parties.owner)} → {esc(info.contract.parties.counterparty)}</strong>
              <span className="pill pill-accent" style={{ marginLeft: 8 }}>{info.source}</span>
              <span className="hash-tag" style={{ marginLeft: 8 }}>{info.contract_id}</span>
            </div>
          )}

          {info.contract?.contract_text && (
            <div style={{ margin: "12px 0" }}>
              <details>
                <summary className="muted" style={{ cursor: "pointer" }}>Preview the contract</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 12.5, background: "var(--surface-alt)", padding: 12, borderRadius: 10, marginTop: 8 }}>{info.contract.contract_text}</pre>
              </details>
            </div>
          )}

          {info.need_accept && (
            <div style={{ margin: "14px 0" }}>
              <label className="muted" style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                Confirmation code
              </label>
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digits from the other party"
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
            {busy ? "Recording…" : info.need_accept ? "Accept and open the thread" : "Return to the thread"}
          </button>

          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            Accepting is a human act on your side. Nothing is signed for you —
            this records that you received the contract and agreed to discuss
            it in this thread.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="main main-narrow"><p className="muted">Loading…</p></div>}>
      <InviteInner />
    </Suspense>
  );
}