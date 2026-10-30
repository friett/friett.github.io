// Ask about Fried: a chat grounded in the site's own content.
// - Fast: the site streams Groq's free hosted models. Questions are saved so the owner can see
//   what visitors want to know and what the site does not answer yet.
// - Private: Gemma 4 runs in this browser on WebGPU after a one-time 3.1 GB download; nothing
//   leaves the device.
// The conversation lives in this tab (sessionStorage). Enter sends, Shift+Enter adds a line,
// Escape stops an answer.
import { ArrowUp, Check, Copy, CornerDownRight, Cpu, Download, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Square, SquarePen, TriangleAlert, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/shadcn/bubble";
import { Button } from "@/components/shadcn/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/shadcn/input-group";
import { Kbd } from "@/components/shadcn/kbd";
import { Marker, MarkerContent, MarkerIcon } from "@/components/shadcn/marker";
import { Message, MessageContent, MessageFooter } from "@/components/shadcn/message";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/shadcn/message-scroller";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/shadcn/tooltip";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/utils";
import { askHosted, EngineError, loadContext, PrivateEngine, privateSupport, TagFilter, type ChatContext, type ChatMessage, type Mode, type PrivateState, type Support } from "./engines";

const MAX_CHARS = 2000;
const STORE = "ask:v1";
/** Hosted errors that the private model gets around. */
const HOSTED_DOWN = new Set(["visitor_limit", "site_limit", "rate_limited", "unavailable"]);

interface Turn extends ChatMessage {
  id: string;
  followUps?: string[];
  model?: string;
  error?: { code: string; message: string };
  stopped?: boolean;
}

interface Saved {
  conversation: string;
  mode: Mode;
  turns: Turn[];
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function restore(): Saved {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // Private windows can refuse storage; start fresh.
  }
  return { conversation: newId(), mode: "hosted", turns: [] };
}

function persist(s: Saved) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    // Not saved: the chat still works for this page view.
  }
}

const fmtGB = (bytes: number) => `${(bytes / 1e9).toFixed(bytes < 1e9 ? 2 : 1)} GB`;

