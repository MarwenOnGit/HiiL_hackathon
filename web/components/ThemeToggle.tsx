"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

export default function ThemeToggle() {
  const { t } = useI18n();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    try {
      localStorage.setItem("insaf-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  }

  return (
    <button
      className="btn btn-sm btn-ghost"
      onClick={toggle}
      title={t("theme.toggle")}
      aria-label={t("theme.toggle")}
    >
      {dark ? t("theme.light") : t("theme.dark")}
    </button>
  );
}