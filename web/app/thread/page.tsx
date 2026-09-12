"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, esc, fmtTime, getMe, markSeen, type Me } from "@/lib/api";
import TopBar from "@/components/TopBar";
import InvitePanel from "@/components/InvitePanel";

interface Message {
  sender: "owner" | "counterparty" | "insaf";
  body: string;
  sent_at: string;
  reply_meta?: { summoned_by: string; rule_based: boolean; grounded: boolean };
}

function ThreadInner() {
  const router = useRouter();
  const params = useSearchParams();
  const contractId = params.get("contract_id") || "";
  const token = params.get("token") || "";
  const scrollRef = useRef<HTMLDivElement>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [role, setRole] = useState<"owner" | "counterparty" | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [participants, setParticipants] = useState<{ owner: string; counterparty: string } | null>(null);
  const [gate, setGate] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [spell, setSpell] = useState("");

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
  }, [load]);

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
      setGate(String(body.error || "could not post"));
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
      setGate(String(body.error || "the assistant is unreachable"));
      setBusy(false);
      return;
    }
    setMessages((prev) => [...(prev || []), body.message as Message]);
    setSpell("");
    setBusy(false);
  }

  const isParticipant = Boolean(role);
  const labels: Record<string, string> = participants
    ? { owner: participants.owner, counterparty: participants.counterparty }
    : { owner: "MSME", counterparty: "Counterparty" };

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Thread</h1>
          <span className="hash-tag">{contractId}</span>
          {role === "owner" && <span className="pill pill-accent">you're the owner</span>}
          {role === "counterparty" && <span className="pill pill-ok">you're the invited party</span>}
        </div>

        {gate && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="banner banner-warn">
              <strong>This thread isn't open for you yet.</strong> {esc(gate)}
            </div>
            <p className="muted">
              The thread opens once the agreement is signed by both parties. As
              the owner you can invite the counterparty from here.
            </p>
            {role === "owner" || (me && me.authenticated && me.kind === "msme") ? (
              <InvitePanel contractId={contractId} />
            ) : (
              <a className="btn" href="/">Back</a>
            )}
            {gate && !gate.includes("open") && gate !== "not a participant in this thread" && (
              <button className="btn" onClick={() => { setGate(""); load(); }}>Retry</button>
            )}
          </div>
        )}

        {!gate && (
          <div className="card" style={{ marginTop: 14 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Neutral ground: both parties see this same record. Obligation and
              settlement confirmations made here are timestamped and anchored —
              silence is a recorded fact, not an accusation.
            </p>

            <div className="thread-scroll" ref={scrollRef}>
              {messages === null ? (
                <p className="thread-empty">Loading…</p>
              ) : messages.length === 0 ? (
                <p className="thread-empty">
                  No messages yet. {isParticipant ? "Say hello, then agree on what happens next." : ""}
                </p>
              ) : (
                messages.map((m, i) => {
                  const mine = isParticipant && m.sender === role;
                  return (
                    <div key={i} className={"msg " + (mine ? "msg-mine" : m.sender === "insaf" ? "msg-insaf" : "")}>
                      <div className="msg-meta">
                        {m.sender === "insaf" ? (
                          <>
                            Insaf · {m.reply_meta?.summoned_by} asked
                            {m.reply_meta && <span className="pill" style={{ marginLeft: 8 }}>{m.reply_meta.rule_based ? "rule-based" : "analysed"}</span>}
                            {m.reply_meta && (
                              <span className={"pill " + (m.reply_meta.grounded ? "pill-ok" : "pill-warn")} style={{ marginLeft: 6 }}>
                                {m.reply_meta.grounded ? "grounded" : "no legal basis found"}
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

            {busy && <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>Working…</p>}

            {isParticipant && (
              <>
                <div className="compose">
                  <input
                    className="input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder={`Message as ${labels[role as string] || role}…`}
                    disabled={busy}
                  />
                  <button className="btn btn-primary" onClick={send} disabled={busy || !draft.trim()}>
                    Send
                  </button>
                </div>

                <div className="assistant-panel">
                  <strong style={{ fontSize: 13 }}>Call Insaf into the conversation</strong>
                  <p className="muted" style={{ margin: "4px 0 8px", fontSize: 12.5 }}>
                    Ask about obligations, versions or this dispute. The answer is
                    posted <em>into the thread</em> so both parties read the same
                    neutral reply — grounded only in retrieved law, never invented.
                  </p>
                  <div className="compose" style={{ marginTop: 0 }}>
                    <input
                      className="input"
                      value={spell}
                      onChange={(e) => setSpell(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && summon()}
                      placeholder="e.g. Which obligations are overdue? / Quelle version s'applique en juin ?"
                      disabled={busy}
                    />
                    <button className="btn btn-warm" onClick={summon} disabled={busy || !spell.trim()}>
                      Ask Insaf
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

export default function ThreadPage() {
  return (
    <Suspense fallback={<div className="main"><p className="muted">Loading…</p></div>}>
      <ThreadInner />
    </Suspense>
  );
}