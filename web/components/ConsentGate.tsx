"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { InsafMark } from "@/components/TopBar";

interface Status {
  party?: string;
  consented?: boolean;
  version?: string;
  error?: string;
}

// The three the party must tick to enter, plus one they may decline. Splitting
// them matters: bundling an optional purpose into a required checkbox is the
// dark pattern this screen exists to avoid.
const REQUIRED = ["record", "share", "terms"] as const;
const OPTIONAL = ["notify"] as const;

type Scope = (typeof REQUIRED)[number] | (typeof OPTIONAL)[number];

export default function ConsentGate({
  contractId,
  token,
  onGranted
}: {
  contractId: string;
  token?: string;
  onGranted: () => void;
}) {
  const { t } = useI18n();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    api<Status>(`/api/consent/${encodeURIComponent(contractId)}${qs}`).then(({ ok, body }) => {
      if (ok && body.consented) onGranted();
      else setReady(true);
    });
    // onGranted is stable enough for this one-shot check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, token]);

  const allRequired = REQUIRED.every((s) => checked[s]);

  function toggle(scope: Scope) {
    setChecked((prev) => ({ ...prev, [scope]: !prev[scope] }));
  }

  function acceptAll() {
    const next: Record<string, boolean> = {};
    [...REQUIRED, ...OPTIONAL].forEach((s) => { next[s] = true; });
    setChecked(next);
  }

  async function submit() {
    if (!allRequired || busy) return;
    setBusy(true);
    setError("");
    const scopes = REQUIRED.filter((s) => checked[s]);
    const optional_scopes = OPTIONAL.filter((s) => checked[s]);
    const { ok, body } = await api<{ error?: string }>(
      `/api/consent/${encodeURIComponent(contractId)}`,
      { method: "POST", body: JSON.stringify({ scopes, optional_scopes, ...(token ? { token } : {}) }) }
    );
    if (!ok) {
      setError(String(body.error || t("cs.errFailed")));
      setBusy(false);
      return;
    }
    onGranted();
  }

  if (!ready) {
    return <div className="main main-narrow"><p className="muted">{t("common.loading")}</p></div>;
  }

  return (
    <div className="consent-wrap">
      <div className="consent-card">
        <div className="consent-head">
          <InsafMark size={44} />
          <h1>{t("cs.title")}</h1>
          <p className="muted">{t("cs.intro")}</p>
        </div>

        <div className="consent-list">
          {REQUIRED.map((scope) => (
            <label className={"consent-item " + (checked[scope] ? "on" : "")} key={scope} htmlFor={`consent-${scope}`}>
              <input
                id={`consent-${scope}`}
                type="checkbox"
                checked={Boolean(checked[scope])}
                onChange={() => toggle(scope)}
              />
              <span className="consent-copy">
                <strong>
                  {t(`cs.${scope}Title` as never)}
                  <span className="consent-req">{t("cs.required")}</span>
                </strong>
                <span className="muted">{t(`cs.${scope}Body` as never)}</span>
              </span>
            </label>
          ))}

          {OPTIONAL.map((scope) => (
            <label className={"consent-item " + (checked[scope] ? "on" : "")} key={scope} htmlFor={`consent-${scope}`}>
              <input
                id={`consent-${scope}`}
                type="checkbox"
                checked={Boolean(checked[scope])}
                onChange={() => toggle(scope)}
              />
              <span className="consent-copy">
                <strong>
                  {t(`cs.${scope}Title` as never)}
                  <span className="consent-opt">{t("cs.optional")}</span>
                </strong>
                <span className="muted">{t(`cs.${scope}Body` as never)}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="consent-note">{t("cs.rights")}</div>

        {error && <div className="banner banner-danger">{error}</div>}

        <div className="consent-actions">
          <button className="btn" onClick={acceptAll} disabled={busy}>
            {t("cs.acceptAll")}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !allRequired}>
            {busy ? t("common.working") : t("cs.continue")}
          </button>
        </div>
        {!allRequired && <p className="consent-hint">{t("cs.mustAccept")}</p>}
      </div>
    </div>
  );
}
