// A small Markdown parser for AI answers. It produces a tree that Markdown.tsx renders as React
// elements, so no HTML string is ever injected (safe under the CSP, no raw HTML passes through).
// Covers what chat answers use: paragraphs, headings, lists (one nested level), tables, fenced
// code, quotes, rules, bold, italic, strikethrough, inline code and links.

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "del"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "br" };

export type Align = "left" | "right" | "center" | null;

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: number; c: Inline[] }
  | { t: "pre"; lang: string; v: string }
  | { t: "ul"; items: Block[][] }
  | { t: "ol"; start: number; items: Block[][] }
  | { t: "quote"; c: Block[] }
  | { t: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

/** Links may point inside the hub ("/sleep"), or to http(s) and mailto. Anything else is dropped. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  // A hub path: no "//" or "/\\" (browsers read both as another host), no whitespace or backslashes.
  if (/^\/(?![/\\])[^\s\\]*$/.test(h)) return h;
  if (/^https?:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s]+$/i.test(h)) return h;
  return null;
}

// --- inline --------------------------------------------------------------------------------

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|~>]/;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const rest = s.slice(i);
    let m: RegExpExecArray | null;
    if (ch === "\\" && i + 1 < s.length && ESCAPABLE.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`" && (m = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(rest))) {
      flush();
      out.push({ t: "code", v: m[2].replace(/^ (.*) $/, "$1") });
      i += m[0].length;
      continue;
    }
    if (ch === "[" && (m = /^\[((?:[^\]\\]|\\.)+)\]\(([^()\s]+(?:\([^()\s]*\))?)(?:\s+"[^"]*")?\)/.exec(rest))) {
      flush();
      const href = safeHref(m[2]);
      if (href) out.push({ t: "link", href, c: parseInline(m[1]) });
      else out.push(...parseInline(m[1]));
      i += m[0].length;
      continue;
    }
    if (ch === "<" && (m = /^<(https?:\/\/[^>\s]+)>/.exec(rest))) {
      flush();
      out.push({ t: "link", href: m[1], c: [{ t: "text", v: m[1] }] });
      i += m[0].length;
      continue;
    }
    if ((ch === "h" || ch === "H") && (i === 0 || /[\s(]/.test(s[i - 1])) && (m = /^https?:\/\/[^\s<>]+/i.exec(rest))) {
      const url = m[0].replace(/[.,;:!?)\]]+$/, "");
      flush();
      out.push({ t: "link", href: url, c: [{ t: "text", v: url }] });
      i += url.length;
      continue;
    }
    if ((ch === "*" || ch === "_") && s[i + 1] === ch && (m = (ch === "*" ? /^\*\*(?=\S)([\s\S]*?\S)\*\*/ : /^__(?=\S)([\s\S]*?\S)__(?!\w)/).exec(rest))) {
      flush();
      out.push({ t: "strong", c: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if (ch === "~" && (m = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest))) {
      flush();
      out.push({ t: "del", c: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if (ch === "*" && (m = /^\*(?=[^\s*])((?:\*\*[\s\S]*?\*\*|[^*])*?[^\s*])\*(?!\*)/.exec(rest))) {
      flush();
      out.push({ t: "em", c: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if (ch === "_" && (i === 0 || !/\w/.test(s[i - 1])) && (m = /^_(?=\S)([\s\S]*?\S)_(?!\w)/.exec(rest))) {
      flush();
      out.push({ t: "em", c: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// --- blocks --------------------------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let l = line.trim();
  if (l.startsWith("|")) l = l.slice(1);
  if (l.endsWith("|") && !l.endsWith("\\|")) l = l.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < l.length; i++) {
    if (l[i] === "\\" && l[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (l[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += l[i];
  }
  cells.push(cur.trim());
  return cells;
}

function startsBlock(line: string, next: string | undefined): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || LIST.test(line) || (line.includes("|") && next !== undefined && TABLE_SEP.test(next) && next.includes("-"));
}

export function parseMarkdown(src: string, depth = 0): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = FENCE.exec(line))) {
      const fence = m[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i++]);
      i++;
      blocks.push({ t: "pre", lang: m[2] ?? "", v: body.join("\n") });
      continue;
    }
    if ((m = HEADING.exec(line))) {
      blocks.push({ t: "h", level: m[1].length, c: parseInline(m[2]) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null));
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitRow(lines[i]);
        rows.push(head.map((_, k) => parseInline(cells[k] ?? "")));
        i++;
      }
      blocks.push({ t: "table", align: head.map((_, k) => align[k] ?? null), head: head.map(parseInline), rows });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && (m = QUOTE.exec(lines[i]))) {
        body.push(m[1]);
        i++;
      }
      blocks.push({ t: "quote", c: depth < 4 ? parseMarkdown(body.join("\n"), depth + 1) : [{ t: "p", c: parseInline(body.join("\n")) }] });
      continue;
    }
    if ((m = LIST.exec(line))) {
      const indent = m[1].length;
      const ordered = /\d/.test(m[2]);
      const start = ordered ? parseInt(m[2], 10) : 1;
      const items: string[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        const lm = LIST.exec(l);
        if (lm && lm[1].length <= indent + 1 && /\d/.test(lm[2]) === ordered) {
          items.push([lm[3]]);
          i++;
          continue;
        }
        if (lm && lm[1].length <= indent + 1) break; // a different list type starts
        if (!l.trim()) {
          // A blank line ends the list unless the next line continues it, indented or as an item.
          const next = lines[i + 1];
          if (next !== undefined && (LIST.test(next) ? (LIST.exec(next)![1].length > indent + 1 || /\d/.test(LIST.exec(next)![2]) === ordered) : /^\s{2,}\S/.test(next))) {
            items[items.length - 1].push("");
            i++;
            continue;
          }
          break;
        }
        if (/^\s+\S/.test(l) || (!startsBlock(l, lines[i + 1]) && items.length)) {
          items[items.length - 1].push(l.replace(new RegExp(`^\\s{0,${indent + 4}}`), ""));
          i++;
          continue;
        }
        break;
      }
      const parsed = items.map((it) => (depth < 4 ? parseMarkdown(it.join("\n"), depth + 1) : [{ t: "p", c: parseInline(it.join("\n")) } as Block]));
      blocks.push(ordered ? { t: "ol", start, items: parsed } : { t: "ul", items: parsed });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    blocks.push({ t: "p", c: parseInline(para.join("\n")) });
  }
  return blocks;
}
