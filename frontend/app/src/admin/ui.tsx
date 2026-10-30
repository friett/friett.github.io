// Small building blocks shared by the admin sections. Tokens only (see styles/shadcn.css).
import { AlertCircle, Check, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Spinner } from "@/components/shadcn/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import { cn } from "@/lib/utils";

/* Icon button with a tooltip (hover and keyboard focus). ----------------------------------- */

export function IconButton({
  label,
  children,
  className,
  side = "top",
  busy,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; side?: "top" | "bottom" | "left" | "right"; busy?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn("text-muted-foreground hover:text-foreground", className)}
          {...props}
        >
          {busy ? <Spinner /> : children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

/* Busy-aware button: shows progress on the pressed button. --------------------------------- */

export function ActionButton({
  busy,
  icon,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { busy?: boolean; icon?: ReactNode }) {
  return (
    <Button disabled={disabled || busy} {...props}>
      {busy ? <Spinner data-icon="inline-start" /> : icon}
      {children}
    </Button>
  );
}

/* Roving focus for a row of options: arrows, Home and End. --------------------------------- */

function roving<T extends string>(e: KeyboardEvent, values: T[], current: T, select: (v: T) => void) {
  const i = values.indexOf(current);
  let next = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % values.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + values.length) % values.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = values.length - 1;
  if (next < 0) return;
  e.preventDefault();
  select(values[next]);
  const group = e.currentTarget as HTMLElement;
  requestAnimationFrame(() => group.querySelectorAll<HTMLElement>("[data-value]")[next]?.focus());
}

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
}

/** A compact segmented control (radio group). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  size = "md",
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-sunken p-0.5", className)}
      onKeyDown={(e) => roving(e, options.map((o) => o.value), value, onChange)}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "h-6 text-xs" : "h-7 text-sm",
              on && "bg-card text-foreground ring-1 ring-border",
            )}
          >
            {o.icon}
            {o.label}
            {o.badge}
          </button>
        );
      })}
    </div>
  );
}

/** The island's section tabs (tablist with roving focus). */
export function TabBar<T extends string>({
  value,
  options,
  onChange,
  label,
  end,
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  end?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border">
      <div
        role="tablist"
        aria-label={label}
        className="-mb-px flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        onKeyDown={(e) => roving(e, options.map((o) => o.value), value, onChange)}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              id={`tab-${o.value}`}
              aria-selected={on}
              aria-controls="admin-panel"
              data-value={o.value}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={cn(
                "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring",
                on && "border-brand text-foreground [&_svg]:text-brand",
              )}
            >
              {o.icon}
              {o.label}
              {o.badge}
            </button>
          );
        })}
      </div>
      {end}
    </div>
  );
}

/* Surfaces. --------------------------------------------------------------------------------- */

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("min-w-0 rounded-xl border border-border bg-card", className)} {...props} />;
}

export function CardHead({ title, icon, actions, className }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-11 items-center gap-2 border-b border-border px-4 py-2", className)}>
      {icon && <span className="text-subtle [&_svg]:size-4">{icon}</span>}
      <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
      {actions}
    </div>
  );
}

export function SectionHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="m-0 mr-auto text-[length:var(--fs-title)] leading-tight font-semibold">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Pill({ children, className, tone = "muted" }: { children: ReactNode; className?: string; tone?: "muted" | "brand" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "brand" && "bg-brand-soft text-brand",
        tone === "warn" && "bg-muted text-e-projects",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** An inline message with an icon and, for errors, an action. */
export function Notice({
  tone = "error",
  children,
  action,
  onClose,
  className,
}: {
  tone?: "error" | "info" | "success";
  children: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  className?: string;
}) {
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? Check : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm",
        tone === "error" ? "bg-sunken" : "bg-sunken",
        className,
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-destructive" : tone === "success" ? "text-e-writing" : "text-brand")}
        aria-hidden
      />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      {onClose && (
        <IconButton label="Close" size="icon-xs" onClick={onClose} className="-mr-1">
          <X />
        </IconButton>
      )}
    </div>
  );
}

/** Empty or failed state inside a card, always with an action. */
export function Blank({ icon, title, action, className }: { icon: ReactNode; title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-4 py-8 text-center", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
      <p className="m-0 max-w-sm text-sm text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}

export function Loading({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-10 text-muted-foreground", className)}>
      <Spinner />
    </div>
  );
}

/* Dates. ------------------------------------------------------------------------------------ */

const exact = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const rel = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function parseDate(iso: string): Date {
  // The API sends naive UTC timestamps.
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}

export function relative(date: Date): string {
  const s = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rel.format(s, "second");
  if (abs < 3600) return rel.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rel.format(Math.round(s / 3600), "hour");
  if (abs < 86400 * 30) return rel.format(Math.round(s / 86400), "day");
  if (abs < 86400 * 365) return rel.format(Math.round(s / (86400 * 30)), "month");
  return rel.format(Math.round(s / (86400 * 365)), "year");
}

export function When({ iso, className }: { iso: string; className?: string }) {
  const date = parseDate(iso);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={date.toISOString()} tabIndex={0} className={cn("whitespace-nowrap text-subtle outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm", className)}>
          {relative(date)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{exact.format(date)}</TooltipContent>
    </Tooltip>
  );
}

/* Confirmation for irreversible actions. ---------------------------------------------------- */

export function Confirm({
  open,
  title,
  body,
  confirm,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirm: string;
  onConfirm: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="app-root grid-cols-[minmax(0,1fr)]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <ActionButton
            variant="destructive"
            busy={busy}
            autoFocus
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirm}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Toasts. ----------------------------------------------------------------------------------- */

interface ToastItem {
  id: number;
  text: string;
  tone: "success" | "error";
}

const ToastContext = createContext<(text: string, tone?: ToastItem["tone"]) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const push = useCallback((text: string, tone: ToastItem["tone"] = "success") => {
    const id = next.current++;
    setItems((list) => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+12px)] z-[var(--z-tooltip)] flex flex-col items-center gap-2 px-4 md:right-6 md:bottom-6 md:left-auto md:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-foreground shadow-floating animate-in fade-in-0 slide-in-from-bottom-2"
          >
            {t.tone === "error" ? (
              <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
            ) : (
              <Check className="size-4 shrink-0 text-e-writing" aria-hidden />
            )}
            <span className="min-w-0">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* Copy to clipboard. ------------------------------------------------------------------------ */

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  return [
    copied,
    (text: string) => {
      void navigator.clipboard?.writeText(text).then(() => setCopied(true));
    },
  ];
}
