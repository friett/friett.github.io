document.documentElement.classList.add("js");

const header = document.querySelector(".site-header");
const menuToggle = document.querySelector("#menu-toggle");
const navLinks = [...document.querySelectorAll(".site-nav a")];

function closeMenu() {
  header?.classList.remove("is-open");
  document.body.classList.remove("nav-lock");
  menuToggle?.setAttribute("aria-expanded", "false");
  if (menuToggle) menuToggle.textContent = "Menu";
}

menuToggle?.addEventListener("click", () => {
  const open = header?.classList.toggle("is-open") ?? false;
  document.body.classList.toggle("nav-lock", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.textContent = open ? "Close" : "Menu";
  if (open) navLinks[0]?.focus();
});

navLinks.forEach((link) => link.addEventListener("click", closeMenu));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});

const themeToggle = document.querySelector("#theme-toggle");

function syncThemeLabel() {
  const dark = document.documentElement.classList.contains("dark");
  themeToggle?.setAttribute(
    "aria-label",
    dark ? "Switch to light theme" : "Switch to dark theme",
  );
}

syncThemeLabel();

themeToggle?.addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", dark ? "dark" : "light");
  syncThemeLabel();
});

const aboutDialog = document.querySelector("#about-dialog");
document.querySelector("#about-open")?.addEventListener("click", () => {
  aboutDialog?.showModal();
});
aboutDialog?.addEventListener("click", (event) => {
  if (event.target === aboutDialog) aboutDialog.close();
});

const phraseNode = document.querySelector("#typed-phrases");
const typed = document.querySelector("#typed");
const caret = document.querySelector(".caret");
const typedWrap = document.querySelector(".typed-wrap");

if (phraseNode && typed && typedWrap) {
  const phrases = JSON.parse(phraseNode.textContent || "[]");
  const longest = phrases.reduce((best, phrase) => {
    return phrase.length > best.length ? phrase : best;
  }, "");
  typedWrap.style.minWidth = `${longest.length}ch`;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!phrases.length || reduce) {
    typed.textContent = phrases[0] || "";
    caret?.remove();
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
      const step = 50;
      for (let spent = 0; spent < ms; spent += step) {
        if (paused || document.hidden) {
          await wait(step);
          spent -= step;
        } else {
          await wait(step);
        }
      }
    };
    const typePhrases = async () => {
      let index = 0;
      typed.textContent = phrases[0];
      while (true) {
        const phrase = phrases[index % phrases.length];
        await hold(1400);
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
    };
    typePhrases();
  }
}

document.querySelectorAll(".browser").forEach((frame) => {
  const button = frame.querySelector(".preview-load");
  button?.addEventListener("click", () => {
    const src = frame.dataset.preview;
    if (!src || frame.querySelector("iframe")) return;
    button.classList.add("is-loading");
    button.querySelector("strong").textContent = "Loading preview";
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "Live preview";
    iframe.loading = "lazy";
    iframe.setAttribute(
      "sandbox",
      "allow-forms allow-scripts allow-same-origin allow-popups",
    );
    iframe.addEventListener("load", () => {
      iframe.hidden = false;
      button.replaceWith(iframe);
      frame.classList.add("is-live");
      const close = document.createElement("button");
      close.type = "button";
      close.className = "preview-close";
      close.textContent = "Close preview";
      close.addEventListener("click", () => {
        iframe.replaceWith(button);
        close.remove();
        frame.classList.remove("is-live");
        button.classList.remove("is-loading");
        button.querySelector("strong").textContent = "Load live preview";
      });
      frame.append(close);
    });
    frame.append(iframe);
    iframe.hidden = true;
  });
});

const revealNodes = document.querySelectorAll(".reveal");
if (
  revealNodes.length &&
  !matchMedia("(prefers-reduced-motion: reduce)").matches
) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  revealNodes.forEach((node) => observer.observe(node));
} else {
  revealNodes.forEach((node) => node.classList.add("visible"));
}

const sections = ["skills", "projects", "blog", "tools"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);

