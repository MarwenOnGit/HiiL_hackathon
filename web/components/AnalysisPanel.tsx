"use client";

import { useI18n, type MsgKey } from "@/lib/i18n";

export interface LegalRef {
  source_doc: string;
  article_ref: string;
  excerpt?: string;
}

export interface Recommendation {
  clause_id?: string;
  risk_kind: "unenforceable" | "ambiguous" | "asymmetric" | string;
  rationale: string;
  original?: string;
  proposed?: string;
  grounded: boolean;
  citation_kind?: "verified" | "retrieved" | "none";
  legal_basis?: LegalRef[];
  no_legal_basis?: { message: string };
}

export interface Gap {
  label: string;
  why: string;
  severity: string;
}

export interface Analysis {
  clauses: { clause_id: string; type: string; article?: string }[];
  gaps: Gap[];
  recommendations: Recommendation[];
  grounding: { total_recommendations: number; grounded_recommendations: number; corpus_size?: number };
  risk_counts?: { unenforceable: number; ambiguous: number; asymmetric: number };
  analysis_anchor?: { attested?: boolean; tx_hash?: string; findings_hash?: string };
}

const SEVERITY_KEYS: Record<string, MsgKey> = {
  critical: "severity.critical",
  high: "severity.high",
  medium: "severity.medium",
  low: "severity.low"
};

const KIND_KEYS: Record<string, MsgKey> = {
  unenforceable: "an.kindUnenforceable",
  ambiguous: "an.kindAmbiguous",
  asymmetric: "an.kindAsymmetric"
};

const KIND_PILL: Record<string, string> = {
  unenforceable: "pill-danger",
  ambiguous: "pill-warn",
  asymmetric: "pill-warm"
};

export default function AnalysisPanel({ analysis }: { analysis: Analysis }) {
  const { t } = useI18n();
  const g = analysis.grounding;
  const counts = analysis.risk_counts;

  return (
    <>
      <div className="grid-stats" style={{ marginTop: 14 }}>
        <div className="stat">
          <div className="stat-num">{analysis.clauses.length}</div>
          <div className="stat-label">{t("an.statClauses")}</div>
        </div>
        <div className="stat">
          <div className="stat-num">{analysis.gaps.length}</div>
          <div className="stat-label">{t("an.statGaps")}</div>
        </div>
        <div className="stat">
          <div className="stat-num">{analysis.recommendations.length}</div>
          <div className="stat-label">{t("an.statRisks")}</div>
        </div>
      </div>

      {counts && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {counts.unenforceable > 0 && (
            <span className="pill pill-danger">
              {counts.unenforceable} {counts.unenforceable > 1 ? t("an.countUnenforceablePl") : t("an.countUnenforceable")}
            </span>
          )}
          {counts.ambiguous > 0 && (
            <span className="pill pill-warn">
              {counts.ambiguous} {counts.ambiguous > 1 ? t("an.countAmbiguousPl") : t("an.countAmbiguous")}
            </span>
          )}
          {counts.asymmetric > 0 && (
            <span className="pill pill-warm">
              {counts.asymmetric} {counts.asymmetric > 1 ? t("an.countAsymmetricPl") : t("an.countAsymmetric")}
            </span>
          )}
        </div>
      )}

      <div className={"banner " + (g.grounded_recommendations > 0 ? "banner-ok" : "banner-warn")}>
        {t("an.grounded", { n: g.grounded_recommendations, total: g.total_recommendations })}
      </div>

      {/* ---- what the contract fails to say ---- */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3>{t("an.gapsTitle")}</h3>
        {analysis.gaps.length === 0 && <p className="muted">{t("findings.noneMissing")}</p>}
        {analysis.gaps.map((gap, i) => (
          <div className="row" key={i}>
            <span className={"pill " + (gap.severity === "critical" ? "pill-danger" : gap.severity === "high" ? "pill-warn" : "pill")}>
              {SEVERITY_KEYS[gap.severity] ? t(SEVERITY_KEYS[gap.severity]) : gap.severity}
            </span>
            <div className="row-main">
              <div className="row-title">{gap.label}</div>
              <div className="row-sub">{gap.why}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ---- anomalies in what IS written ---- */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3>{t("an.risksTitle")}</h3>
        <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>{t("an.neverModified")}</p>

        {analysis.recommendations.map((r, i) => (
          <div className={"finding-card rk-" + r.risk_kind} key={i}>
            <div className="finding-head">
              <span className={"pill " + (KIND_PILL[r.risk_kind] || "pill")}>
                {KIND_KEYS[r.risk_kind] ? t(KIND_KEYS[r.risk_kind]) : r.risk_kind}
              </span>
              {r.clause_id && <span className="hash-tag">{r.clause_id}</span>}
              {r.citation_kind === "verified" && (
                <span className="pill pill-accent">{t("an.verified")}</span>
              )}
            </div>

            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.rationale}</div>

            {r.original && (
              <>
                <div className="muted" style={{ fontSize: 12, marginTop: 9 }}>{t("an.current")}</div>
                <div className="clause-text was">{r.original}</div>
              </>
            )}
            {r.proposed && (
              <>
                <div className="muted" style={{ fontSize: 12, marginTop: 9 }}>
                  {t("an.proposed")} <span className="pill" style={{ fontSize: 10.5 }}>{t("an.notApplied")}</span>
                </div>
                <div className="clause-text now">{r.proposed}</div>
              </>
            )}

            {r.grounded && r.legal_basis && r.legal_basis.length > 0 ? (
              <div className="legal-ref">
                <div>
                  <span className="art">{t("an.basis")} :</span>{" "}
                  {r.legal_basis.map((b) => `${b.source_doc}, ${b.article_ref}`).join(" · ")}
                </div>
                {r.legal_basis.map((b, bi) =>
                  b.excerpt ? <blockquote key={bi}>« {b.excerpt} »</blockquote> : null
                )}
              </div>
            ) : (
              <div className="banner banner-warn" style={{ marginBottom: 0 }}>
                {r.no_legal_basis?.message || t("an.noBasis")}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
