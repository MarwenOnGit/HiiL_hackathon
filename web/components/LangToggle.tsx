"use client";

import { useI18n, type Lang } from "@/lib/i18n";

// Shows the language you WOULD switch to: a French user sees "العربية", an
// Arabic user sees "FR". Switching flips the whole app immediately.
export default function LangToggle() {
  const { lang, setLang, t } = useI18n();
  const next: Lang = lang === "fr" ? "ar" : "fr";
  return (
    <button
      className="btn btn-sm btn-ghost"
      onClick={() => setLang(next)}
      title={t("lang.toggleTo")}
      aria-label={t("lang.toggleTo")}
      style={{ minWidth: 44 }}
    >
      {next === "ar" ? "العربية" : "FR"}
    </button>
  );
}