if (sections.length) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => {
        const current = link.getAttribute("href")?.endsWith(`#${visible.target.id}`);
        if (current) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: [0.1, 0.4] },
  );
  sections.forEach((section) => sectionObserver.observe(section));
}

const matchNodes = [...document.querySelectorAll("[data-match]")];
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const filterClear = document.querySelector("#filter-clear");
const projectEmpty = document.querySelector("#project-empty");
const blogEmpty = document.querySelector("#blog-empty");

function tokenMatch(haystack, query) {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

function applyFilter(query) {
  const value = query.trim();
  matchNodes.forEach((node) => {
    const show = !value || tokenMatch(node.dataset.match || "", value);
    node.hidden = !show;
  });
  filterButtons.forEach((button) => {
    const on = value && button.dataset.filter?.toLowerCase() === value.toLowerCase();
    button.classList.toggle("is-on", Boolean(on));
    button.setAttribute("aria-pressed", String(Boolean(on)));
  });
  if (filterClear) {
    filterClear.hidden = !value;
    filterClear.textContent = value ? `${value} · Show all` : "";
  }
  const projects = matchNodes.filter((node) => node.classList.contains("feature") || node.classList.contains("card") && !node.classList.contains("post-card"));
  const posts = matchNodes.filter((node) => node.classList.contains("post-card"));
  if (projectEmpty) {
    projectEmpty.hidden = !value || projects.some((node) => !node.hidden);
  }
  if (blogEmpty) {
    blogEmpty.hidden = !value || posts.some((node) => !node.hidden);
  }
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("topic", value);
  else url.searchParams.delete("topic");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const next = button.classList.contains("is-on") ? "" : button.dataset.filter || "";
    applyFilter(next);
  });
});

filterClear?.addEventListener("click", () => applyFilter(""));

const initialTopic = new URLSearchParams(window.location.search).get("topic");
if (initialTopic) applyFilter(initialTopic);

const toTop = document.querySelector("#to-top");
const onScroll = () => {
  if (toTop) toTop.hidden = window.scrollY < 700;
};
document.addEventListener("scroll", onScroll, { passive: true });
onScroll();
toTop?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});

const article = document.querySelector(".post");
const progress = document.querySelector(".read-progress");
if (article && progress) {
  const updateProgress = () => {
    const start = article.offsetTop;
    const height = article.offsetHeight - window.innerHeight * 0.4;
    const seen = window.scrollY - start;
    const ratio = height <= 0 ? 1 : Math.min(1, Math.max(0, seen / height));
    progress.style.transform = `scaleX(${ratio})`;
  };
  document.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();
}

document.querySelectorAll(".prose pre").forEach((pre) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-code";
  button.textContent = "Copy";
  button.addEventListener("click", async () => {
    const code = pre.querySelector("code")?.innerText || pre.innerText;
    try {
      await navigator.clipboard.writeText(code.replace(/\nCopy$/, "").trim());
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

const toc = document.querySelector("#toc");
const headings = [...document.querySelectorAll(".prose h2, .prose h3")];
if (toc && headings.length > 1) {
  const list = document.createElement("div");
  headings.forEach((heading) => {
    if (!heading.id) {
      heading.id = heading.textContent
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent;
    if (heading.tagName === "H3") link.classList.add("toc-sub");
    list.append(link);
  });
  toc.append(list);
  toc.hidden = false;
  const wide = matchMedia("(min-width: 1000px)");
  const syncToc = () => {
    toc.open = wide.matches;
  };
  syncToc();
  wide.addEventListener("change", syncToc);
  const tocLinks = [...toc.querySelectorAll("a")];
  const headingObserver = new IntersectionObserver(
    (entries) => {
      const current = entries.find((entry) => entry.isIntersecting);
      if (!current) return;
      tocLinks.forEach((link) => {
        link.classList.toggle("is-current", link.getAttribute("href") === `#${current.target.id}`);
      });
    },
    { rootMargin: "-20% 0px -70% 0px" },
  );
  headings.forEach((heading) => headingObserver.observe(heading));
}
