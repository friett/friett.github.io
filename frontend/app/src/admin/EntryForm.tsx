// The editor for one entry, generated from the kind's fields (schema.ts).
import { AlertCircle, Check, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { cn } from "@/lib/utils";
import { ApiError, message, type Data, type Kind } from "./api.ts";
import { fromForm, KIND, listItems, missing, splitServerError, toForm, type Field, type FormValues } from "./schema.ts";
import { ActionButton, Notice } from "./ui.tsx";

const MONTH = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

export function EntryForm({
  kind,
  data,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = true,
  className,
  idPrefix,
}: {
  kind: Kind;
  data: Data;
  submitLabel: string;
  onSubmit: (data: Data) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
  idPrefix: string;
}) {
  const initial = useMemo(() => toForm(kind, data), [kind, data]);
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fields = KIND[kind].fields;
  const dirty = fields.some((f) => values[f.name] !== initial[f.name]);

  useEffect(() => {
    setValues(initial);
    setErrors({});
    setFormError("");
  }, [initial]);

  useEffect(() => {
    if (autoFocus) formRef.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: false });
  }, [autoFocus]);

  function set(name: string, value: string | boolean) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const local = missing(kind, values);
    for (const f of fields)
      if (f.type === "month" && values[f.name] && !MONTH.test(String(values[f.name]).trim())) local[f.name] = "Use YYYY-MM or YYYY";
    setErrors(local);
    setFormError("");
    const first = Object.keys(local)[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSubmit(fromForm(kind, values, data));
    } catch (error) {
      const text = message(error);
      if (error instanceof ApiError && error.status === 422) {
        const split = splitServerError(kind, text);
        if (split.field) {
          setErrors({ [split.field]: split.text });
          formRef.current?.querySelector<HTMLElement>(`[name="${split.field}"]`)?.focus();
        } else setFormError(split.text);
      } else setFormError(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          onCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void submit();
        }
      }}
      className={cn("grid gap-3 md:grid-cols-2", className)}
    >
      {formError && (
        <Notice className="md:col-span-2" onClose={() => setFormError("")}>
          {formError}
        </Notice>
      )}
      {fields.map((f) => (
        <FieldRow key={f.name} id={`${idPrefix}-${f.name}`} field={f} value={values[f.name]} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
      ))}
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <ActionButton type="submit" busy={busy} icon={<Check data-icon="inline-start" />}>
          {submitLabel}
        </ActionButton>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : (
          dirty && (
            <Button type="button" variant="ghost" onClick={() => setValues(initial)} disabled={busy}>
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
          )
        )}
      </div>
    </form>
  );
}

function FieldRow({
  id,
  field,
  value,
  error,
  onChange,
}: {
  id: string;
  field: Field;
  value: string | boolean | undefined;
  error?: string;
  onChange: (v: string | boolean) => void;
}) {
  const wide = field.wide || field.type === "long" || field.type === "list";
  const errId = `${id}-error`;
  const common = {
    id,
    name: field.name,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errId : undefined,
  };

  if (field.type === "bool") {
    const on = value === true;
    return (
      <div className={cn("flex items-center gap-2.5", field.wide && "md:col-span-2")}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          {...common}
          onClick={() => onChange(!on)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            on ? "bg-primary" : "bg-active",
          )}
        >
          <span className={cn("absolute size-4 rounded-full bg-card ring-1 ring-border transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
        </button>
        <label htmlFor={id} className="cursor-pointer text-sm">
          {field.label}
        </label>
      </div>
    );
  }

  const text = String(value ?? "");
  const lines = field.type === "list" ? listItems(field, text).length : 0;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", wide && "md:col-span-2")}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-xs font-medium text-muted-foreground">
        {field.label}
        {field.optional && <span className="font-normal text-subtle">optional</span>}
        {field.type === "list" && <span className="ml-auto font-normal text-subtle tabular-nums">{lines === 1 ? "1 item" : `${lines} items`}</span>}
      </label>
      {field.type === "long" || field.type === "list" ? (
        <Textarea
          {...common}
          value={text}
          placeholder={field.placeholder}
          rows={field.type === "list" && !field.paragraphs ? Math.min(8, Math.max(3, lines + 1)) : field.paragraphs ? 6 : 3}
          onChange={(e) => onChange(e.target.value)}
          className="max-h-80 bg-card text-sm"
        />
      ) : (
        <Input
          {...common}
          type={field.type === "url" ? "url" : "text"}
          inputMode={field.type === "month" ? "numeric" : field.type === "url" ? "url" : undefined}
          value={text}
          placeholder={field.placeholder}
          autoComplete="off"
          spellCheck={field.type === "text"}
          onChange={(e) => onChange(e.target.value)}
          className="bg-card text-sm"
        />
      )}
      {error && (
        <span id={errId} className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </span>
      )}
    </div>
  );
}
