// Proposed changes from AI, the LinkedIn import and agents, grouped by source, each with a
// before/after view of the fields that change. Apply, edit then apply, or dismiss.
import { Bot, Check, CircleHelp, ExternalLink, Inbox, Pencil, RefreshCw, Sparkles, Upload, User, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";
import { api, message, type Data, type Draft, type DraftStatus, type Entry, type Kind } from "./api.ts";
import { sourceLabel } from "./Content.tsx";
import { EntryForm } from "./EntryForm.tsx";
import { LinkedInIcon } from "./icons.tsx";
import { replace } from "./route.ts";
import { KIND, show, titleOf, type Field } from "./schema.ts";
import { ActionButton, Blank, Card, CardHead, Loading, Notice, Pill, SectionHeader, Segmented, When, useToast } from "./ui.tsx";

const STATUSES: DraftStatus[] = ["pending", "applied", "dismissed"];
const SOURCE_ORDER = ["ai", "linkedin", "agent", "admin"];
const LINKEDIN_EXPORT = "https://www.linkedin.com/mypreferences/d/download-my-data";

function SourceIcon({ source, className = "size-4" }: { source: string; className?: string }) {
  if (source === "ai") return <Sparkles className={className} aria-hidden />;
  if (source === "linkedin") return <LinkedInIcon className={className} />;
  if (source === "agent") return <Bot className={className} aria-hidden />;
  return <User className={className} aria-hidden />;
}

const ACTION_LABEL = { create: "New", update: "Update", hide: "Hide" } as const;

export function Drafts({ parts, onPendingChange }: { parts: string[]; onPendingChange: (n: number) => void }) {
  const status: DraftStatus = (STATUSES as string[]).includes(parts[0]) ? (parts[0] as DraftStatus) : "pending";
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [aiResult, setAiResult] = useState<{ made: number; skipped: number; gaps: string[] } | null>(null);
  const [aiError, setAiError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ files: string[]; made: number } | null>(null);
  const [importError, setImportError] = useState("");
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [list, all] = await Promise.all([api.drafts(status), api.entries()]);
      setDrafts(list);
      setEntries(all);
      if (status === "pending") onPendingChange(list.length);
    } catch (e) {
      setError(message(e));
    }
  }, [status, onPendingChange]);

  useEffect(() => {
    setDrafts(null);
    void load();
  }, [load]);

  const current = useMemo(() => {
    const map = new Map<string, Entry>();
    for (const e of entries) map.set(`${e.kind}:${e.slug}`, e);
    return map;
  }, [entries]);

  const groups = useMemo(() => {
    const by = new Map<string, Draft[]>();
    for (const d of drafts ?? []) by.set(d.source, [...(by.get(d.source) ?? []), d]);
    return [...by.entries()].sort(([a], [b]) => rank(a) - rank(b));
  }, [drafts]);

  function done(draft: Draft, verb: string) {
    setDrafts((list) => {
      const next = (list ?? []).filter((d) => d.id !== draft.id);
      onPendingChange(next.length);
      return next;
    });
    toast(`${verb} “${titleOf(draft.kind, draft.data, draft.slug)}”`);
  }

  async function apply(draft: Draft, data?: Data) {
    await api.applyDraft(draft.id, data);
    done(draft, "Applied");
    api.entries().then(setEntries, () => {});
  }

  async function dismiss(draft: Draft) {
    try {
      await api.dismissDraft(draft.id);
      done(draft, "Dismissed");
    } catch (e) {
      toast(message(e), "error");
    }
  }

  async function suggest() {
    setSuggesting(true);
    setAiError("");
    setAiResult(null);
    try {
      const res = await api.suggest();
      setAiResult({ made: res.drafts.length, skipped: res.skipped, gaps: res.gaps });
      setFresh(new Set(res.drafts.map((d) => d.id)));
      if (status !== "pending") replace("drafts");
      else await load();
    } catch (e) {
      setAiError(message(e));
    } finally {
      setSuggesting(false);
    }
  }

  async function upload(file: File) {
    setImporting(true);
    setImportError("");
    setImportResult(null);
    setImportOpen(false);
    try {
      const res = await api.linkedin(file);
      setImportResult({ files: res.files, made: res.drafts.length });
      setFresh(new Set(res.drafts.map((d) => d.id)));
      if (status !== "pending") replace("drafts");
      else await load();
    } catch (e) {
      setImportError(message(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const pickFile = () => fileRef.current?.click();

  const importButton = (
    <Popover open={importOpen} onOpenChange={setImportOpen}>
      <PopoverTrigger asChild>
        <ActionButton variant="outline" busy={importing} icon={<LinkedInIcon className="size-4" />}>
          Import LinkedIn
        </ActionButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="app-root w-72 gap-2 p-2">
        <a
          href={LINKEDIN_EXPORT}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2.5 rounded-md p-2 text-foreground no-underline outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">1</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">Get a copy of your data</span>
            <span className="text-xs text-muted-foreground">LinkedIn emails a ZIP, usually within minutes</span>
          </span>
          <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
        </a>
        <button
          type="button"
          onClick={pickFile}
          className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">2</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">Choose the ZIP</span>
            <span className="text-xs text-muted-foreground">Or Positions, Skills, Projects or Profile CSV</span>
          </span>
          <Upload className="mt-0.5 size-3.5 shrink-0 text-subtle" aria-hidden />
        </button>
      </PopoverContent>
    </Popover>
  );

  const suggestButton = (
    <ActionButton variant="outline" busy={suggesting} onClick={suggest} icon={<Sparkles data-icon="inline-start" />}>
      {suggesting ? "Reviewing…" : "Ask AI"}
    </ActionButton>
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Drafts"
        actions={
          <>
            {suggestButton}
            {importButton}
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.csv,application/zip,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <Segmented
        label="Draft status"
        value={status}
        onChange={(s) => replace("drafts", ...(s === "pending" ? [] : [s]))}
        options={STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
        className="self-start"
      />

      {aiError && (
        <Notice
          onClose={() => setAiError("")}
          action={
            <Button variant="outline" size="sm" onClick={suggest}>
              Retry
            </Button>
          }
        >
          {aiError}
        </Notice>
      )}
      {aiResult && (
        <Card>
          <CardHead
            title={
              aiResult.made
                ? `AI proposed ${aiResult.made} ${aiResult.made === 1 ? "change" : "changes"}`
                : "AI found nothing to change"
            }
            icon={<Sparkles />}
            actions={
              <>
                {aiResult.skipped > 0 && <span className="text-xs text-subtle">{aiResult.skipped} invalid skipped</span>}
                <CloseButton onClick={() => setAiResult(null)} />
              </>
            }
          />
          {aiResult.gaps.length > 0 ? (
            <div className="flex flex-col gap-2 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">Missing facts only you can add</span>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {aiResult.gaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CircleHelp className="mt-0.5 size-4 shrink-0 text-e-projects" aria-hidden />
                    <span className="min-w-0 flex-1">{g}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" size="sm" asChild className="self-start">
                <a href="#content/profile">
                  <Pencil data-icon="inline-start" />
                  Edit content
                </a>
              </Button>
            </div>
          ) : (
            <p className="m-0 px-4 py-3 text-sm text-muted-foreground">No missing facts.</p>
          )}
        </Card>
      )}

      {importError && (
        <Notice
          onClose={() => setImportError("")}
          action={
            <Button variant="outline" size="sm" onClick={pickFile}>
              Choose another file
            </Button>
          }
        >
          {importError}
        </Notice>
      )}
      {importResult && (
        <Notice tone="success" onClose={() => setImportResult(null)}>
          Read {importResult.files.map(prettyFile).join(", ")}.{" "}
          {importResult.made
            ? `${importResult.made} new ${importResult.made === 1 ? "draft" : "drafts"} below.`
            : "Everything already matches the site."}
        </Notice>
      )}

      {error && (
        <Notice
          action={
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw data-icon="inline-start" />
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      )}

      {!drafts ? (
        !error && <Loading />
      ) : drafts.length === 0 ? (
        <Card>
          <Blank
            icon={<Inbox />}
            title={status === "pending" ? "No pending drafts." : `No ${status} drafts.`}
            action={
              status === "pending" ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestButton}
                  <ActionButton variant="outline" busy={importing} onClick={pickFile} icon={<LinkedInIcon className="size-4" />}>
                    Import LinkedIn ZIP
                  </ActionButton>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => replace("drafts")}>
                  Show pending
                </Button>
              )
            }
          />
        </Card>
      ) : (
        groups.map(([source, list]) => (
          <Card key={source}>
            <CardHead
              title={sourceLabel(source)}
              icon={<SourceIcon source={source} />}
              actions={<span className="text-xs text-subtle tabular-nums">{list.length}</span>}
            />
            <ul className="m-0 list-none p-0">
              {list.map((d) => (
                <DraftItem
                  key={d.id}
                  draft={d}
                  current={current.get(`${d.kind}:${d.slug}`)}
                  fresh={fresh.has(d.id)}
                  onApply={(data) => apply(d, data)}
                  onDismiss={() => dismiss(d)}
                />
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

function rank(source: string) {
  const i = SOURCE_ORDER.indexOf(source);
  return i < 0 ? SOURCE_ORDER.length : i;
}

function prettyFile(name: string) {
  return name.replace(/\.csv$/, "").replace(/^./, (c) => c.toUpperCase());
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={onClick} className="text-muted-foreground">
      <X />
    </Button>
  );
}

function DraftItem({
  draft,
  current,
  fresh,
  onApply,
  onDismiss,
}: {
  draft: Draft;
  current: Entry | undefined;
  fresh: boolean;
  onApply: (data?: Data) => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"" | "apply" | "dismiss">("");
  const info = KIND[draft.kind];
  const pending = draft.status === "pending";
  const changes = useMemo(() => diff(draft, current), [draft, current]);

  async function run(which: "apply" | "dismiss") {
    setBusy(which);
    try {
      if (which === "apply") await onApply();
      else await onDismiss();
    } catch (e) {
      toast(message(e), "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <li className={cn("flex flex-col gap-3 border-b border-border px-4 py-3.5 last:border-b-0", fresh && "bg-brand-soft/40")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Pill>{info.label}</Pill>
        <Pill tone={draft.action === "create" ? "brand" : "muted"}>{ACTION_LABEL[draft.action]}</Pill>
        <span className="min-w-0 flex-1 basis-40 font-medium break-words">{titleOf(draft.kind, current?.data ?? draft.data, draft.slug) || draft.slug}</span>
        {fresh && <Pill tone="brand">New</Pill>}
        <When iso={draft.decided_at ?? draft.created_at} className="text-xs" />
      </div>
      {draft.reason && <p className="m-0 text-sm text-muted-foreground">{draft.reason}</p>}

      {editing ? (
        <div className="rounded-lg border border-border bg-sunken p-3">
          <EntryForm
            idPrefix={`draft-${draft.id}`}
            kind={draft.kind}
            data={draft.data}
            submitLabel="Apply edited"
            onCancel={() => setEditing(false)}
            onSubmit={async (data) => {
              await onApply(data);
            }}
          />
        </div>
      ) : (
        <Changes kind={draft.kind} changes={changes} create={draft.action === "create" || !current} />
      )}

      {pending && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton size="sm" busy={busy === "apply"} disabled={!!busy} onClick={() => run("apply")} icon={<Check data-icon="inline-start" />}>
            Apply
          </ActionButton>
          {draft.action !== "hide" && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setEditing(true)}>
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          )}
          <ActionButton size="sm" variant="ghost" busy={busy === "dismiss"} disabled={!!busy} onClick={() => run("dismiss")} icon={<X data-icon="inline-start" />}>
            Dismiss
          </ActionButton>
        </div>
      )}
    </li>
  );
}

interface Change {
  field: Field | undefined;
  name: string;
  before: unknown;
  after: unknown;
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function diff(draft: Draft, current: Entry | undefined): Change[] {
  const fields = KIND[draft.kind].fields;
  if (draft.action === "hide") {
    return [{ field: { name: "visible", label: "On the site", type: "bool" }, name: "visible", before: current?.visible ?? true, after: false }];
  }
  const before = current?.data ?? {};
  const names = [...fields.map((f) => f.name), ...Object.keys(draft.data).filter((k) => !fields.some((f) => f.name === k))];
  return names
    .filter((n) => !same(before[n], draft.data[n]))
    .filter((n) => !(current == null && (draft.data[n] == null || draft.data[n] === "" || (Array.isArray(draft.data[n]) && !(draft.data[n] as unknown[]).length))))
    .map((n) => ({ field: fields.find((f) => f.name === n), name: n, before: before[n], after: draft.data[n] }));
}

function Changes({ kind, changes, create }: { kind: Kind; changes: Change[]; create: boolean }) {
  if (changes.length === 0) return <p className="m-0 text-sm text-muted-foreground">No visible change.</p>;
  if (create)
    return (
      <dl className="m-0 overflow-hidden rounded-lg border border-border">
        {changes.map((c) => (
          <div key={c.name} className="grid border-b border-border last:border-b-0 md:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="px-3 pt-2 text-xs font-medium text-muted-foreground md:py-2">{c.field?.label ?? c.name}</dt>
            <dd className="m-0 min-w-0 px-3 pt-0.5 pb-2 text-sm break-words whitespace-pre-line md:border-l md:border-border md:py-2">
              {Array.isArray(c.after) ? (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {(c.after as unknown[]).map((x, i) => (
                    <li key={i}>{String(x)}</li>
                  ))}
                </ul>
              ) : (
                show(c.field, c.after) || "—"
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="hidden grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-border bg-sunken text-xs font-medium text-muted-foreground md:grid">
        <span className="px-3 py-1.5">Field</span>
        <span className="border-l border-border px-3 py-1.5">Before</span>
        <span className="border-l border-border px-3 py-1.5">After</span>
      </div>
      {changes.map((c) => (
        <div key={c.name} className="grid border-b border-border last:border-b-0 md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)]">
          <span className="bg-sunken px-3 py-1.5 text-xs font-medium text-muted-foreground md:bg-transparent md:py-2">{c.field?.label ?? c.name}</span>
          {Array.isArray(c.before) || Array.isArray(c.after) ? (
            <ListChange kind={kind} before={(c.before as unknown[]) ?? []} after={(c.after as unknown[]) ?? []} />
          ) : (
            <>
              <Value label="Before" value={show(c.field, c.before)} old />
              <Value label="After" value={show(c.field, c.after)} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Value({ label, value, old }: { label: string; value: string; old?: boolean }) {
  return (
    <div className="flex min-w-0 gap-2 px-3 py-1.5 md:border-l md:border-border md:py-2">
      <span className="w-11 shrink-0 text-xs text-subtle md:hidden">{label}</span>
      <span className={cn("min-w-0 flex-1 text-sm break-words whitespace-pre-line", old && "text-muted-foreground", !value && "text-subtle")}>
        {value || "—"}
      </span>
    </div>
  );
}

function ListChange({ before, after }: { kind: Kind; before: unknown[]; after: unknown[] }) {
  const b = before.map(String);
  const a = after.map(String);
  const removed = b.filter((x) => !a.includes(x));
  const added = a.filter((x) => !b.includes(x));
  const kept = a.filter((x) => b.includes(x)).length;
  const reordered = !removed.length && !added.length;
  const rows: ReactNode[] = [
    ...removed.map((x) => (
      <li key={`-${x}`} className="flex gap-2 text-muted-foreground line-through decoration-1">
        <span className="w-3 shrink-0 text-subtle no-underline" aria-label="Removed">−</span>
        <span className="min-w-0 break-words">{x}</span>
      </li>
    )),
    ...added.map((x) => (
      <li key={`+${x}`} className="flex gap-2">
        <span className="w-3 shrink-0 font-medium text-e-writing" aria-label="Added">+</span>
        <span className="min-w-0 break-words">{x}</span>
      </li>
    )),
  ];
  return (
    <div className="px-3 py-1.5 md:col-span-2 md:border-l md:border-border md:py-2">
      {reordered ? (
        <span className="text-sm text-muted-foreground">Same items, new order</span>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm">{rows}</ul>
      )}
      {kept > 0 && !reordered && <span className="mt-1 block text-xs text-subtle">{kept} unchanged</span>}
    </div>
  );
}
