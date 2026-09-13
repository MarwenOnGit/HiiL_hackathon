"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe, logout, type Me } from "@/lib/api";
import ThemeToggle from "./ThemeToggle";

export function InsafMark({ size = 30 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="28" height="28" rx="8" fill="#4148A0" />
        <path d="M8 16c3 3 6-3 8 0s6-3 8 0" stroke="#FFF" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="16" cy="22.5" r="1.6" fill="#E0954A" />
      </svg>
    </span>
  );
}

export default function TopBar() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

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
          <span>إنصاف · commercial justice for MSMEs</span>
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
              {me.user.is_demo ? <span className="pill pill-warm" style={{ marginLeft: 8 }}>demo</span> : null}
            </span>
          </span>
          <ThemeToggle />
          <button className="btn btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </>
      )}
    </header>
  );
}