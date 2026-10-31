// Site content per kind: a list with visibility, order, inline edit and delete, plus an add
// row where the new item appears. The profile is a single entry edited in place.
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { cn } from "@/lib/utils";
import { api, message, type Data, type Entry, type Kind } from "./api.ts";
import { EntryForm } from "./EntryForm.tsx";
import { go, replace } from "./route.ts";
import { isKind, KIND, KINDS, metaOf, sortEntries, titleOf } from "./schema.ts";
import { Blank, Card, Confirm, IconButton, Loading, Notice, Pill, SectionHeader, Segmented, When, useToast } from "./ui.tsx";

const SITE_PAGE: Record<Kind, string> = { profile: "/#about", role: "/#experience", project: "/projects", skill: "/#skills", tool: "/#tools" };
const EMPTY: Data = {};
// Blog posts live in the portal, not in this admin.
const PORTAL_WRITING = "https://api-421d8344.fastapicloud.dev/writing";

export function Content({ parts, gap, onClearGap }: { parts: string[]; gap: string; onClearGap: () => void }) {
  const kind: Kind = isKind(parts[0]) ? parts[0] : "profile";
  const target = parts[1] ?? "";
  const info = KIND[kind];
  const toast = useToast();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [loadedKind, setLoadedKind] = useState<Kind | null>(null);
  const [removing, setRemoving] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const list = await api.entries(kind);
      setEntries(list);
      setLoadedKind(kind);
    } catch (e) {
      setError(message(e));
    }
  }, [kind]);

  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  const sorted = useMemo(() => (entries && loadedKind === kind ? sortEntries(kind, entries) : null), [entries, kind, loadedKind]);

  const close = () => replace("content", kind);
  const open = (id: number | "new") => (String(id) === target ? close() : replace("content", kind, id));

  const patchLocal = (row: Entry) => setEntries((list) => list?.map((e) => (e.id === row.id ? row : e)) ?? list);

  async function toggle(entry: Entry) {
    patchLocal({ ...entry, visible: !entry.visible });
    try {
      patchLocal(await api.patchEntry(entry.id, { visible: !entry.visible }));
      toast(entry.visible ? `Hidden from the site` : `Shown on the site`);
    } catch (e) {
      patchLocal(entry);
      toast(message(e), "error");
    }
  }

  async function move(index: number, by: -1 | 1) {
    if (!sorted) return;
    const order = [...sorted];
    const j = index + by;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    const changed = order.map((e, i) => ({ e, i })).filter(({ e, i }) => e.position !== i);
    setEntries(order.map((e, i) => ({ ...e, position: i })));
    try {
      await Promise.all(changed.map(({ e, i }) => api.patchEntry(e.id, { position: i })));
    } catch (err) {
      toast(message(err), "error");
      void load();
    }
  }

  async function remove(entry: Entry) {
    try {
      await api.deleteEntry(entry.id);
      setEntries((list) => list?.filter((e) => e.id !== entry.id) ?? list);
      if (target === String(entry.id)) close();
      toast(`Deleted “${titleOf(kind, entry.data, entry.slug)}”`);
    } catch (e) {
      toast(message(e), "error");
      throw e;
    }
  }

  const gapNotice = gap && (
    <Notice tone="info" onClose={onClearGap}>
      <span className="text-muted-foreground">Visitors asked: </span>
      {gap}
    </Notice>
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Content"
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href={SITE_PAGE[kind]} target="_blank" rel="noopener">
              <ExternalLink data-icon="inline-start" />
              View on site
            </a>
          </Button>
        }
      />
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <Segmented
          label="Content kind"
          value={kind}
          onChange={(k) => go("content", k)}
          options={KINDS.map((k) => ({ value: k.kind, label: k.label }))}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Blog posts are written and published in the{" "}
        <a href={PORTAL_WRITING} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">
          portal
        </a>
        . The site shows them within five minutes, or right away when the portal revalidates.
      </p>

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

      {!sorted ? (
        !error && <Loading />
      ) : kind === "profile" ? (
        <ProfileEditor entry={sorted[0]} gapNotice={gapNotice} onSaved={(row) => setEntries([row])} onClearGap={onClearGap} />
      ) : (
        <Card>
          <ul className="m-0 list-none p-0">
            {sorted.map((entry, i) => (
              <Fragment key={entry.id}>
                <Row
                  entry={entry}
                  kind={kind}
                  open={target === String(entry.id)}
                  first={i === 0}
                  last={i === sorted.length - 1}
                  movable={info.movable}
                  onOpen={() => open(entry.id)}
                  onToggle={() => toggle(entry)}
                  onMove={(by) => move(i, by)}
                  onDelete={() => setRemoving(entry)}
                />
                {target === String(entry.id) && (
                  <li className="border-b border-border bg-sunken px-4 py-4">
                    <EntryForm
                      idPrefix={`edit-${entry.id}`}
                      kind={kind}
                      data={entry.data}
                      submitLabel="Save"
                      onCancel={close}
                      onSubmit={async (data) => {
                        const row = await api.saveEntry(entry.id, kind, data);
                        patchLocal(row);
                        close();
                        toast("Saved");
                      }}
                    />
                  </li>
                )}
              </Fragment>
            ))}
            {sorted.length === 0 && target !== "new" && (
              <li className="border-b border-border">
                <Blank
                  icon={<Plus />}
                  title={`No ${info.label.toLowerCase()} yet.`}
                  action={
                    <Button size="sm" onClick={() => open("new")}>
                      <Plus data-icon="inline-start" />
                      Add {info.one}
                    </Button>
                  }
                />
              </li>
            )}
            <li>
              {target === "new" ? (
                <div className="flex flex-col gap-3 px-4 py-4">
                  <div className="text-sm font-medium">New {info.one}</div>
                  {gapNotice}
                  <EntryForm
                    idPrefix="new"
                    kind={kind}
                    data={EMPTY}
                    submitLabel={`Add ${info.one}`}
                    onCancel={close}
                    onSubmit={async (data) => {
                      const row = await api.createEntry(kind, data);
                      setEntries((list) => [...(list ?? []), row]);
                      onClearGap();
                      close();
                      toast(`Added “${titleOf(kind, row.data, row.slug)}”`);
                    }}
                  />
                </div>
              ) : (
                sorted.length > 0 && (
                  <button
                    type="button"
                    onClick={() => open("new")}
                    className="flex h-11 w-full cursor-pointer items-center gap-2 rounded-b-xl px-4 text-left text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <Plus className="size-4" aria-hidden />
                    Add {info.one}
                  </button>
                )
              )}
            </li>
          </ul>
        </Card>
      )}

      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete this ${info.one}?`}
        body={
          removing && (
            <>
              “{titleOf(kind, removing.data, removing.slug)}” is removed from the site and the database. Hide it instead to keep it.
            </>
          )
        }
        confirm="Delete"
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </div>
  );
}

function Row({
  entry,
  kind,
  open,
  first,
  last,
  movable,
  onOpen,
  onToggle,
  onMove,
  onDelete,
}: {
  entry: Entry;
  kind: Kind;
  open: boolean;
  first: boolean;
  last: boolean;
  movable: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const title = titleOf(kind, entry.data, entry.slug);
  const meta = metaOf(kind, entry.data);
  const icon = kind === "tool" && typeof entry.data.icon === "string" ? entry.data.icon : "";
  return (
    <li
      className={cn(
        "group flex items-center gap-2 border-b border-border py-1.5 pr-2 pl-2 md:pr-3",
        open && "bg-muted",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className={cn("size-4 shrink-0 text-subtle transition-transform", open && "rotate-90")} aria-hidden />
        {icon && <img src={icon} alt="" className="size-5 shrink-0 rounded-sm object-contain" />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("flex min-w-0 items-center gap-1.5", !entry.visible && "text-muted-foreground")}>
            <span className="truncate font-medium">{title}</span>
            {entry.data.featured === true && (
              <Star className="size-3.5 shrink-0 fill-current text-e-projects" aria-label="Featured" />
            )}
          </span>
          {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
        </span>
        {!entry.visible && (
          <Pill>
            <EyeOff aria-hidden />
            Hidden
          </Pill>
        )}
        {entry.source !== "seed" && entry.source !== "admin" && <Pill className="max-md:hidden">{sourceLabel(entry.source)}</Pill>}
        <When iso={entry.updated_at} className="text-xs max-md:hidden" />
      </button>

      <IconButton label={entry.visible ? "Hide from the site" : "Show on the site"} onClick={onToggle} aria-pressed={!entry.visible}>
        {entry.visible ? <Eye /> : <EyeOff />}
      </IconButton>
      <div className="flex items-center max-md:hidden">
        {movable && (
          <>
            <IconButton label="Move up" onClick={() => onMove(-1)} disabled={first}>
              <ArrowUp />
            </IconButton>
            <IconButton label="Move down" onClick={() => onMove(1)} disabled={last}>
              <ArrowDown />
            </IconButton>
          </>
        )}
        <IconButton label="Edit" onClick={onOpen}>
          <Pencil />
        </IconButton>
        <IconButton label="Delete" onClick={onDelete} className="hover:text-destructive">
          <Trash2 />
        </IconButton>
      </div>
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions" className="text-muted-foreground">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="app-root w-auto min-w-40">
            <DropdownMenuItem onSelect={onOpen}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            {movable && (
              <>
                <DropdownMenuItem disabled={first} onSelect={() => onMove(-1)}>
                  <ArrowUp />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={last} onSelect={() => onMove(1)}>
                  <ArrowDown />
                  Move down
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function sourceLabel(source: string): string {
  if (source === "ai") return "AI";
  if (source === "linkedin") return "LinkedIn";
  if (source === "agent") return "Agent";
  if (source === "admin") return "You";
  if (source === "seed") return "Original";
  return source;
}

function ProfileEditor({
  entry,
  gapNotice,
  onSaved,
  onClearGap,
}: {
  entry: Entry | undefined;
  gapNotice: React.ReactNode;
  onSaved: (row: Entry) => void;
  onClearGap: () => void;
}) {
  const toast = useToast();
  if (!entry)
    return (
      <Card>
        <Blank icon={<Pencil />} title="The profile is missing. Restart the site to copy it from app/site.py." action={<Button variant="outline" size="sm" onClick={() => location.reload()}>Reload</Button>} />
      </Card>
    );
  return (
    <Card className="p-4">
      {gapNotice && <div className="mb-4">{gapNotice}</div>}
      <EntryForm
        idPrefix="profile"
        kind="profile"
        data={entry.data}
        autoFocus={false}
        submitLabel="Save profile"
        onSubmit={async (data) => {
          const row = await api.saveEntry(entry.id, "profile", data);
          onSaved(row);
          onClearGap();
          toast("Profile saved");
        }}
      />
    </Card>
  );
}
