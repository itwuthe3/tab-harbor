// 「ツールバーにピン留め」ガイドのストア用画像(1280x800)を生成する。
// 素材のブラウザスクリーンショット(手動撮影)を 2 段組で合成する。
//
// 実行: node scripts/gen-pin-guide-shot.mjs <素材ディレクトリ>
//   素材: chrome_pin.png / chrome_icon.png / edge_pin.png / edge_icon.png
//   出力: dist/store-assets/pin-guide-{chrome,edge}-{ja,en}.png
//   (en 版もスクショ素材は共通。キャプションのみ英語)
//
// 注意: 素材に個人情報(天気ウィジェットの地名など)が写っている場合は、
// 事前にぼかしてから渡すこと。
import { chromium } from "playwright";
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const srcDir = process.argv[2];
if (!srcDir) {
  console.error("usage: node scripts/gen-pin-guide-shot.mjs <screenshots-dir>");
  process.exit(1);
}

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(EXT, "dist", "store-assets");
mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(path.join(os.tmpdir(), "harbor-pinguide-"));
const b64 = (p) => readFileSync(p).toString("base64");

const CAPTIONS = {
  ja: {
    title: "ワンクリックで開けるようにする",
    sub: "拡張機能メニュー(パズルアイコン)で Tab Harbor をピン留めしておくと、アドレスバー横のアイコンをクリックするだけでサイドバーが開きます。",
    step1: "拡張機能メニューでピン留め",
    step2: "以降はワンクリックで開く",
  },
  en: {
    title: "Open it with a single click",
    sub: "Pin Tab Harbor in the extensions menu (the puzzle icon), and the sidebar opens with one click on the anchor icon next to the address bar.",
    step1: "Pin it in the extensions menu",
    step2: "Then it is one click away",
  },
};

const browser = await chromium.launch({ channel: "chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

for (const [target, locale] of ["chrome", "edge"].flatMap((t) => ["ja", "en"].map((l) => [t, l]))) {
  const CAPTION = CAPTIONS[locale];
  const pinImg = path.join(srcDir, `${target}_pin.png`);
  const iconImg = path.join(srcDir, `${target}_icon.png`);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin:0; box-sizing:border-box; }
    body { width:1280px; height:800px; overflow:hidden;
      font-family:"Hiragino Sans",system-ui,sans-serif;
      background: linear-gradient(135deg,#0d2438 0%,#123b5c 55%,#1b5580 100%);
      display:flex; align-items:center; justify-content:space-between; padding:0 70px; }
    .text { color:#eaf6ff; max-width:480px; }
    .text h1 { font-size:42px; font-weight:700; line-height:1.35; margin-bottom:22px; }
    .text p { font-size:19px; line-height:1.8; opacity:.85; }
    .brand { display:flex; align-items:center; gap:12px; margin-bottom:40px;
      font-size:22px; font-weight:700; letter-spacing:.02em; }
    .brand img { width:40px; height:40px; border-radius:9px; }
    .steps { display:flex; flex-direction:column; gap:26px; width:560px; }
    .step { position:relative; }
    .step img { width:100%; border-radius:12px; display:block;
      box-shadow:0 20px 50px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08); }
    .step .label { display:flex; align-items:center; gap:10px; margin-bottom:10px;
      color:#eaf6ff; font-size:17px; font-weight:600; }
    .step .num { width:26px; height:26px; border-radius:50%; background:#4a9fe8;
      color:#fff; font-size:15px; font-weight:700; display:inline-flex;
      align-items:center; justify-content:center; flex:none; }
  </style></head><body>
    <div class="text">
      <div class="brand"><img src="data:image/png;base64,${b64(path.join(EXT, "icons/icon128.png"))}">Tab Harbor</div>
      <h1>${CAPTION.title}</h1><p>${CAPTION.sub}</p>
    </div>
    <div class="steps">
      <div class="step"><div class="label"><span class="num">1</span>${CAPTION.step1}</div>
        <img src="data:image/png;base64,${b64(pinImg)}"></div>
      <div class="step"><div class="label"><span class="num">2</span>${CAPTION.step2}</div>
        <img src="data:image/png;base64,${b64(iconImg)}"></div>
    </div>
  </body></html>`;
  const file = path.join(work, `frame-${target}-${locale}.html`);
  writeFileSync(file, html);
  await page.goto("file://" + file);
  await new Promise((r) => setTimeout(r, 400));
  const out = path.join(OUT, `pin-guide-${target}-${locale}.png`);
  await page.screenshot({ path: out, scale: "css" });
  console.log("wrote", out);
}
await browser.close();
