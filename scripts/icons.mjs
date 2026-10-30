// Render the PNG app icons from the SVG mark. Run after changing frontend/public/icons/icon.svg.
//
//   PLAYWRIGHT=/path/to/node_modules/playwright node scripts/icons.mjs
//
// The site has no Node dependencies, so point PLAYWRIGHT at any Playwright install
// (for example `npm i -g playwright && npx playwright install chromium`).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OUT = "frontend/public/icons";
const mark = readFileSync(`${OUT}/icon.svg`, "utf8");
const gradient = mark.match(/<defs>.*<\/defs>/)[0];
const glyph = mark.match(/<g .*<\/g><circle[^>]*\/>/)[0];

// Full-bleed tile: no rounded corners and no transparency. `scale` shrinks the glyph
// around the centre (maskable icons keep it inside the central 80% safe zone).
const tile = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}` +
  `<rect width="512" height="512" fill="url(#g)"/>` +
  `<g transform="translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})">${glyph}</g></svg>`;

const targets = [
  { file: "icon-32.png", size: 32, svg: mark },
  { file: "icon-192.png", size: 192, svg: mark },
  { file: "icon-512.png", size: 512, svg: mark },
  { file: "icon-maskable-512.png", size: 512, svg: tile(0.72) },
  // iOS rounds the corners itself and shows transparency as black.
  { file: "apple-touch-icon.png", size: 180, svg: tile(0.86) },
];

const module = process.env.PLAYWRIGHT
  ? pathToFileURL(`${process.env.PLAYWRIGHT.replace(/\/$/, "")}/index.mjs`).href
  : "playwright";
const { chromium } = await import(module);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const target of targets) {
  await page.setViewportSize({ width: target.size, height: target.size });
  const svg = target.svg.replace("<svg ", `<svg width="${target.size}" height="${target.size}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator("svg").screenshot({ path: `${OUT}/${target.file}`, omitBackground: true });
  console.log("wrote", target.file);
}
await browser.close();
