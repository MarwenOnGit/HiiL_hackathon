"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, esc, fmtDate, fmtTime, getMe, markSeen, type Me } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import TopBar from "@/components/TopBar";
import InvitePanel from "@/components/InvitePanel";

interface Message {
  sender: "owner" | "counterparty" | "insaf";
  body: string;
  sent_at: string;
  reply_meta?: {
    summoned_by: string;
    rule_based: boolean;
    grounded: boolean;
    monitor?: boolean;
    checkin_for?: string;
    confirmation_for?: string;
    outcome?: string;
    anchored?: boolean;
    amicable?: boolean;
  };
}

interface Milestone {
  milestone_id: string;
  obligation_id: string;
  kind: string;
  action: string;
  obligor_label: string;
  obligee_label: string;
  trigger_text: string;
  due_date: string | null;
  date_reference: string;
  state: string;
  days_until: number | null;
  alert: string | null;
  check_in: string;
}

interface Monitoring {
  active: boolean;
  as_of?: string;
  phase?: string;
  phase_reference?: string | null;
  milestones?: Milestone[];
  reason?: string;
}

function ThreadInner() {
  const router = useRouter();
  const params = useSearchParams();
  const contractId = params.get("contract_id") || "";
  const token = params.get("token") || "";
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  const [me, setMe] = useState<Me | null>(null);
  const [role, setRole] = useState<"owner" | "counterparty" | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [participants, setParticipants] = useState<{ owner: string; counterparty: string } | null>(null);
  const [gate, setGate] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [spell, setSpell] = useState("");
  const [monitoring, setMonitoring] = useState<Monitoring | null>(null);

  const loadMonitor = useCallback(async () => {
    if (!contractId) return;
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const { ok, body } = await api<Monitoring & { error?: string }>(
      `/api/monitor/${encodeURIComponent(contractId)}${qs}`
    );
    if (ok) setMonitoring(body);
  }, [contractId, token]);

  const load = useCallback(async () => {
    if (!contractId) return;
    const current = await getMe();
    setMe(current);

    // The counterparty is identified purely by the invitation token in the
    // address bar — no session, no login. The server echoes back `viewer`.
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const { ok, status, body } = await api<{
      messages?: Message[];
      participants?: { owner: string; counterparty: string };
      viewer?: "owner" | "counterparty" | null;
      error?: string;
    }>(`/api/threads/${encodeURIComponent(contractId)}/messages${qs}`);
    if (!ok) {
      setGate(String(body.error || `cannot open thread (${status})`));
      return;
    }
    setMessages(body.messages || []);
    setParticipants(body.participants || { owner: "MSME owner", counterparty: "Counterparty" });
    setRole(body.viewer || null);
    const last = (body.messages || []).filter((m) => m.sender !== "insaf").slice(-1)[0];
    markSeen(contractId, last ? last.sent_at : null);
  }, [contractId, token]);

  useEffect(() => {
    load();
    loadMonitor();
  }, [load, loadMonitor]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    if (!role || !draft.trim()) return;
    setBusy(true);
    const { ok, body } = await api<{ message?: Message; error?: string }>(
      `/api/threads/${encodeURIComponent(contractId)}/messages`,
      { method: "POST", body: JSON.stringify({ sender: role, body: draft, ...(token ? { token } : {}) }) }
    );
    if (!ok) {
      setGate(String(body.error || t("err.couldNotPost")));
      setBusy(false);
      return;
    }
    setMessages((prev) => [...(prev || []), body.message as Message]);
    setDraft("");
    setBusy(false);
  }

  async function summon() {
    if (!spell.trim()) return;
    setBusy(true);
    const { ok, body } = await api<{ message?: Message; reply?: { reply?: any }; error?: string }>(
      `/api/threads/${encodeURIComponent(contractId)}/assistant`,
      { method: "POST", body: JSON.stringify({ question: spell, ...(token ? { token } : {}) }) }
    );
    if (!ok) {
      setGate(String(body.error || t("err.assistantUnreachable")));
      setBusy(false);
      return;
    }
    setMessages((prev) => [...(prev || []), body.message as Message]);
    setSpell("");
    setBusy(false);
  }

  async function confirmMilestone(obligationId: string, outcome: string) {
    if (busy) return;
    setBusy(true);
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const { ok, body } = await api<{ error?: string }>(
      `/api/monitor/${encodeURIComponent(contractId)}/confirm${qs}`,
      { method: "POST", body: JSON.stringify({ obligation_id: obligationId, outcome, ...(token ? { token } : {}) }) }
    );
    if (!ok) {
      setGate(String(body.error || t("err.couldNotPost")));
      setBusy(false);
      return;
    }
    await load();
    await loadMonitor();
    setBusy(false);
  }

  async function escalateMilestone() {
    if (busy) return;
    setBusy(true);
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const ids = (monitoring?.milestones || []).map((m) => m.obligation_id);
    const { ok, body } = await api<{ error?: string }>(
      `/api/monitor/${encodeURIComponent(contractId)}/escalate${qs}`,
      { method: "POST", body: JSON.stringify({ obligation_ids: ids, ...(token ? { token } : {}) }) }
    );
    if (!ok) {
      setGate(String(body.error || t("err.couldNotPost")));
      setBusy(false);
      return;
    }
    await load();
    await loadMonitor();
    setBusy(false);
  }

  async function advanceDemo() {
    if (busy) return;
    setBusy(true);
    const { ok, body } = await api<{ error?: string }>(
      `/api/monitor/${encodeURIComponent(contractId)}/advance`,
      { method: "POST", body: JSON.stringify({ days: 4 }) }
    );
    if (!ok) {
      setGate(String(body.error || t("err.demoFailed")));
      setBusy(false);
      return;
    }
    await loadMonitor();
    setBusy(false);
  }

  const isParticipant = Boolean(role);
  const labels: Record<string, string> = participants
    ? { owner: participants.owner, counterparty: participants.counterparty }
    : { owner: t("dashboard.msme"), counterparty: t("dashboard.counterparty") };

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>{t("thread.title")}</h1>
          <span className="hash-tag">{contractId}</span>
          {role === "owner" && <span className="pill pill-accent">{t("thread.owner")}</span>}
          {role === "counterparty" && <span className="pill pill-ok">{t("thread.invited")}</span>}
        </div>

        {gate && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="banner banner-warn">
              <strong>{t("thread.gateTitle")}</strong> {esc(gate)}
            </div>
            <p className="muted">
              {t("thread.gateBody")}
            </p>
            {role === "owner" || (me && me.authenticated && me.kind === "msme") ? (
              <InvitePanel contractId={contractId} />
            ) : (
              <a className="btn" href="/">{t("thread.back")}</a>
            )}
            {gate && !gate.includes("open") && gate !== "not a participant in this thread" && (
              <button className="btn" onClick={() => { setGate(""); load(); }}>{t("thread.retry")}</button>
            )}
          </div>
        )}

        {!gate && (
          <div className="card" style={{ marginTop: 14 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              {t("thread.neutral")}
            </p>

            {monitoring && monitoring.active && (
              <div className="monitor">
                <strong style={{ fontSize: 13 }}>{t("thread.monitorTitle")}</strong>
                <p className="muted" style={{ margin: "4px 0 8px", fontSize: 12.5 }}>
                  {t("thread.monitorBody")}
                </p>

                {monitoring.phase === "amicable" && (
                  <div className="banner banner-warn" style={{ marginBottom: 10 }}>
                    {t("thread.monitorAmicable")}
                  </div>
                )}

                {(monitoring.milestones || []).map((m) => {
                  const label =
                    m.kind === "delivery"
                      ? t("thread.monitorDelivery")
                      : m.kind === "payment"
                        ? t("thread.monitorPayment")
                        : t("thread.monitorGeneric");
                  const estimated = m.date_reference !== "absolute";
                  const open =
                    m.alert && !["performed", "breached"].includes(m.state);
                  const overdue = m.alert === "overdue_unconfirmed";
                  return (
                    <div key={m.obligation_id} className="milestone-row" style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 13 }}>{label}</strong>
                        {m.due_date && (
                          <span style={{ fontSize: 13 }}>{fmtDate(m.due_date)}</span>
                        )}
                        {estimated && (
                          <span className="pill" style={{ fontSize: 11 }}>{t("thread.monitorEstimated")}</span>
                        )}
                        {m.alert === "due_soon" && (
                          <span className="pill pill-warn" style={{ fontSize: 11 }}>{t("thread.monitorDueSoon", { days: m.days_until ?? 0 })}</span>
                        )}
                        {m.alert === "due" && (
                          <span className="pill pill-warn" style={{ fontSize: 11 }}>{t("thread.monitorDueToday")}</span>
                        )}
                        {overdue && (
                          <span className="pill pill-warn" style={{ fontSize: 11 }}>{t("thread.monitorOverdue", { date: fmtDate(m.due_date) })}</span>
                        )}
                        {!m.alert && m.state === "performed" && (
                          <span className="pill pill-ok" style={{ fontSize: 11 }}>{t("thread.monitorComplete")}</span>
                        )}
                      </div>
                      <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                        {m.obligor_label} → {m.obligee_label} · {m.trigger_text}
                      </p>
                      {isParticipant && open && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                          <button className="btn btn-primary" onClick={() => confirmMilestone(m.obligation_id, "performed")} disabled={busy}>
                            {t("thread.monitorConfirmPerformed")}
                          </button>
                          <button className="btn" onClick={() => confirmMilestone(m.obligation_id, "not_yet")} disabled={busy}>
                            {t("thread.monitorConfirmNotYet")}
                          </button>
                          {overdue && (
                            <button className="btn btn-warn" onClick={() => confirmMilestone(m.obligation_id, "breached")} disabled={busy}>
                              {t("thread.monitorBreach")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {isParticipant && (monitoring.milestones || []).some((m) => m.alert === "overdue_unconfirmed") && (
                  <button className="btn btn-warm" onClick={escalateMilestone} disabled={busy} style={{ marginTop: 4 }}>
                    {t("thread.monitorEscalate")}
                  </button>
                )}

                {role === "owner" && monitoring.phase !== "amicable" && (
                  <button className="btn" onClick={advanceDemo} disabled={busy} style={{ marginTop: 4, float: "right" }}>
                    {t("thread.monitorAdvance")}
                  </button>
                )}
                <div style={{ clear: "both" }} />
              </div>
            )}

            <div className="thread-scroll" ref={scrollRef}>
              {messages === null ? (
                <p className="thread-empty">{t("common.loading")}</p>
              ) : messages.length === 0 ? (
                <p className="thread-empty">
                  {t("thread.noMsgs")}{isParticipant ? t("thread.sayHello") : ""}
                </p>
              ) : (
                messages.map((m, i) => {
                  const mine = isParticipant && m.sender === role;
                  return (
                    <div key={i} className={"msg " + (mine ? "msg-mine" : m.sender === "insaf" ? "msg-insaf" : "")}>
                      <div className="msg-meta">
                        {m.sender === "insaf" ? (
                          <>
                            Insaf · {t("thread.summoned", { name: m.reply_meta?.summoned_by ?? "" })}
                            {m.reply_meta && <span className="pill" style={{ marginInlineStart: 8 }}>{m.reply_meta.rule_based ? t("thread.ruleBased") : t("thread.analysed")}</span>}
                            {m.reply_meta && (
                              <span className={"pill " + (m.reply_meta.grounded ? "pill-ok" : "pill-warn")} style={{ marginInlineStart: 6 }}>
                                {m.reply_meta.grounded ? t("thread.grounded") : t("thread.noBasis")}
                              </span>
                            )}
                          </>
                        ) : (
                          `${labels[m.sender] || m.sender}`
                        )}
                        {" · "}
                        {fmtTime(m.sent_at)}
                      </div>
                      <div className="msg-body">{m.body}</div>
                    </div>
                  );
                })
              )}
            </div>

            {busy && <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>{t("common.working")}</p>}

            {isParticipant && (
              <>
                <div className="compose">
                  <input
                    className="input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder={t("thread.as", { name: labels[role ?? "owner"] || "…" })}
                    disabled={busy}
                  />
                  <button className="btn btn-primary" onClick={send} disabled={busy || !draft.trim()}>
                    {t("thread.send")}
                  </button>
                </div>

                <div className="assistant-panel">
                  <strong style={{ fontSize: 13 }}>{t("thread.assistantTitle")}</strong>
                  <p className="muted" style={{ margin: "4px 0 8px", fontSize: 12.5 }}>
                    {t("thread.assistantBody")}
                  </p>
                  <div className="compose" style={{ marginTop: 0 }}>
                    <input
                      className="input"
                      value={spell}
                      onChange={(e) => setSpell(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && summon()}
                      placeholder={t("thread.askPlaceholder")}
                      disabled={busy}
                    />
                    <button className="btn btn-warm" onClick={summon} disabled={busy || !spell.trim()}>
                      {t("thread.ask")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ThreadLoader() {
  const { t } = useI18n();
  return <div className="main"><p className="muted">{t("common.loading")}</p></div>;
}

export default function ThreadPage() {
  return (
    <Suspense fallback={<ThreadLoader />}>
      <ThreadInner />
    </Suspense>
  );
}