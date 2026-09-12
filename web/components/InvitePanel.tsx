"use client";

import { useState } from "react";
import { api, esc, fmtDate } from "@/lib/api";

interface Invite {
  token: string;
  otp_code: string;
  expires_at: string;
  invite_url: string;
}

export default function InvitePanel({ contractId }: { contractId: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const { ok, body } = await api<{ invite?: Invite; error?: string }>(
        `/api/invites/${encodeURIComponent(contractId)}`,
        { method: "POST" }
      );
      if (!ok || !body.invite) {
        setError(String(body.error || "could not create an invitation"));
        return;
      }
      setInvite(body.invite);
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1400);
  }

  if (!invite) {
    return (
      <div>
        <button className="btn btn-sm" onClick={load} disabled={busy}>
          {busy ? "Creating…" : "Create invitation"}
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <h3>Invite your counterparty</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Send this link <em>and</em> code to the other party by your own channel.
        Expires {fmtDate(invite.expires_at)}.
      </p>
      <div className="field">
        <label>Invitation link</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" readOnly value={invite.invite_url} />
          <button className="btn btn-sm" onClick={() => copy(invite.invite_url)}>
            {copied === invite.invite_url ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="field" style={{ maxWidth: 220 }}>
        <label>Confirmation code (share separately)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input mono" readOnly value={invite.otp_code} />
          <button className="btn btn-sm" onClick={() => copy(invite.otp_code)}>
            {copied === invite.otp_code ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        The thread for this contract opens to the invited party once the
        agreement is signed. One invitation per contract — reusing the link is
        fine.
      </p>
    </div>
  );
}