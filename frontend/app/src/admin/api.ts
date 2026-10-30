// The admin API (app/routers/admin.py). Same origin, session cookie; the browser adds the
// Origin header the server checks on changes.

export type Kind = "profile" | "role" | "project" | "skill" | "tool";
export type Data = Record<string, unknown>;

export interface Entry {
  id: number;
  kind: Kind;
  slug: string;
  data: Data;
  position: number;
  visible: boolean;
  source: string;
  updated_at: string;
}

export type DraftStatus = "pending" | "applied" | "dismissed";

export interface Draft {
  id: number;
  kind: Kind;
  slug: string;
  action: "create" | "update" | "hide";
  data: Data;
  reason: string;
  source: string;
  status: DraftStatus;
  created_at: string;
  decided_at: string | null;
}

export interface Count {
  name: string;
  count: number;
}

export interface Turn {
  id: number;
  question: string;
  answer: string;
  unanswered: boolean;
  model: string;
  createdAt: string;
}

export interface Stats {
  visits: {
    days: number;
    views: number;
    visitors: number;
    series: { day: string; views: number; visitors: number }[];
    pages: Count[];
    referrers: Count[];
    devices: Count[];
  };
  chat: {
    questions: number;
    conversations: number;
    unanswered: number;
    latest: Turn[];
    gaps: Turn[];
  };
}

export interface Token {
  id: number;
  name: string;
  createdAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function detailOf(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) {
      const first = detail[0] as { loc?: unknown[]; msg: string };
      const where = (first.loc ?? []).filter((p) => p !== "body").join(".");
      return where ? `${where}: ${first.msg}` : first.msg;
    }
  }
  if (status >= 500) return "The server had a problem. Try again.";
  return `Request failed (HTTP ${status})`;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, init);
  } catch {
    throw new ApiError(0, "No connection to the site. Check your network and try again.");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/login") && !path.startsWith("/register")) {
      onUnauthorized();
    }
    throw new ApiError(res.status, detailOf(json, res.status));
  }
  return json as T;
}

export const api = {
  state: () => request<{ hasPasskey: boolean; signedIn: boolean }>("GET", "/state"),
  registerOptions: (token: string) => request<unknown>("POST", "/register/options", { token }),
  registerVerify: (credential: unknown) => request<{ ok: true }>("POST", "/register/verify", { credential }),
  loginOptions: () => request<unknown>("POST", "/login/options"),
  loginVerify: (credential: unknown) => request<{ ok: true }>("POST", "/login/verify", { credential }),
  logout: () => request<{ ok: true }>("POST", "/logout"),
  stats: (days: number) => request<Stats>("GET", `/stats?days=${days}`),
  entries: (kind?: Kind) => request<Entry[]>("GET", kind ? `/entries?kind=${kind}` : "/entries"),
  createEntry: (kind: Kind, data: Data) => request<Entry>("POST", "/entries", { kind, data }),
  saveEntry: (id: number, kind: Kind, data: Data) => request<Entry>("PUT", `/entries/${id}`, { kind, data }),
  patchEntry: (id: number, patch: { visible?: boolean; position?: number }) =>
    request<Entry>("PATCH", `/entries/${id}`, patch),
  deleteEntry: (id: number) => request<{ ok: true }>("DELETE", `/entries/${id}`),
  drafts: (status: DraftStatus) => request<Draft[]>("GET", `/drafts?status=${status}`),
  applyDraft: (id: number, data?: Data) => request<Draft>("POST", `/drafts/${id}/apply`, data ? { data } : {}),
  dismissDraft: (id: number) => request<Draft>("POST", `/drafts/${id}/dismiss`),
  suggest: () => request<{ drafts: Draft[]; skipped: number; gaps: string[] }>("POST", "/suggest"),
  linkedin: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ files: string[]; drafts: Draft[] }>("POST", "/linkedin", form);
  },
  tokens: () => request<Token[]>("GET", "/tokens"),
  createToken: (name: string) => request<{ id: number; name: string; token: string }>("POST", "/tokens", { name }),
  deleteToken: (id: number) => request<{ ok: true }>("DELETE", `/tokens/${id}`),
};

export function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