function IconAction({ label, children, onClick, className, pressed }: { label: string; children: ReactNode; onClick: () => void; className?: string; pressed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} onClick={onClick} className={cn("text-muted-foreground hover:text-foreground", className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent sideOffset={4}>{label}</TooltipContent>
    </Tooltip>
  );
}

function ModeSwitch({ mode, onChange, hosted }: { mode: Mode; onChange: (m: Mode) => void; hosted: boolean }) {
  const options: { id: Mode; label: string; icon: typeof Zap; hint: string; disabled?: boolean }[] = [
    { id: "hosted", label: "Fast", icon: Zap, hint: hosted ? "A hosted open model. Questions are saved to improve the site." : "The hosted model is not set up", disabled: !hosted },
    { id: "private", label: "Private", icon: ShieldCheck, hint: "Gemma 4 in your browser. Nothing leaves your device." },
  ];
  return (
    <div role="radiogroup" aria-label="Model" className="flex rounded-full bg-sunken p-0.5">
      {options.map((o) => (
        <Tooltip key={o.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              role="radio"
              aria-checked={mode === o.id}
              aria-disabled={o.disabled || undefined}
              onClick={() => !o.disabled && onChange(o.id)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                mode === o.id ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border-hairline)]" : "hover:text-foreground",
                o.disabled && "cursor-default opacity-50 hover:text-muted-foreground",
              )}
            >
              <o.icon className={cn("size-3.5", mode === o.id && "text-brand")} aria-hidden />
              {o.label}
            </button>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>{o.hint}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function PrivatePanel({ state, support, onLoad, onUseFast, hosted }: { state: PrivateState; support: Support | null; onLoad: () => void; onUseFast: () => void; hosted: boolean }) {
  const pct = state.status === "loading" && state.total ? Math.min(100, Math.round((state.loaded / state.total) * 100)) : 0;
  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Cpu className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-semibold text-foreground">Run Gemma 4 on your device</h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">A one-time download of 3.1 GB. Your browser keeps it for next time, and your questions never leave this device.</p>
        </div>
      </div>
      {support && !support.ok ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <TriangleAlert className="size-4 text-e-projects" aria-hidden />
            {support.reason}
          </span>
          {hosted && (
            <Button size="sm" variant="outline" onClick={onUseFast}>
              <Zap data-icon="inline-start" />
              Use Fast instead
            </Button>
          )}
        </div>
      ) : state.status === "loading" ? (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span className="shimmer">{state.total ? "Downloading the model" : "Starting"}</span>
            <span>{state.total ? `${fmtGB(state.loaded)} of ${fmtGB(state.total)}` : ""}</span>
          </div>
        </div>
      ) : state.status === "error" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-destructive">{state.message}</span>
          <Button size="sm" variant="outline" onClick={onLoad}>
            <RefreshCw data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={onLoad} disabled={!support}>
            <Download data-icon="inline-start" />
            Download and start
          </Button>
          {hosted && (
            <Button variant="ghost" onClick={onUseFast}>
              Use Fast instead
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        // Clipboard refused: nothing to undo.
      }
    },
  };
}

function Answer({ turn, live, last, onFollowUp, onRetry, onSwitch }: { turn: Turn; live: boolean; last: boolean; onFollowUp: (q: string) => void; onRetry?: () => void; onSwitch?: () => void }) {
  const { copied, copy } = useCopy(turn.content);
  return (
    <Message className="flex-col gap-2">
      <MessageContent className="gap-2">
        {live && !turn.content && (
          <Marker role="status" className="min-h-6 text-sm">
            <MarkerIcon>
              <LoaderCircle className="animate-spin" />
            </MarkerIcon>
            <MarkerContent className="shimmer">Thinking</MarkerContent>
          </Marker>
        )}
        {turn.content && (
          <Bubble variant="ghost" className="w-full">
            <BubbleContent className={cn("chat-answer w-full text-[15px] leading-[1.65]", live && "streaming")}>
              <Markdown source={turn.content} />
            </BubbleContent>
          </Bubble>
        )}
        {turn.error && (
          <Bubble variant="destructive" className="max-w-full">
            <BubbleContent role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl">
              <span className="flex items-center gap-2">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                {turn.error.message}
              </span>
              {onSwitch && (
                <Button size="sm" variant="outline" onClick={onSwitch}>
                  <ShieldCheck data-icon="inline-start" />
                  Try the private model
                </Button>
              )}
              {onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  <RefreshCw data-icon="inline-start" />
                  Retry
                </Button>
              )}
            </BubbleContent>
          </Bubble>
        )}
      </MessageContent>
      {!live && turn.content && (
        <MessageFooter className={cn("-ml-1.5 flex items-center gap-0.5 px-0", !last && "opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 pointer-coarse:opacity-100")}>
          {turn.stopped && <span className="mr-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Stopped</span>}
          <IconAction label={copied ? "Copied" : "Copy answer"} onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
          </IconAction>
          {last && onRetry && (
            <IconAction label="Ask again" onClick={onRetry}>
              <RefreshCw />
            </IconAction>
          )}
          {turn.model && <span className="ml-1 truncate text-xs text-subtle">{turn.model}</span>}
        </MessageFooter>
      )}
      {last && !live && turn.followUps && turn.followUps.length > 0 && (
        <ul className="m-0 mt-1 flex list-none flex-col p-0" aria-label="Follow-up questions">
          {turn.followUps.map((q) => (
            <li key={q} className="border-t border-border first:border-t-0">
              <button
                type="button"
                className="group/fu flex w-full items-center gap-2.5 rounded-lg px-1 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                onClick={() => onFollowUp(q)}
              >
                <CornerDownRight className="size-4 shrink-0 text-subtle group-hover/fu:text-brand" aria-hidden />
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Message>
  );
}

function Question({ text }: { text: string }) {
  return (
    <Message align="end" className="items-end data-[align=end]:flex-col">
      <Bubble variant="muted" align="end" className="max-w-[85%] md:max-w-[75%]">
        <BubbleContent className="rounded-3xl px-4 py-2.5 text-[15px] whitespace-pre-wrap text-foreground">{text}</BubbleContent>
      </Bubble>
    </Message>
  );
}

export function Chat({ initialQuestion }: { initialQuestion: string }) {
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [ctxError, setCtxError] = useState(false);
  const [saved, setSaved] = useState<Saved>(restore);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [support, setSupport] = useState<Support | null>(null);
  const engine = useMemo(() => new PrivateEngine(), []);
  const [privateState, setPrivateState] = useState<PrivateState>(engine.state);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(false);
  const { conversation, mode, turns } = saved;

  useEffect(() => {
    engine.onState = setPrivateState;
  }, [engine]);
  useEffect(() => persist(saved), [saved]);
  useEffect(() => {
    void privateSupport().then(setSupport);
    loadContext()
      .then((c) => {
        setCtx(c);
        if (!c.hosted) setSaved((s) => ({ ...s, mode: "private" }));
      })
      .catch(() => setCtxError(true));
  }, []);
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, [ctx]);

  const update = (id: string, patch: Partial<Turn>) => setSaved((s) => ({ ...s, turns: s.turns.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const append = (id: string, text: string) => setSaved((s) => ({ ...s, turns: s.turns.map((t) => (t.id === id ? { ...t, content: t.content + text } : t)) }));

  const send = useCallback(
    async (raw: string, history?: Turn[]) => {
      const text = raw.trim().slice(0, MAX_CHARS);
      if (!text || busy || !ctx) return;
      if (mode === "private" && engine.state.status !== "ready") return;
      const base = history ?? turns;
      const q: Turn = { id: newId(), role: "user", content: text };
      const a: Turn = { id: newId(), role: "assistant", content: "" };
      const messages: ChatMessage[] = [...base.filter((t) => !t.error && t.content).map(({ role, content }) => ({ role, content })), { role: "user", content: text }];
      setSaved((s) => ({ ...s, turns: [...base, q, a] }));
      setDraft("");
      setBusy(true);
      setLiveId(a.id);
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        let reply;
        if (mode === "hosted") {
          reply = await askHosted(messages, conversation, (t) => append(a.id, t), ac.signal);
        } else {
          const filter = new TagFilter();
          reply = await engine.ask(ctx.system, messages, (t) => {
            const shown = filter.push(t);
            if (shown) append(a.id, shown);
          }, ac.signal);
          const tail = filter.flush();
          if (tail) append(a.id, tail);
        }
        update(a.id, { followUps: reply.followUps, model: mode === "hosted" ? `Fast · ${reply.model.split("/").pop()}` : "Private · Gemma 4 in your browser", stopped: ac.signal.aborted });
      } catch (err) {
        if (ac.signal.aborted) update(a.id, { stopped: true });
        else {
          const e = err instanceof EngineError ? err : new EngineError("network", "The answer could not load");
          update(a.id, { error: { code: e.code, message: e.message } });
        }
      } finally {
        setBusy(false);
        setLiveId(null);
        abortRef.current = null;
      }
    },
    [busy, ctx, mode, engine, turns, conversation],
  );

  // A question in the link (/ask?q=…) is asked once the chat is ready.
  useEffect(() => {
    if (asked.current || !ctx || !initialQuestion) return;
    if (mode === "hosted" && ctx.hosted) {
      asked.current = true;
      void send(initialQuestion);
    } else {
      asked.current = true;
      setDraft(initialQuestion);
    }
  }, [ctx, initialQuestion, mode, send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busy) abortRef.current?.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  const retry = () => {
    const lastQ = [...turns].reverse().find((t) => t.role === "user");
    if (!lastQ) return;
    const at = turns.indexOf(lastQ);
    void send(lastQ.content, turns.slice(0, at));
  };
  const newChat = () => {
    abortRef.current?.abort();
    setSaved((s) => ({ conversation: newId(), mode: s.mode, turns: [] }));
    setDraft("");
    inputRef.current?.focus();
  };
  const setMode = (m: Mode) => setSaved((s) => ({ ...s, mode: m }));

  const needsModel = mode === "private" && privateState.status !== "ready";
  const ready = !!ctx && !needsModel;
  const canSend = ready && !busy && !!draft.trim();
  const empty = turns.length === 0;
  const name = ctx?.name.split(" ")[0] ?? "Fried";

  const composer = (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) void send(draft);
      }}
    >
      <InputGroup className="h-auto flex-col rounded-3xl border-border bg-card has-[[data-slot=input-group-control]:focus-visible]:border-input has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-card">
        <InputGroupTextarea
          ref={inputRef}
          rows={1}
          aria-label="Ask a question"
          placeholder={needsModel ? "Load the private model first" : empty ? `Ask about ${name}'s work, projects, tools…` : "Ask a follow-up"}
          value={draft}
          maxLength={MAX_CHARS}
          disabled={!ready}
          enterKeyHint="send"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) void send(draft);
            } else if (e.key === "Escape" && busy) {
              e.preventDefault();
              abortRef.current?.abort();
            }
          }}
          className="max-h-52 min-h-12 px-4 pt-3.5 pb-1 text-base leading-6 md:text-[15px]"
        />
        <InputGroupAddon align="block-end" className="gap-2 px-3 pb-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-subtle">
            {mode === "hosted" ? <Zap className="size-3.5 shrink-0" aria-hidden /> : <ShieldCheck className="size-3.5 shrink-0 text-brand" aria-hidden />}
            <span className="truncate">{mode === "hosted" ? "Questions are saved to improve this site" : "Runs on your device. Nothing is sent."}</span>
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              {busy ? (
                <InputGroupButton type="button" size="icon-sm" variant="default" aria-label="Stop" className="ml-auto rounded-full" onClick={() => abortRef.current?.abort()}>
                  <Square className="size-3 fill-current" />
                </InputGroupButton>
              ) : (
                <InputGroupButton type="submit" size="icon-sm" variant="default" aria-label="Send" aria-disabled={!canSend} className="ml-auto rounded-full aria-disabled:cursor-default aria-disabled:opacity-40" onClick={(e) => !canSend && e.preventDefault()}>
                  <ArrowUp />
                </InputGroupButton>
              )}
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>
              {busy ? (
                <>
                  Stop <Kbd>Esc</Kbd>
                </>
              ) : draft.trim() ? (
                <>
                  Send <Kbd>⏎</Kbd>
                </>
              ) : (
                "Type a question first"
              )}
            </TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );

  const lastAnswer = [...turns].reverse().find((t) => t.role === "assistant");
  let body: ReactNode;
  if (ctxError) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-sm text-muted-foreground">
        The chat could not load.
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCw data-icon="inline-start" />
          Reload
        </Button>
      </div>
    );
  } else if (empty) {
    body = (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 pb-3 md:justify-center md:gap-6 md:pb-[10vh]">
          <div className="my-auto flex flex-col items-center gap-2 text-center md:my-0">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <h2 className="m-0 text-[26px] leading-tight font-medium tracking-tight text-foreground md:text-[28px]">Ask me about {name}</h2>
          </div>
          {needsModel ? (
            <PrivatePanel state={privateState} support={support} hosted={!!ctx?.hosted} onLoad={() => engine.load()} onUseFast={() => setMode("hosted")} />
          ) : (
            <>
              {ctx && (
                <div role="list" aria-label="Suggested questions" className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:order-3 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
                  {ctx.starters.map((s) => (
                    <button
                      key={s}
                      role="listitem"
                      type="button"
                      onClick={() => void send(s)}
                      className="flex w-[220px] shrink-0 snap-start items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:w-auto md:py-2.5"
                    >
                      <CornerDownRight className="size-4 shrink-0 text-brand" aria-hidden />
                      <span className="line-clamp-2">{s}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="md:order-2">{composer}</div>
            </>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <MessageScrollerProvider key={conversation} autoScroll defaultScrollPosition="last-anchor" scrollPreviousItemPeek={48}>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent role="log" aria-label="Conversation" aria-busy={busy || undefined} className="mx-auto w-full max-w-3xl gap-6 px-4 pt-2 pb-10 md:px-6">
                {turns.map((t) => (
                  <MessageScrollerItem key={t.id} messageId={t.id} scrollAnchor={t.role === "user"}>
                    {t.role === "user" ? (
                      <Question text={t.content} />
                    ) : (
                      <Answer
                        turn={t}
                        live={t.id === liveId}
                        last={t === lastAnswer}
                        onFollowUp={(q) => void send(q)}
                        onRetry={t === lastAnswer && !busy ? retry : undefined}
                        onSwitch={t.error && HOSTED_DOWN.has(t.error.code) && support?.ok ? () => setMode("private") : undefined}
                      />
                    )}
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton variant="outline" size="icon-sm" className="bottom-3 rounded-full bg-card shadow-floating" />
          </MessageScroller>
        </MessageScrollerProvider>
        <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 md:px-6 md:pb-5">
          {needsModel ? <PrivatePanel state={privateState} support={support} hosted={!!ctx?.hosted} onLoad={() => engine.load()} onUseFast={() => setMode("hosted")} /> : composer}
        </div>
      </>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="app-root flex h-full min-h-0 flex-col bg-card text-foreground">
        <header className="flex min-h-14 shrink-0 items-center gap-2 px-3 md:px-5">
          <h1 className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold">Ask AI</h1>
          {ctx && <ModeSwitch mode={mode} onChange={setMode} hosted={ctx.hosted} />}
          <IconAction label="New chat" onClick={newChat}>
            <SquarePen />
          </IconAction>
        </header>
        {body}
      </div>
    </TooltipProvider>
  );
}
