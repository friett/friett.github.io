// Visits and chat activity over 7, 30 or 90 days.
import {
  ChartColumn,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  FileText,
  Globe,
  HelpCircle,
  MessageSquare,
  Monitor,
  Plus,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { cn } from "@/lib/utils";
import "@/styles/markdown.css";
import { api, message, type Count, type Kind, type Stats, type Turn } from "./api.ts";
import { replace, useRoute } from "./route.ts";
import { KINDS } from "./schema.ts";
import { Blank, Card, CardHead, IconButton, Loading, Notice, Pill, SectionHeader, Segmented, When } from "./ui.tsx";

const RANGES = ["7", "30", "90"] as const;
type Range = (typeof RANGES)[number];
const num = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const shortFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const asDay = (d: string) => new Date(`${d}T12:00:00`);

export function Overview({ onGap }: { onGap: (question: string, kind: Kind) => void }) {
  const route = useRoute();
  const range: Range = (RANGES as readonly string[]).includes(route.parts[0]) ? (route.parts[0] as Range) : "30";
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      setStats(await api.stats(Number(range)));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Overview"
        actions={
          <>
            <Segmented
              label="Range"
              value={range}
              onChange={(v) => replace("overview", v)}
              options={RANGES.map((r) => ({ value: r, label: `${r} days` }))}
            />
            <IconButton label="Refresh" onClick={load} busy={busy && !!stats}>
              <RefreshCw />
            </IconButton>
          </>
        }
      />
      {error && (
        <Notice
          action={
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          }
        >
          {error}
        </Notice>
      )}
      {!stats ? (
        !error && <Loading />
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity", busy && "opacity-60")}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-3">
            <Metric label="Views" value={stats.visits.views} onClick={() => jump("card-visits")} />
            <Metric label="Visitors" value={stats.visits.visitors} highlight onClick={() => jump("card-visits")} />
            <Metric label="Questions" value={stats.chat.questions} onClick={() => jump("card-questions")} />
            <Metric label="Conversations" value={stats.chat.conversations} onClick={() => jump("card-questions")} />
            <Metric label="Unanswered" value={stats.chat.unanswered} onClick={() => jump("card-gaps")} className="max-md:col-span-2" />
          </div>

          <Card id="card-visits" tabIndex={-1} className="outline-none">
            <CardHead title="Daily views" icon={<ChartColumn />} actions={<Legend />} />
            {stats.visits.views === 0 ? (
              <Blank
                icon={<ChartColumn />}
                title={`No visits in the last ${range} days.`}
                action={
                  range !== "90" ? (
                    <Button variant="outline" size="sm" onClick={() => replace("overview", "90")}>
                      Show 90 days
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <a href="/">Open the site</a>
                    </Button>
                  )
                }
              />
            ) : (
              <Chart series={stats.visits.series} />
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <TopList
              title="Top pages"
              icon={<FileText />}
              items={stats.visits.pages}
              empty="No page views yet."
              link={(name) => name}
            />
            <TopList
              title="Referrers"
              icon={<Globe />}
              items={stats.visits.referrers}
              empty="No referrers yet. Direct visits do not count."
              link={(name) => (name.startsWith("utm:") ? null : `https://${name}`)}
            />
            <TopList title="Devices" icon={<Monitor />} items={stats.visits.devices} empty="No devices yet." device />
          </div>

          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Questions turns={stats.chat.latest} />
            <Gaps turns={stats.chat.gaps} onGap={onGap} />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, highlight, onClick, className }: { label: string; value: number; highlight?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col items-start gap-1 rounded-xl border border-border bg-card px-3.5 py-3 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-[length:var(--fs-title)] leading-tight font-semibold tabular-nums", highlight && "text-brand")}>{num.format(value)}</span>
    </button>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-brand/35" />
        Views
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-brand" />
        Visitors
      </span>
    </div>
  );
}

function Chart({ series }: { series: Stats["visits"]["series"] }) {
  const [active, setActive] = useState(series.length - 1);
  const [pointing, setPointing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setActive(series.length - 1), [series.length]);
  const max = useMemo(() => Math.max(1, ...series.map((d) => d.views)), [series]);
  const top = niceMax(max);
  const day = series[Math.min(active, series.length - 1)];
  const many = series.length > 31;

  function onKey(e: React.KeyboardEvent) {
    let next = active;
    if (e.key === "ArrowLeft") next = Math.max(0, active - 1);
    else if (e.key === "ArrowRight") next = Math.min(series.length - 1, active + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = series.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
  }

  function onPointer(e: React.PointerEvent) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const i = Math.floor(((e.clientX - box.left) / box.width) * series.length);
    setActive(Math.max(0, Math.min(series.length - 1, i)));
    setPointing(true);
  }

  return (
    <div className="px-4 pt-3 pb-3">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5" aria-live="polite">
        <span className="font-medium">{dayFmt.format(asDay(day.day))}</span>
        <span className="text-muted-foreground tabular-nums">
          {num.format(day.views)} {day.views === 1 ? "view" : "views"} · {num.format(day.visitors)} {day.visitors === 1 ? "visitor" : "visitors"}
        </span>
      </div>
      <div className="flex gap-2">
        <div className="flex h-40 flex-col justify-between pb-px text-right text-xs text-subtle tabular-nums" aria-hidden>
          <span>{num.format(top)}</span>
          <span>{num.format(top / 2)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            ref={ref}
            role="img"
            tabIndex={0}
            aria-label={`Daily views over ${series.length} days. Use the arrow keys to read each day.`}
            onKeyDown={onKey}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setPointing(false)}
            className="relative flex h-40 touch-pan-y items-end rounded-sm border-b border-border outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
            {series.map((d, i) => (
              <div key={d.day} className={cn("relative flex h-full flex-1 items-end justify-center", many ? "px-px" : "px-[3px] md:px-1")}>
                {i === active && (pointing || ref.current === document.activeElement) && (
                  <div className="absolute inset-0 rounded-sm bg-muted" />
                )}
                <div
                  className={cn("relative w-full max-w-10 rounded-t-[3px] bg-brand/35", i === active && "bg-brand/50")}
                  style={{ height: `${(d.views / top) * 100}%` }}
                >
                  <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-brand" style={{ height: d.views ? `${(d.visitors / d.views) * 100}%` : 0 }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-subtle" aria-hidden>
            <span>{shortFmt.format(asDay(series[0].day))}</span>
            {series.length > 2 && <span className="max-md:hidden">{shortFmt.format(asDay(series[Math.floor(series.length / 2)].day))}</span>}
            <span>{shortFmt.format(asDay(series[series.length - 1].day))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function niceMax(n: number): number {
  // A round top for the axis whose half is a whole number too.
  if (n <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const steps = p === 1 ? [2, 4, 6, 8, 10] : [1, 2, 5, 10];
  return (steps.find((m) => m * p >= n) ?? 10) * p;
}

function deviceIcon(name: string): ReactNode {
  if (name === "mobile") return <Smartphone className="size-4 text-subtle" aria-hidden />;
  if (name === "desktop") return <Monitor className="size-4 text-subtle" aria-hidden />;
  return <HelpCircle className="size-4 text-subtle" aria-hidden />;
}

function TopList({
  title,
  icon,
  items,
  empty,
  link,
  device,
}: {
  title: string;
  icon: ReactNode;
  items: Count[];
  empty: string;
  link?: (name: string) => string | null;
  device?: boolean;
}) {
  const total = items.reduce((s, i) => s + i.count, 0);
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Card>
      <CardHead title={title} icon={icon} />
      {items.length === 0 ? (
        <Blank icon={icon} title={empty} action={<Button variant="outline" size="sm" asChild><a href="/">Open the site</a></Button>} className="py-6" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-2">
          {items.map((item) => {
            const target = link?.(item.name) ?? null;
            const label = device ? item.name.charAt(0).toUpperCase() + item.name.slice(1) : item.name;
            const body = (
              <>
                <span className="absolute inset-y-0 left-0 rounded-md bg-muted" style={{ width: `${(item.count / max) * 100}%` }} aria-hidden />
                <span className="relative flex min-w-0 flex-1 items-center gap-2">
                  {device && deviceIcon(item.name)}
                  <span className="truncate" title={item.name}>
                    {label}
                  </span>
                  {target && <ExternalLink className="size-3 shrink-0 text-subtle opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />}
                </span>
                <span className="relative shrink-0 text-muted-foreground tabular-nums">
                  {num.format(item.count)}
                  {device && total > 0 && <span className="ml-2 text-subtle">{Math.round((item.count / total) * 100)}%</span>}
                </span>
              </>
            );
            return (
              <li key={item.name}>
                {target ? (
                  <a
                    href={target}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex h-8 items-center gap-3 rounded-md px-2 text-foreground no-underline outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="relative flex h-8 items-center gap-3 px-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Questions({ turns }: { turns: Turn[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const shown = all ? turns : turns.slice(0, 8);
  return (
    <Card id="card-questions" tabIndex={-1} className="outline-none">
      <CardHead title="Latest questions" icon={<MessageSquare />} actions={turns.length > 0 && <span className="text-xs text-subtle tabular-nums">{turns.length}</span>} />
      {turns.length === 0 ? (
        <Blank
          icon={<MessageSquare />}
          title="No questions in this range."
          action={
            <Button variant="outline" size="sm" asChild>
              <a href="/ask">Open the chat</a>
            </Button>
          }
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {shown.map((t) => {
            const expanded = open === t.id;
            return (
              <li key={t.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`answer-${t.id}`}
                  onClick={() => setOpen(expanded ? null : t.id)}
                  className="flex w-full cursor-pointer items-start gap-2 px-4 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-subtle transition-transform", expanded && "rotate-180")} aria-hidden />
                  <span className={cn("min-w-0 flex-1", !expanded && "line-clamp-2")}>{t.question}</span>
                  {t.unanswered && (
                    <Pill tone="warn">
                      <CircleHelp aria-hidden />
                      Unanswered
                    </Pill>
                  )}
                </button>
                {expanded && (
                  <div id={`answer-${t.id}`} className="flex flex-col gap-2 px-4 pb-3 pl-10">
                    <div className="rounded-lg border border-border bg-sunken px-3 py-2 text-sm">
                      {t.answer ? <Markdown source={t.answer} /> : <span className="text-muted-foreground">No answer was stored.</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
                      <When iso={t.createdAt} />
                      {t.model && <span>{t.model}</span>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {turns.length > shown.length && (
            <li className="px-4 py-2">
              <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
                Show all {turns.length}
              </Button>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

function Gaps({ turns, onGap }: { turns: Turn[]; onGap: (question: string, kind: Kind) => void }) {
  return (
    <Card id="card-gaps" tabIndex={-1} className="outline-none">
      <CardHead title="Gaps" icon={<CircleHelp />} actions={turns.length > 0 && <span className="text-xs text-subtle tabular-nums">{turns.length}</span>} />
      {turns.length === 0 ? (
        <Blank
          icon={<CircleHelp />}
          title="Every question in this range had an answer."
          action={
            <Button variant="outline" size="sm" asChild>
              <a href="/ask">Open the chat</a>
            </Button>
          }
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {turns.map((t) => (
            <li key={t.id} className="flex items-start gap-2 border-b border-border px-4 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="m-0">{t.question}</p>
                <When iso={t.createdAt} className="text-xs" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Plus data-icon="inline-start" />
                    Answer
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="app-root w-auto min-w-44">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Add it to</DropdownMenuLabel>
                  {KINDS.map((k) => (
                    <DropdownMenuItem key={k.kind} onSelect={() => onGap(t.question, k.kind)}>
                      {k.kind === "profile" ? "Profile" : `New ${k.one}`}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
