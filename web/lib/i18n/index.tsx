"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { messages, type Lang, type MsgKey } from "./messages";

export type { Lang, MsgKey };

const STORAGE_KEY = "insaf-lang";
const COOKIE_NAME = "insaf_lang";

export function isLang(v: string | null | undefined): v is Lang {
  return v === "fr" || v === "ar";
}

function readStored(): Lang {
  if (typeof window === "undefined") return "fr";
  try {
    const fromCookie = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(COOKIE_NAME + "="));
    if (fromCookie) {
      const v = decodeURIComponent(fromCookie.slice(COOKIE_NAME.length + 1));
      if (isLang(v)) return v;
    }
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (isLang(fromStorage)) return fromStorage;
  } catch {
    /* cookie/localStorage unavailable — default stays fr */
  }
  return "fr";
}

// Public name for consumers that want to read the currently persisted
// language without subscribing to the provider (e.g. API request headers).
export const readLang: () => Lang = readStored;

function persist(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private mode */
  }
  try {
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(lang)}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* ignore */
  }
}

export function applyDocumentLang(lang: Lang): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

function lookup(key: MsgKey, lang: Lang): string {
  const entry = messages[key];
  if (!entry) return key;
  return entry[lang] || entry.fr || key;
}

export function translate(key: MsgKey, lang: Lang, vars?: Record<string, string | number>): string {
  let out = lookup(key, lang);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
    }
  }
  return out;
}

interface LocaleContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MsgKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  lang: "fr",
  setLang: () => {},
  t: (key) => lookup(key, "fr")
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStored());

  useEffect(() => {
    applyDocumentLang(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    persist(next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: MsgKey, vars?: Record<string, string | number>) => translate(key, lang, vars),
    [lang]
  );

  return (
    <LocaleContext.Provider value={{ lang, setLang, t }}>{children}</LocaleContext.Provider>
  );
}

export function useI18n(): LocaleContextValue {
  return useContext(LocaleContext);
}