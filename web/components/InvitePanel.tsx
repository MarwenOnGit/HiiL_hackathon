"use client";

import { useState } from "react";
import { api, esc, fmtDate } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface Invite {
  token: string;
  otp_code: string;
  expires_at: string;
  invite_url: string;
}

export default function InvitePanel({ contractId }: { contractId: string }) {
  const { t } = useI18n();
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
        setError(String(body.error || t("ipanel.errCreate")));
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
          {busy ? t("ipanel.creating") : t("ipanel.create")}
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <h3>{t("ipanel.title")}</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        {t("ipanel.desc", { date: fmtDate(invite.expires_at) })}
      </p>
      <div className="field">
        <label>{t("ipanel.link")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" readOnly value={invite.invite_url} />
          <button className="btn btn-sm" onClick={() => copy(invite.invite_url)}>
            {copied === invite.invite_url ? t("ipanel.copied") : t("ipanel.copy")}
          </button>
        </div>
      </div>
      <div className="field" style={{ maxWidth: 220 }}>
        <label>{t("ipanel.code")}</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input mono" readOnly value={invite.otp_code} />
          <button className="btn btn-sm" onClick={() => copy(invite.otp_code)}>
            {copied === invite.otp_code ? t("ipanel.copied") : t("ipanel.copy")}
          </button>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
        {t("ipanel.note")}
      </p>
    </div>
  );
}