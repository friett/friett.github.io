// Visual check: phone (390x844) and desktop (1440x900), light and dark, saved in artifacts/.
//
//   uv run fastapi dev --port 8123
//   PLAYWRIGHT=/path/to/node_modules/playwright BASE=http://127.0.0.1:8123 node scripts/screenshots.mjs
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BASE = process.env.BASE || "http://127.0.0.1:8000";
const OUT = "artifacts/screenshots";
const module = process.env.PLAYWRIGHT
  ? pathToFileURL(`${process.env.PLAYWRIGHT.replace(/\/$/, "")}/index.mjs`).href
  : "playwright";
const { chromium } = await import(module);

const viewports = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } },
};
const shots = [
  { name: "home", path: "/" },
  { name: "home-projects", path: "/#projects" },
  { name: "home-writing", path: "/#blog" },
  { name: "post", path: "/blog/openwebui" },
  { name: "post-middle", path: "/blog/openwebui#step-3-configure-security" },
  { name: "palette", path: "/", palette: "sm" },
  { name: "shortcuts", path: "/", key: "?" },
  { name: "rail", path: "/blog/dokploy", rail: true, only: "desktop" },
  { name: "not-found", path: "/missing-page" },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [device, options] of Object.entries(viewports)) {
  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({ ...options, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const shot of shots) {
      if (shot.only && shot.only !== device) continue;
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
      await page.evaluate((rail) => {
        localStorage.setItem("fried:nav", rail ? "collapsed" : "expanded");
        document.documentElement.setAttribute("data-nav", rail ? "collapsed" : "expanded");
      }, Boolean(shot.rail));
      if (shot.palette) {
        await page.keyboard.press("ControlOrMeta+k");
        await page.keyboard.type(shot.palette);
      }
      if (shot.key) await page.keyboard.press(shot.key);
      if (shot.rail) await page.hover(".sidebar .nav-item[data-section='projects']");
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${OUT}/${device}-${scheme}-${shot.name}.png` });
    }
    if (errors.length) console.log(device, scheme, "page errors:", errors);
    await context.close();
  }
}
await browser.close();
console.log("wrote", OUT);
