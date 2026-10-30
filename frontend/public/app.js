// Progressive enhancement for the server-rendered pages. Everything here is optional:
// links, sections, posts and the table of contents all work without JavaScript.

const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? "⌘" : "Ctrl";

function store(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function isTypingTarget(el) {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}

document.querySelectorAll("[data-mod]").forEach((node) => {
  node.textContent = MOD;
});

/* Theme: light, dark or system ------------------------------------------------------------- */

const THEME_KEY = "fried:theme";
const THEMES = ["system", "light", "dark"];
const THEME_LABEL = { system: "System", light: "Light", dark: "Dark" };
const NAV_COLOR = { light: "#f0f3f2", dark: "#0a0e0d" };

function getTheme() {
  const value = root.getAttribute("data-theme");
  return value === "light" || value === "dark" ? value : "system";
}

function syncTheme() {
  const choice = getTheme();
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === choice));
  });
  const next = THEMES[(THEMES.indexOf(choice) + 1) % THEMES.length];
  document.querySelectorAll('[data-action="theme-cycle"]').forEach((button) => {
    button.setAttribute("aria-label", `Theme: ${THEME_LABEL[choice]}. Switch to ${THEME_LABEL[next]}`);
    button.dataset.tip = `Theme: ${THEME_LABEL[choice]}`;
  });
  // Point the browser chrome (the iOS status bar) at the navigation surface.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.media.includes("dark") ? "dark" : "light";
    meta.content = NAV_COLOR[choice === "system" ? scheme : choice];
  });
}

function setTheme(choice) {
  if (choice === "system") {
    root.removeAttribute("data-theme");
    store(THEME_KEY, null);
    store("theme", null);
  } else {
    root.setAttribute("data-theme", choice);
    store(THEME_KEY, choice);
  }
  syncTheme();
}

syncTheme();

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
});

/* Sidebar: expanded or an icon rail ----------------------------------------------------------- */

const NAV_KEY = "fried:nav";

function navCollapsed() {
  return root.getAttribute("data-nav") === "collapsed";
}

function syncNav() {
  const collapsed = navCollapsed();
  document.querySelectorAll('[data-action="toggle-nav"]').forEach((button) => {
    const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.dataset.tip = label;
  });
}

function toggleNav() {
  const next = navCollapsed() ? "expanded" : "collapsed";
  root.setAttribute("data-nav", next);
  store(NAV_KEY, next);
  syncNav();
  hideTip();
}

syncNav();

/* Tooltips: on hover and keyboard focus ------------------------------------------------------ */

const tooltip = document.getElementById("tooltip");
let tipTarget = null;

function tipWanted(el) {
  // Nav items show their label already unless the sidebar is a rail.
  if (el.closest(".sidebar") && el.classList.contains("nav-item")) {
    return navCollapsed() && matchMedia("(min-width: 761px)").matches;
  }
  return true;
}

function showTip(el) {
  if (!tooltip || !el.dataset.tip || !tipWanted(el)) return;
  tipTarget = el;
  tooltip.textContent = el.dataset.tip;
  const keys = el.getAttribute("aria-keyshortcuts");
  if (keys && navCollapsed()) {
    const kbd = document.createElement("kbd");
    kbd.className = "kbd";
    kbd.textContent = keys.includes("Meta+K") ? `${MOD} K` : keys;
    tooltip.append(kbd);
  }
  tooltip.hidden = false;
  const box = el.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  let left;
  let top;
  if (el.dataset.tipSide === "right") {
    left = box.right + 8;
    top = box.top + box.height / 2 - tip.height / 2;
  } else {
    left = box.left + box.width / 2 - tip.width / 2;
    top = box.bottom + 6;
    if (top + tip.height > window.innerHeight - 8) top = box.top - tip.height - 6;
  }
  left = Math.max(8, Math.min(left, window.innerWidth - tip.width - 8));
  tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function hideTip() {
  if (tooltip) tooltip.hidden = true;
  tipTarget = null;
}

document.addEventListener("pointerover", (event) => {
  if (event.pointerType === "touch") return;
  const el = event.target.closest?.("[data-tip]");
  if (el && el !== tipTarget) showTip(el);
  if (!el && tipTarget) hideTip();
});
document.addEventListener("focusin", (event) => {
  const el = event.target.closest?.("[data-tip]");
  if (el && el.matches(":focus-visible")) showTip(el);
  else hideTip();
});
document.addEventListener("focusout", hideTip);
document.addEventListener("scroll", hideTip, { passive: true, capture: true });
document.addEventListener("pointerdown", hideTip);

/* Navigation helpers ---------------------------------------------------------------------- */

function go(href, external = false) {
  if (external) {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  const url = new URL(href, window.location.href);
  if (url.pathname === window.location.pathname && url.hash) {
    const target = document.getElementById(url.hash.slice(1));
    if (target) {
      history.pushState(null, "", url.hash);
      target.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" });
      markSection(url.hash.slice(1));
      return;
    }
  }
  if (url.pathname === window.location.pathname && !url.hash && href === "/") {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? "auto" : "smooth" });
    history.replaceState(null, "", "/");
    return;
  }
  window.location.assign(url.href);
}

