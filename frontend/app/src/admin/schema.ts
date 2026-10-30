// The content kinds and their fields, as in app/models.py. The editor form is generated
// from these, so a new model field only needs a line here.
import type { Data, Entry, Kind } from "./api.ts";

export type FieldType = "text" | "long" | "list" | "bool" | "month" | "url";

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  optional?: boolean;
  placeholder?: string;
  /** Span both columns of the form grid. */
  wide?: boolean;
  /** A list of paragraphs: items are separated by a blank line instead of a line break. */
  paragraphs?: boolean;
}

export interface KindInfo {
  kind: Kind;
  label: string;
  one: string;
  fields: Field[];
  /** Ordered by hand (position); roles are ordered by date like the site shows them. */
  movable: boolean;
}

const t = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, type: "text", ...extra });

export const KINDS: KindInfo[] = [
  {
    kind: "profile",
    label: "Profile",
    one: "profile",
    movable: false,
    fields: [
      t("name", "Name"),
      t("role", "Role"),
      t("location", "Location"),
      t("github", "GitHub", { type: "url", placeholder: "https://github.com/…" }),
      t("linkedin", "LinkedIn", { type: "url", placeholder: "https://www.linkedin.com/in/…" }),
      t("bio", "Bio", { type: "list", wide: true, paragraphs: true, placeholder: "Paragraphs, separated by a blank line" }),
      t("phrases", "Phrases", { type: "list", wide: true, placeholder: "One phrase per line" }),
    ],
  },
  {
    kind: "role",
    label: "Experience",
    one: "position",
    movable: false,
    fields: [
      t("title", "Title"),
      t("company", "Company"),
      t("start", "Start", { type: "month", placeholder: "YYYY-MM" }),
      t("end", "End", { type: "month", optional: true, placeholder: "Empty = current" }),
      t("location", "Location", { optional: true }),
      t("url", "Link", { type: "url", optional: true, placeholder: "https://…" }),
      t("description", "Description", { type: "long", wide: true }),
    ],
  },
  {
    kind: "project",
    label: "Projects",
    one: "project",
    movable: true,
    fields: [
      t("title", "Title"),
      t("date", "Date", { placeholder: "2025" }),
      t("description", "Description", { type: "long", wide: true }),
      t("tags", "Tags", { type: "list", placeholder: "One tag per line" }),
      t("highlights", "Highlights", { type: "list", placeholder: "One highlight per line" }),
      t("link", "Link", { type: "url", optional: true, placeholder: "https://…" }),
      t("preview", "Preview image", { optional: true, placeholder: "/images/…" }),
      t("eyebrow", "Eyebrow", { optional: true }),
      t("featured", "Featured on the home page", { type: "bool" }),
    ],
  },
  {
    kind: "skill",
    label: "Skills",
    one: "skill group",
    movable: true,
    fields: [t("category", "Category", { wide: true }), t("items", "Skills", { type: "list", wide: true, placeholder: "One skill per line" })],
  },
  {
    kind: "tool",
    label: "Tools",
    one: "tool",
    movable: true,
    fields: [
      t("name", "Name"),
      t("url", "Link", { type: "url", placeholder: "https://…" }),
      t("icon", "Icon", { placeholder: "/icons/name.svg" }),
      t("description", "Description", { type: "long", wide: true }),
    ],
  },
];

export const KIND: Record<Kind, KindInfo> = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<Kind, KindInfo>;

