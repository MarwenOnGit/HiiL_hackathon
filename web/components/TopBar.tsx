"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, logout, type Me } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import ThemeToggle from "./ThemeToggle";
import LangToggle from "./LangToggle";

export function InsafMark({ size = 30 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <img src="/logo.png" alt="Insaf" width={size} height={size} />
    </span>
  );
}

export default function TopBar() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    getMe().then(setMe);
  }, []);

  async function onLogout() {
    await logout();
    router.push("/");
    router.refresh();
  }

  const homeHref = me && me.authenticated && me.kind === "msme" ? "/dashboard" : "/";

  return (
    <header className="topbar">
      <Link className="brand" href={homeHref}>
        <InsafMark />
        <span className="brand-text">
          <strong>Insaf</strong>
          <span>{t("topbar.tagline")}</span>
        </span>
      </Link>

      <span className="top-spacer" />

      {me && me.authenticated && me.kind === "msme" && (
        <>
          <span className="top-user">
            <span className="avatar">
              {me.user.avatar ? <img src={me.user.avatar} alt="" /> : me.user.name.charAt(0).toUpperCase()}
            </span>
            <span>
              {me.user.name}
              {me.user.is_demo ? <span className="pill pill-warm" style={{ marginInlineStart: 8 }}>{t("common.demo")}</span> : null}
            </span>
          </span>
          <LangToggle />
          <ThemeToggle />
          <button className="btn btn-sm" onClick={onLogout}>
            {t("topbar.signout")}
          </button>
        </>
      )}
    </header>
  );
}