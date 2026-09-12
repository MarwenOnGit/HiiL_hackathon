"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getMe } from "@/lib/api";
import { InsafMark } from "@/components/TopBar";
import ThemeToggle from "@/components/ThemeToggle";

type Mode = "login" | "register";

export default function Landing() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe().then((me) => {
      if (me.authenticated && me.kind === "msme") router.replace("/dashboard");
    });
  }, [router]);

  async function submit() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    const { ok, body } = await api<{ error?: string; user?: { name?: string } }>(
      mode === "login" ? "/api/auth/login" : "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() })
      }
    );
    if (!ok) {
      setError(String(body.error || "could not sign in"));
      setBusy(false);
      return;
    }
    router.push("/dashboard");
  }

  async function withDemo() {
    setBusy(true);
    setError("");
    const { ok, body } = await api<{ user?: { name?: string }; error?: string }>(
      "/api/auth/demo",
      { method: "POST" }
    );
    if (!ok) {
      setError(String(body.error || "could not start a demo session"));
      setBusy(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <InsafMark />
          <span className="brand-text">
            <strong>Insaf</strong>
            <span>إنصاف · commercial justice for MSMEs</span>
          </span>
        </span>
        <span className="top-spacer" />
        <ThemeToggle />
      </header>

      <div className="login-wrap">
        <div className="login-card">
          <div className="card">
            <h1 style={{ marginTop: 0, fontSize: 22 }}>
              {mode === "login" ? "Sign in to Insaf" : "Create an account"}
            </h1>
            <p className="muted" style={{ marginTop: 0 }}>
              For MSME owners: harden a contract, invite the other party, keep a
              tamper-proof record, and settle disputes before court.
            </p>

            <div style={{ marginTop: 12 }}>
              <div className="field">
                <label>Email</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="you@atelier.tn"
                  autoComplete="email"
                  disabled={busy}
                />
              </div>

              {mode === "register" && (
                <div className="field">
                  <label>Your name</label>
                  <input
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ines Trabelsi"
                    autoComplete="name"
                    disabled={busy}
                  />
                </div>
              )}

              <div className="field">
                <label>Password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder={mode === "register" ? "at least 8 characters" : "••••••••"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  disabled={busy}
                />
              </div>

              <button className="btn btn-primary btn-block" onClick={submit} disabled={busy || !email.trim() || !password}>
                {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
              </button>

              <p style={{ fontSize: 13, margin: "10px 0 0" }}>
                {mode === "login" ? (
                  <>
                    No account yet?{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setMode("register"); setError(""); }}>
                      Register
                    </a>
                  </>
                ) : (
                  <>
                    Already registered?{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(""); }}>
                      Sign in
                    </a>
                  </>
                )}
              </p>
            </div>

            <div style={{ margin: "16px 0", borderTop: "1px solid var(--border)" }} />

            <button className="btn btn-warm btn-block" disabled={busy} onClick={withDemo}>
              Continue with the demo account
            </button>

            <p style={{ margin: "12px 0 0" }}>
              Already invited by a party?{" "}
              <a href="/invite">Open your invitation</a>.
            </p>

            {error && <div className="banner banner-danger" style={{ marginTop: 10 }}>{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}