export function isKind(value: string | undefined): value is Kind {
  return !!value && value in KIND;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The name a person recognises the entry by. */
export function titleOf(kind: Kind, data: Data, fallback = ""): string {
  switch (kind) {
    case "profile":
      return str(data.name) || "Profile";
    case "role":
      return [str(data.title), str(data.company)].filter(Boolean).join(" · ") || fallback;
    case "project":
      return str(data.title) || fallback;
    case "skill":
      return str(data.category) || fallback;
    case "tool":
      return str(data.name) || fallback;
  }
}

/** Short secondary text for list rows. */
export function metaOf(kind: Kind, data: Data): string {
  switch (kind) {
    case "role": {
      const start = str(data.start);
      const end = str(data.end) || "now";
      return [start && `${start} – ${end}`, str(data.location)].filter(Boolean).join(" · ");
    }
    case "project":
      return [str(data.date), ...(Array.isArray(data.tags) ? (data.tags as string[]).slice(0, 3) : [])].filter(Boolean).join(" · ");
    case "skill": {
      const items = Array.isArray(data.items) ? (data.items as string[]) : [];
      return items.slice(0, 4).join(", ") + (items.length > 4 ? ` +${items.length - 4}` : "");
    }
    case "tool":
      return str(data.description);
    case "profile":
      return str(data.role);
  }
}

/** Form values (strings and booleans) from stored data. */
export type FormValues = Record<string, string | boolean>;

export function toForm(kind: Kind, data: Data): FormValues {
  const out: FormValues = {};
  for (const f of KIND[kind].fields) {
    const v = data[f.name];
    if (f.type === "bool") out[f.name] = v === true;
    else if (f.type === "list") out[f.name] = Array.isArray(v) ? (v as unknown[]).map(String).join(f.paragraphs ? "\n\n" : "\n") : "";
    else out[f.name] = v == null ? "" : String(v);
  }
  return out;
}

/** Stored data from form values, keeping fields the form does not know. */
export function fromForm(kind: Kind, values: FormValues, base: Data = {}): Data {
  const out: Data = { ...base };
  for (const f of KIND[kind].fields) {
    const v = values[f.name];
    if (f.type === "bool") out[f.name] = v === true;
    else if (f.type === "list")
      out[f.name] = listItems(f, String(v ?? ""));
    else {
      const s = String(v ?? "").trim();
      out[f.name] = s === "" && f.optional ? null : s;
    }
  }
  return out;
}

export function listItems(field: Field, text: string): string[] {
  return text
    .split(field.paragraphs ? /\n\s*\n/ : "\n")
    .map((s) => s.trim().replace(/\s*\n\s*/g, " "))
    .filter(Boolean);
}

/** The field a slug is made from (app/content.py slug_for): duplicates are reported on it. */
const SLUG_FIELD: Record<Kind, string> = { profile: "name", role: "title", project: "title", skill: "category", tool: "name" };

/** Client-side check before the server validates: required text fields. */
export function missing(kind: Kind, values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of KIND[kind].fields) {
    if (f.optional || f.type === "bool" || f.type === "list" || f.type === "long") continue;
    if (!String(values[f.name] ?? "").trim()) errors[f.name] = "Required";
  }
  return errors;
}

/** Server errors look like "field: message" (app/content.py validate). */
export function splitServerError(kind: Kind, detail: string): { field?: string; text: string } {
  const m = /^([a-z_]+)(?:\.\d+)?: (.*)$/.exec(detail);
  if (m && KIND[kind].fields.some((f) => f.name === m[1])) return { field: m[1], text: m[2] };
  if (/already exists/.test(detail)) return { field: SLUG_FIELD[kind], text: `There is already a ${KIND[kind].one} with this name` };
  return { text: detail };
}

export function sortEntries(kind: Kind, list: Entry[]): Entry[] {
  const copy = [...list];
  if (kind === "role") {
    // Like the site: current roles first, then by end and start, newest first.
    const key = (e: Entry) => `${e.data.end == null ? "1" : "0"}|${str(e.data.end)}|${str(e.data.start)}`;
    copy.sort((a, b) => key(b).localeCompare(key(a)));
  } else copy.sort((a, b) => a.position - b.position || a.id - b.id);
  return copy;
}

/** Display value of one field, for before/after views. */
export function show(field: Field | undefined, v: unknown): string {
  if (v == null || v === "") return "";
  if (Array.isArray(v)) return v.map(String).join("\n");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field?.type === "bool") return v ? "Yes" : "No";
  return String(v);
}
