// Chrome Web Store 用の小プロモーションタイル(440x280)を生成する。
// 全言語向けアセットに置くため英語コピーで作る。
// 実行: node scripts/gen-promo-tile.mjs → dist/store-assets/promo-tile-440x280.png
import { chromium } from "playwright";
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(EXT, "dist", "store-assets");
mkdirSync(OUT, { recursive: true });

const icon = readFileSync(path.join(EXT, "icons/icon128.png")).toString("base64");
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin:0; box-sizing:border-box; }
  body { width:440px; height:280px; overflow:hidden;
    font-family:"Hiragino Sans",system-ui,sans-serif;
    background: linear-gradient(135deg,#0d2438 0%,#123b5c 55%,#1b5580 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; color:#eaf6ff; text-align:center; }
  img { width:72px; height:72px; border-radius:16px;
    box-shadow:0 10px 30px rgba(0,0,0,.45); }
  h1 { font-size:30px; font-weight:700; letter-spacing:.01em; }
  p { font-size:15px; opacity:.85; }
</style></head><body>
  <img src="data:image/png;base64,${icon}">
  <h1>Tab Harbor</h1>
  <p>Arc-style sidebar: pinned tabs &amp; Spaces</p>
</body></html>`;

const work = mkdtempSync(path.join(os.tmpdir(), "harbor-promo-"));
const file = path.join(work, "tile.html");
writeFileSync(file, html);

const browser = await chromium.launch({ channel: "chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 2 });
await page.goto("file://" + file);
const out = path.join(OUT, "promo-tile-440x280.png");
await page.screenshot({ path: out, scale: "css" });
console.log("wrote", out);
await browser.close();
