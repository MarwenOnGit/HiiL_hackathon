"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
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
    <button className="btn btn-sm btn-ghost" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
      {dark ? "☀ light" : "🌙 dark"}
    </button>
  );
}