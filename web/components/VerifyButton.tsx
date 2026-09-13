"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface VerifyResult {
  verified: boolean;
  version_id?: string;
  text_hash?: string;
  anchor_doc_id?: string;
  error?: string;
}

// The tamper check. A mismatch is not a failure of the system — it IS the
// system working, which is why the failed state is rendered as loudly as the
// passing one rather than as an error toast.
export default function VerifyButton({ contractId }: { contractId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    const { ok, body } = await api<VerifyResult>(
      `/api/agent/contracts/${encodeURIComponent(contractId)}/verify`
    );
    setResult(ok ? body : { verified: false, error: body.error || "vérification impossible" });
    setBusy(false);
  }

  return (
    <div>
      <button className="btn btn-sm" onClick={run} disabled={busy}>
        {busy ? t("vf.checking") : t("vf.button")}
      </button>

      {result && (
        <div className={"banner " + (result.verified ? "banner-ok" : "banner-danger")}>
          <strong>{result.verified ? t("vf.ok") : t("vf.fail")}</strong>
          {result.verified
            ? t("vf.okBody", { version: result.version_id || "—" })
            : `${t("vf.failBody")}${result.error ? ` (${result.error})` : ""}`}
          {result.text_hash && (
            <div className="hash-tag" style={{ marginTop: 8, display: "inline-block" }}>
              {result.text_hash.slice(0, 26)}…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
