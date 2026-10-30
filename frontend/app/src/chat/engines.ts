// The two ways to answer: the hosted model (the site streams Groq's free models) and Gemma 4 in
// this browser. Both get the same instructions and facts from /api/chat/context, and both end a
// reply with <gap/> and a <followups> block, which TagFilter keeps out of the visible text.
import type { FromWorker, ToWorker } from "./gemma.worker.ts";

export type Mode = "hosted" | "private";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Reply {
  followUps: string[];
  gap: boolean;
  model: string;
}

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const FOLLOW_UPS = "<followups>";
const GAP = "<gap/>";
const TAGS = [GAP, FOLLOW_UPS];

/** Streams text through but stops at the first marker, never showing part of one. */
export class TagFilter {
  private held = "";
  private done = false;

  push(text: string): string {
    if (this.done) return "";
    const s = this.held + text;
    const hits = TAGS.map((t) => s.indexOf(t)).filter((i) => i >= 0);
    if (hits.length) {
      this.done = true;
      this.held = "";
      return s.slice(0, Math.min(...hits)).trimEnd();
    }
    let cut = s.length;
    for (let n = Math.min(Math.max(...TAGS.map((t) => t.length)) - 1, s.length); n > 0; n--) {
      if (TAGS.some((t) => t.startsWith(s.slice(-n)))) {
        cut = s.length - n;
        break;
      }
    }
    while (cut > 0 && /\s/.test(s[cut - 1])) cut--;
    this.held = s.slice(cut);
    return s.slice(0, cut);
  }

  flush(): string {
    const rest = this.done ? "" : this.held;
    this.held = "";
    return rest;
  }
}

/** The follow-up questions and the gap flag from a finished reply. */
export function parseTail(text: string): { followUps: string[]; gap: boolean } {
  const gap = text.includes(GAP);
  const at = text.indexOf(FOLLOW_UPS);
  const followUps: string[] = [];
  if (at >= 0) {
    const seen = new Set<string>();
    for (const raw of text.slice(at + FOLLOW_UPS.length).split("</followups>")[0].split("\n")) {
      const q = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["“]|["”]$/g, "").trim();
      if (q && q.length <= 80 && !q.includes(GAP) && !seen.has(q.toLowerCase())) {
        seen.add(q.toLowerCase());
        followUps.push(q);
      }
    }
  }
  return { followUps: followUps.slice(0, 3), gap };
}

export interface ChatContext {
  system: string;
  starters: string[];
  hosted: boolean;
  name: string;
}

export async function loadContext(): Promise<ChatContext> {
  const res = await fetch("/api/chat/context", { credentials: "same-origin" });
  if (!res.ok) throw new Error("The chat could not load");
  return res.json();
}

/** The hosted model, as Server-Sent Events from /api/chat. */
export async function askHosted(messages: ChatMessage[], conversation: string, onText: (t: string) => void, signal: AbortSignal): Promise<Reply> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ messages, conversation }),
    credentials: "same-origin",
    signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.json().catch(() => null);
    throw new EngineError("http", detail?.detail ?? `The chat returned HTTP ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let at: number;
    while ((at = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, at);
      buf = buf.slice(at + 2);
      if (!block.startsWith("data: ")) continue;
      const e = JSON.parse(block.slice(6));
      if (e.type === "delta") onText(e.text);
      else if (e.type === "done") return { followUps: e.followUps ?? [], gap: !!e.gap, model: e.model };
      else if (e.type === "error") throw new EngineError(e.code, e.message);
    }
  }
  throw new EngineError("network", "The answer stopped early");
}

export interface Support {
  ok: boolean;
  reason?: string;
}

/** Whether this browser can run Gemma 4: WebGPU with 16-bit shaders, and enough memory. */
export async function privateSupport(): Promise<Support> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return { ok: false, reason: "This browser has no WebGPU. Use Chrome or Edge on a computer." };
  const adapter = await gpu.requestAdapter().catch(() => null);
  if (!adapter) return { ok: false, reason: "No graphics adapter is available for WebGPU." };
  if (!adapter.features.has("shader-f16")) return { ok: false, reason: "This graphics adapter cannot run 16-bit shaders." };
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory < 8) return { ok: false, reason: "This device has too little memory for a 3 GB model." };
  return { ok: true };
}

export type PrivateState = { status: "idle" } | { status: "loading"; loaded: number; total: number } | { status: "ready" } | { status: "error"; message: string };

/** Gemma 4 in a worker: load once, then answer with the same instructions as the hosted model. */
export class PrivateEngine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { onText: (t: string) => void; resolve: () => void; reject: (e: Error) => void }>();
  state: PrivateState = { status: "idle" };
  onState: (s: PrivateState) => void = () => undefined;

  private set(s: PrivateState) {
    this.state = s;
    this.onState(s);
  }

  load() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./gemma.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "progress") this.set({ status: "loading", loaded: m.loaded, total: m.total });
      else if (m.type === "ready") this.set({ status: "ready" });
      else if (m.type === "error" && m.id === undefined) {
        this.set({ status: "error", message: m.message });
        this.worker?.terminate();
        this.worker = null;
      } else if ("id" in m && m.id !== undefined) {
        const p = this.pending.get(m.id);
        if (!p) return;
        if (m.type === "token") p.onText(m.text);
        else if (m.type === "done") {
          this.pending.delete(m.id);
          p.resolve();
        } else if (m.type === "error") {
          this.pending.delete(m.id);
          p.reject(new EngineError("private", m.message));
        }
      }
    };
    this.set({ status: "loading", loaded: 0, total: 0 });
    this.send({ type: "load" });
  }

  private send(m: ToWorker) {
    this.worker?.postMessage(m);
  }

  async ask(system: string, messages: ChatMessage[], onText: (t: string) => void, signal: AbortSignal): Promise<Reply> {
    if (this.state.status !== "ready") throw new EngineError("private", "The private model is not loaded yet");
    const id = ++this.seq;
    let text = "";
    const done = new Promise<void>((resolve, reject) => {
      this.pending.set(id, {
        onText: (t) => {
          text += t;
          onText(t);
        },
        resolve,
        reject,
      });
    });
    const stop = () => this.send({ type: "stop" });
    signal.addEventListener("abort", stop, { once: true });
    this.send({ type: "generate", id, messages: [{ role: "system", content: system }, ...messages.slice(-8)], maxTokens: 400 });
    try {
      await done;
    } finally {
      signal.removeEventListener("abort", stop);
    }
    return { ...parseTail(text), model: "Gemma 4 E2B (this browser)" };
  }
}
