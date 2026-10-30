// Renders parsed Markdown (lib/markdown.ts) as React elements, without raw HTML. Site links
// stay in the tab; external links open in a new tab without a referrer. From noop-hub.
import { ExternalLink } from "lucide-react";
import { Fragment, useMemo, type ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "../lib/markdown.ts";

function inlines(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Fragment key={i}>{n.v}</Fragment>;
      case "strong":
        return <strong key={i}>{inlines(n.c)}</strong>;
      case "em":
        return <em key={i}>{inlines(n.c)}</em>;
      case "del":
        return <del key={i}>{inlines(n.c)}</del>;
      case "code":
        return <code key={i}>{n.v}</code>;
      case "br":
        return <br key={i} />;
      case "link":
        return n.href.startsWith("/") ? (
          <a key={i} href={n.href}>
            {inlines(n.c)}
          </a>
        ) : (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {inlines(n.c)}
            <ExternalLink size={12} aria-label="(opens in a new tab)" className="md-ext" />
          </a>
        );
    }
  });
}

function blocks(nodes: Block[]): ReactNode[] {
  return nodes.map((b, i) => {
    switch (b.t) {
      case "p":
        return <p key={i}>{inlines(b.c)}</p>;
      case "h":
        // Answers sit under the page title, so headings start at h3 and stay compact.
        return b.level <= 2 ? <h3 key={i}>{inlines(b.c)}</h3> : <h4 key={i}>{inlines(b.c)}</h4>;
      case "pre":
        return (
          <pre key={i} data-lang={b.lang || undefined}>
            <code>{b.v}</code>
          </pre>
        );
      case "ul":
        return (
          <ul key={i}>
            {b.items.map((it, k) => (
              <li key={k}>{blocks(it)}</li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol key={i} start={b.start}>
            {b.items.map((it, k) => (
              <li key={k}>{blocks(it)}</li>
            ))}
          </ol>
        );
      case "quote":
        return <blockquote key={i}>{blocks(b.c)}</blockquote>;
      case "hr":
        return <hr key={i} />;
      case "table":
        return (
          <div key={i} className="md-table">
            <table>
              <thead>
                <tr>
                  {b.head.map((h, k) => (
                    <th key={k} className={b.align[k] === "right" ? "right" : b.align[k] === "center" ? "center" : undefined}>
                      {inlines(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((cell, k) => (
                      <td key={k} className={b.align[k] === "right" ? "right num" : b.align[k] === "center" ? "center" : undefined}>
                        {inlines(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  });
}

export function Markdown({ source }: { source: string }) {
  const tree = useMemo(() => parseMarkdown(source), [source]);
  return <div className="md">{blocks(tree)}</div>;
}