// "Home" on the home page scrolls to the top instead of reloading.
document.querySelectorAll('a[data-section="home"], .brand').forEach((link) => {
  link.addEventListener("click", (event) => {
    if (window.location.pathname !== "/" || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    go("/");
  });
});

/* Command palette --------------------------------------------------------------------------- */

const palette = document.getElementById("palette");
const paletteInput = document.getElementById("palette-query");
const paletteList = document.getElementById("palette-list");
const paletteIcons = document.getElementById("palette-icons");
let commands = [];
let results = [];
let active = 0;

try {
  commands = JSON.parse(document.getElementById("palette-data")?.textContent || "[]");
} catch {
  commands = [];
}

/** Substring match with a bonus for word starts; lower is better, -1 means no match. */
function score(text, query) {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const direct = haystack.indexOf(query);
  if (direct >= 0) {
    return direct === 0 || /[\s\-(]/.test(haystack[direct - 1]) ? direct : direct + 20;
  }
  let from = 0;
  let gaps = 0;
  for (const char of query) {
    const found = haystack.indexOf(char, from);
    if (found < 0) return -1;
    gaps += found - from;
    from = found + 1;
  }
  return gaps > 6 ? -1 : 100 + gaps;
}

function iconFor(command) {
  const span = document.createElement("span");
  span.className = "glyph";
  if (command.entity) span.dataset.entity = command.entity;
  if (command.image) {
    const img = document.createElement("img");
    img.src = command.image;
    img.alt = "";
    span.append(img);
  } else if (command.icon) {
    const svg = paletteIcons?.content.querySelector(`[data-icon="${command.icon}"] svg`);
    if (svg) span.append(svg.cloneNode(true));
  }
  return span;
}

function renderPalette() {
  const query = paletteInput.value.trim().toLowerCase();
  // Without a query, list sections, actions and recent writing, not every tool.
  const pool = query
    ? commands
    : commands.filter((c) => !["Tools", "Profiles"].includes(c.group));
  // Labels match loosely; group names and keywords only as plain substrings, ranked lower.
  const rankOf = (command) => {
    const label = score(command.label, query);
    if (label >= 0) return label;
    const extra = `${command.group} ${command.keywords || ""}`.toLowerCase();
    return extra.includes(query) ? 200 : -1;
  };
  results = pool
    .map((command, order) => ({ command, order, rank: rankOf(command) }))
    .filter((item) => item.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((item) => item.command);
  // Group results while keeping the best group first.
  const groups = new Map();
  for (const command of results) {
    if (!groups.has(command.group)) groups.set(command.group, []);
    groups.get(command.group).push(command);
  }
  results = [...groups.values()].flat().slice(0, 40);
  active = Math.min(active, Math.max(0, results.length - 1));

  paletteList.replaceChildren();
  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "palette-empty";
    const text = document.createElement("span");
    text.textContent = `Nothing matches “${paletteInput.value.trim()}”.`;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "btn btn-sm";
    clear.textContent = "Clear search";
    clear.addEventListener("click", () => {
      paletteInput.value = "";
      renderPalette();
      paletteInput.focus();
    });
    empty.append(text, clear);
    paletteList.append(empty);
    paletteInput.removeAttribute("aria-activedescendant");
    return;
  }
  let lastGroup = "";
  results.forEach((command, index) => {
    if (command.group !== lastGroup) {
      const label = document.createElement("div");
      label.className = "menu-label";
      label.setAttribute("role", "presentation");
      label.textContent = command.group;
      paletteList.append(label);
      lastGroup = command.group;
    }
    const option = document.createElement("div");
    option.id = `cmd-${index}`;
    option.className = "menu-item";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(index === active));
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = command.label;
    option.append(iconFor(command), label);
    if (command.hint || command.external) {
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = command.hint || "";
      if (command.external) {
        const svg = paletteIcons?.content.querySelector('[data-icon="arrow-up-right"] svg');
        if (svg) meta.append(svg.cloneNode(true));
      }
      option.append(meta);
    }
    option.addEventListener("mousemove", () => setActive(index, false));
    option.addEventListener("click", () => runCommand(command));
    paletteList.append(option);
  });
  paletteInput.setAttribute("aria-activedescendant", `cmd-${active}`);
}

function setActive(index, scroll = true) {
  if (index === active) return;
  paletteList.querySelector(`#cmd-${active}`)?.setAttribute("aria-selected", "false");
  active = index;
  const option = paletteList.querySelector(`#cmd-${active}`);
  option?.setAttribute("aria-selected", "true");
  paletteInput.setAttribute("aria-activedescendant", `cmd-${active}`);
  if (scroll) option?.scrollIntoView({ block: "nearest" });
}

function openPalette(query = "") {
  if (!palette || palette.open) return;
  closeDialogs();
  paletteInput.value = query;
  active = 0;
  renderPalette();
  palette.showModal();
  paletteInput.focus();
}

function runCommand(command) {
  palette.close();
  if (command.action) {
    runAction(command.action);
    return;
  }
  go(command.href, command.external);
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href.split("#")[0]);
    flash("Link copied");
  } catch {
    flash("Could not copy the link");
  }
}

