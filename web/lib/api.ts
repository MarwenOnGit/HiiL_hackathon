// Minimal typed client for the backend API. Everything goes through the Next
// rewrite (/api/* -> :4000/api/*), so the browser only ever talks to :3000
// and the session cookie stays same-origin.

export type Me =
  | { authenticated: false }
  | {
      authenticated: true;
      kind: "msme";
      user: { user_id: string; email: string; name: string; avatar: string; is_demo: boolean };
      summary: { contracts_count: number; threads_count: number };
    }
  | {
      authenticated: true;
      kind: "guest";
      guest: { contract_id: string; display_name: string | null };
    };

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  body: T;
}

export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...((options.headers as Record<string, string>) || {})
  };
  try {
    const res = await fetch(path, { credentials: "include", ...options, headers });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body: body as T };
  } catch (err) {
    return { ok: false, status: 0, body: { error: "network error", detail: String(err) } as T };
  }
}

export async function getMe(): Promise<Me> {
  const { ok, body } = await api<Me>("/api/auth/me");
  if (!ok) return { authenticated: false };
  return body;
}

export async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}

export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { dateStyle: "medium" });
}

export function unreadSinceKey(contractId: string): string {
  return `insaf-thread-seen-${contractId}`;
}

export function seenTimestamp(contractId: string): string | null {
  try {
    return localStorage.getItem(unreadSinceKey(contractId));
  } catch {
    return null;
  }
}

export function markSeen(contractId: string, newestSentAt: string | null): void {
  if (!newestSentAt) return;
  try {
    localStorage.setItem(unreadSinceKey(contractId), newestSentAt);
  } catch {
    /* private mode — the badge just stays visible */
  }
}

// Whether a thread is "new" since the owner last opened it. Uses the server
// endpoint when possible; without it, compares the client's seen stamp.
export async function unreadCount(contractId: string, lastSentAt: string | null): Promise<number> {
  if (!lastSentAt) return 0;
  const seen = seenTimestamp(contractId);
  if (seen) {
    const { ok, body } = await api<{ count: number }>(
      `/api/threads/${encodeURIComponent(contractId)}/unread-count?since=${encodeURIComponent(seen)}`
    );
    if (ok) return body.count || 0;
  }
  return seen && seen >= lastSentAt ? 0 : 1;
}