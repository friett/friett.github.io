// Section state in the URL hash: #overview, #content/project, #content/project/new,
// #content/project/12, #drafts, #drafts/applied, #tokens. #setup=<token> is the one-time
// passkey setup link and is handled by the sign-in screen.
import { useEffect, useState } from "react";

export type Section = "overview" | "content" | "drafts" | "tokens";
export const SECTIONS: Section[] = ["overview", "content", "drafts", "tokens"];

export interface Route {
  section: Section;
  parts: string[];
}

export function parse(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  if (raw.startsWith("setup=")) return { section: "overview", parts: [] };
  const [head, ...parts] = raw.split("/").map(decodeURIComponent);
  const section = (SECTIONS as string[]).includes(head) ? (head as Section) : "overview";
  return { section, parts: section === head ? parts.filter(Boolean) : [] };
}

export function href(section: Section, ...parts: (string | number)[]): string {
  return "#" + [section, ...parts.map((p) => encodeURIComponent(String(p)))].join("/");
}

/** Navigate without adding a history entry for every small change. */
export function go(section: Section, ...parts: (string | number)[]) {
  const next = href(section, ...parts);
  if (location.hash !== next) location.hash = next;
}

export function replace(section: Section, ...parts: (string | number)[]) {
  const next = href(section, ...parts);
  if (location.hash !== next) history.replaceState(null, "", next);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function setupToken(): string {
  const m = /^#setup=([^&]+)/.exec(location.hash);
  return m ? decodeURIComponent(m[1]) : "";
}

export function clearHash() {
  history.replaceState(null, "", location.pathname + location.search);
}