function runAction(action) {
  if (action.startsWith("theme:")) setTheme(action.slice(6));
  else if (action === "copy-link") copyLink();
  else if (action === "toggle-nav") toggleNav();
  else if (action === "shortcuts") openShortcuts();
  else if (action === "palette") openPalette();
  else if (action === "theme-cycle") {
    const choice = getTheme();
    setTheme(THEMES[(THEMES.indexOf(choice) + 1) % THEMES.length]);
    if (tipTarget) showTip(tipTarget);
  }
}

paletteInput?.addEventListener("input", () => {
  active = 0;
  renderPalette();
});
paletteInput?.addEventListener("keydown", (event) => {
  const count = results.length;
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && count) {
    event.preventDefault();
    setActive((active + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
  } else if (event.key === "Enter" && results[active]) {
    event.preventDefault();
    runCommand(results[active]);
  } else if (event.key === "?" && !paletteInput.value) {
    event.preventDefault();
    palette.close();
    openShortcuts();
  }
});
// A click on the backdrop closes the dialog.
document.querySelectorAll("dialog.dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });
});

const shortcuts = document.getElementById("shortcuts");

function openShortcuts() {
  if (!shortcuts || shortcuts.open) return;
  closeDialogs();
  shortcuts.showModal();
}

function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-action]");
  if (!button || button.tagName === "A") return;
  const action = button.dataset.action;
  if (action === "clear-filter") applyFilter("");
  else if (action) runAction(action);
});

/* Keyboard shortcuts ---------------------------------------------------------------------- */

const SECTION_KEYS = {};
commands
  .filter((c) => c.group === "Go to" && c.hint)
  .forEach((c) => {
    SECTION_KEYS[c.hint.slice(-1).toLowerCase()] = c.href;
  });
let pendingG = 0;

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (palette?.open) palette.close();
    else openPalette();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
  if (document.querySelector("dialog[open]")) return;
  if (event.key === "Escape") {
    hideTip();
    return;
  }
  if (event.key === "/") {
    event.preventDefault();
    openPalette();
    return;
  }
  if (event.key === "?") {
    event.preventDefault();
    openShortcuts();
    return;
  }
  if (event.key === "[") {
    event.preventDefault();
    toggleNav();
    return;
  }
  if (event.key === "g") {
    pendingG = Date.now();
    return;
  }
  if (Date.now() - pendingG < 1200) {
    pendingG = 0;
    const href = SECTION_KEYS[event.key.toLowerCase()];
    if (href) {
      event.preventDefault();
      go(href);
    }
  }
});

