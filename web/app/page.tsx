"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getMe } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { InsafMark } from "@/components/TopBar";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";

type Mode = "login" | "register";

export default function Landing() {
  const router = useRouter();
  const { t } = useI18n();
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
      setError(String(body.error || t("landing.errSignin")));
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
      setError(String(body.error || t("landing.errDemo")));
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
            <span>{t("topbar.tagline")}</span>
          </span>
        </span>
        <span className="top-spacer" />
        <LangToggle />
        <ThemeToggle />
      </header>

      <div className="login-wrap">
        <div className="login-card">
          <div className="card">
            <h1 style={{ marginTop: 0, fontSize: 22 }}>
              {mode === "login" ? t("landing.titleLogin") : t("landing.titleRegister")}
            </h1>
            <p className="muted" style={{ marginTop: 0 }}>
              {t("landing.intro")}
            </p>

            <div style={{ marginTop: 12 }}>
              <div className="field">
                <label>{t("landing.email")}</label>
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
                  <label>{t("landing.name")}</label>
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
                <label>{t("landing.password")}</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder={mode === "register" ? t("landing.pwReg") : "••••••••"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  disabled={busy}
                />
              </div>

              <button className="btn btn-primary btn-block" onClick={submit} disabled={busy || !email.trim() || !password}>
                {busy ? t("common.working") : mode === "login" ? t("landing.submit") : t("landing.create")}
              </button>

              <p style={{ fontSize: 13, margin: "10px 0 0" }}>
                {mode === "login" ? (
                  <>
                    {t("landing.noAccount")}{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setMode("register"); setError(""); }}>
                      {t("landing.register")}
                    </a>
                  </>
                ) : (
                  <>
                    {t("landing.hasAccount")}{" "}
                    <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(""); }}>
                      {t("landing.signin")}
                    </a>
                  </>
                )}
              </p>
            </div>

            <div style={{ margin: "16px 0", borderTop: "1px solid var(--border)" }} />

            <button className="btn btn-warm btn-block" disabled={busy} onClick={withDemo}>
              {t("landing.demo")}
            </button>

            <p style={{ margin: "12px 0 0" }}>
              {t("landing.invited")}{" "}
              <a href="/invite">{t("landing.openInvite")}</a>.
            </p>

            {error && <div className="banner banner-danger" style={{ marginTop: 10 }}>{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}