/* Small status message ---------------------------------------------------------------------- */

const filterClear = document.getElementById("filter-clear");
let flashTimer = 0;

function flash(message) {
  if (!filterClear) return;
  window.clearTimeout(flashTimer);
  filterClear.textContent = message;
  filterClear.hidden = false;
  filterClear.dataset.flash = "true";
  flashTimer = window.setTimeout(() => {
    delete filterClear.dataset.flash;
    syncFilterClear();
  }, 1800);
}

/* Current section in the navigation -------------------------------------------------------- */

const SECTION_FOR = { top: "home", about: "home", skills: "home", projects: "projects", blog: "writing", tools: "tools", contact: "contact" };
const SIDEBAR_FOR = { top: "home", about: "about", skills: "about", projects: "projects", blog: "writing", tools: "tools" };

function markSection(id) {
  const tab = SECTION_FOR[id];
  const side = SIDEBAR_FOR[id];
  document.querySelectorAll(".tab[data-section]").forEach((link) => {
    if (tab && link.dataset.section === tab) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
  document.querySelectorAll(".sidebar .nav-item[data-section]").forEach((link) => {
    if (side && link.dataset.section === side) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
}

if (window.location.pathname === "/") {
  const watched = ["top", "about", "projects", "blog", "tools", "contact"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  let ticking = false;
  const spy = () => {
    ticking = false;
    const line = window.innerHeight * 0.35;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    let current = watched[0];
    for (const section of watched) {
      if (section.getBoundingClientRect().top <= line) current = section;
    }
    if (atBottom) current = watched[watched.length - 1];
    if (window.scrollY < 40) current = watched[0];
    if (current) markSection(current.id);
  };
  document.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(spy);
      }
    },
    { passive: true },
  );
  spy();
}

/* Typed phrases in the hero -------------------------------------------------------------- */

const phraseNode = document.getElementById("typed-phrases");
const typed = document.getElementById("typed");
const typedWrap = document.querySelector(".typed-wrap");

if (phraseNode && typed && typedWrap) {
  const phrases = JSON.parse(phraseNode.textContent || "[]");
  const longest = phrases.reduce((best, phrase) => (phrase.length > best.length ? phrase : best), "");
  typedWrap.style.minWidth = `min(${longest.length}ch, 100%)`;
  if (!phrases.length || reduceMotion.matches) {
    typed.textContent = phrases[0] || "";
    document.querySelector(".caret")?.remove();
  } else {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let paused = false;
    typedWrap.addEventListener("mouseenter", () => {
      paused = true;
    });
    typedWrap.addEventListener("mouseleave", () => {
      paused = false;
    });
    const hold = async (ms) => {
      for (let spent = 0; spent < ms; ) {
        await wait(50);
        if (!paused && !document.hidden) spent += 50;
      }
    };
    (async () => {
      let index = 0;
      while (true) {
        const phrase = phrases[index % phrases.length];
        await hold(1600);
        for (let length = phrase.length - 1; length >= 0; length -= 1) {
          typed.textContent = phrase.slice(0, length);
          await hold(28);
        }
        index += 1;
        const next = phrases[index % phrases.length];
        for (let length = 1; length <= next.length; length += 1) {
          typed.textContent = next.slice(0, length);
          await hold(46);
        }
      }
    })();
  }
}

/* Live previews of featured projects -------------------------------------------------------- */

document.querySelectorAll(".browser").forEach((frame) => {
  const button = frame.querySelector(".preview-load");
  const title = button?.querySelector("strong");
  button?.addEventListener("click", () => {
    const src = frame.dataset.preview;
    if (!src || frame.querySelector("iframe")) return;
    button.classList.add("is-loading");
    title.textContent = "Loading preview";
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = `Live preview of ${frame.querySelector(".browser-bar p")?.textContent || "the site"}`;
    iframe.loading = "lazy";
    iframe.hidden = true;
    iframe.setAttribute("sandbox", "allow-forms allow-scripts allow-same-origin allow-popups");
    iframe.addEventListener("load", () => {
      iframe.hidden = false;
      button.replaceWith(iframe);
      const close = document.createElement("button");
      close.type = "button";
      close.className = "btn btn-sm preview-close";
      close.textContent = "Close preview";
      close.addEventListener("click", () => {
        iframe.replaceWith(button);
        close.remove();
        button.classList.remove("is-loading");
        title.textContent = "Load live preview";
        button.focus();
      });
      frame.append(close);
    });
    frame.append(iframe);
  });
});

/* Topic filter from skill and tag chips ---------------------------------------------------- */

const matchNodes = [...document.querySelectorAll("[data-match]")];
const filterButtons = [...document.querySelectorAll("button[data-filter]")];
let currentTopic = "";

function tokenMatch(haystack, query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

function syncFilterClear() {
  if (!filterClear || filterClear.dataset.flash) return;
  filterClear.hidden = !currentTopic;
  filterClear.textContent = currentTopic ? `${currentTopic} · Show all` : "";
}

function applyFilter(query) {
  currentTopic = query.trim();
  matchNodes.forEach((node) => {
    node.hidden = Boolean(currentTopic) && !tokenMatch(node.dataset.match || "", currentTopic);
  });
  filterButtons.forEach((button) => {
    const on = Boolean(currentTopic) && button.dataset.filter.toLowerCase() === currentTopic.toLowerCase();
    button.setAttribute("aria-pressed", String(on));
  });
  document.querySelectorAll(".list-card").forEach((card) => {
    const rows = card.querySelectorAll("[data-match]");
    card.hidden = rows.length > 0 && [...rows].every((row) => row.hidden);
  });
  const anyVisible = (selector) => matchNodes.some((node) => node.closest(selector) && !node.hidden);
  const projectEmpty = document.getElementById("project-empty");
  const blogEmpty = document.getElementById("blog-empty");
  if (projectEmpty) projectEmpty.hidden = !currentTopic || anyVisible("#projects");
  if (blogEmpty) blogEmpty.hidden = !currentTopic || anyVisible("#blog");
  syncFilterClear();
  const url = new URL(window.location.href);
  if (currentTopic) url.searchParams.set("topic", currentTopic);
  else url.searchParams.delete("topic");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-pressed") === "true";
    applyFilter(on ? "" : button.dataset.filter || "");
  });
});
filterClear?.addEventListener("click", () => {
  if (!filterClear.dataset.flash) applyFilter("");
});

const initialTopic = new URLSearchParams(window.location.search).get("topic");
if (initialTopic && matchNodes.length) applyFilter(initialTopic);

/* Posts: reading progress, code copy, table of contents ------------------------------------ */

const article = document.querySelector(".post");
const progress = document.querySelector(".read-progress");
if (article && progress) {
  let ticking = false;
  const update = () => {
    const start = article.offsetTop;
    const height = article.offsetHeight - window.innerHeight * 0.6;
    const ratio = height <= 0 ? 1 : Math.min(1, Math.max(0, (window.scrollY - start) / height));
    progress.style.transform = `scaleX(${ratio})`;
    ticking = false;
  };
  document.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true },
  );
  update();
}

document.querySelectorAll(".prose pre").forEach((pre) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-sm copy-code";
  button.textContent = "Copy";
  button.addEventListener("click", async () => {
    const code = pre.querySelector("code")?.innerText || pre.innerText;
    try {
      await navigator.clipboard.writeText(code.trim());
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select to copy";
    }
    window.setTimeout(() => {
      button.textContent = "Copy";
    }, 1600);
  });
  pre.append(button);
});

const toc = document.getElementById("toc");
if (toc) {
  const wide = matchMedia("(min-width: 1200px)");
  const syncToc = () => {
    toc.open = wide.matches;
  };
  syncToc();
  wide.addEventListener("change", syncToc);
  const links = [...toc.querySelectorAll("a")];
  links.forEach((link) =>
    link.addEventListener("click", () => {
      if (!wide.matches) toc.open = false;
    }),
  );
  const headings = links
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter(Boolean);
  const seen = new Set();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) seen.add(entry.target.id);
        else if (entry.boundingClientRect.top > 0) seen.delete(entry.target.id);
      });
      const current = [...headings].reverse().find((heading) => seen.has(heading.id)) || headings[0];
      links.forEach((link) => {
        if (current && link.hash === `#${current.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: "0px 0px -70% 0px" },
  );
  headings.forEach((heading) => observer.observe(heading));
}
