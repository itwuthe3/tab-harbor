// ストア用スクリーンショット(1280x800)を生成する:
// デモデータを流し込んだパネルを撮影し、キャプション付きフレームに合成する。
//
// 事前準備(任意の作業ディレクトリで):
//   npm i playwright && npx playwright install chromium --no-shell
// 実行: node scripts/gen-store-shots.mjs → dist/store-assets/ に出力
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SCRATCH = mkdtempSync(path.join(os.tmpdir(), "harbor-shot-work-"));
const OUT = path.join(EXT, "dist", "store-assets");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// デモ用タブページ
const demoTabs = [
  ["tab-report.html", "週次レポート"],
  ["tab-api.html", "API 設計メモ"],
  ["tab-release.html", "リリース計画"],
];
for (const [file, title] of demoTabs) {
  writeFileSync(path.join(SCRATCH, file), `<title>${title}</title>`);
}

// Arc インポートのデモ用フィクスチャ
const importFixture = {
  sidebar: {
    containers: [
      {
        spaces: [
          "s1", { id: "s1", title: "仕事", containerIDs: ["pinned", "p1", "unpinned", "u1"] },
          "s2", { id: "s2", title: "プライベート", containerIDs: ["pinned", "p2", "unpinned", "u2"] },
        ],
        items: [
          "p1", { id: "p1", childrenIds: ["a", "b", "c"], data: { itemContainer: {} } },
          "a", { id: "a", parentID: "p1", data: { tab: { savedTitle: "ポータル", savedURL: "https://portal.example.com/" } } },
          "b", { id: "b", parentID: "p1", data: { tab: { savedTitle: "メール", savedURL: "https://mail.example.com/" } } },
          "c", { id: "c", parentID: "p1", data: { tab: { savedTitle: "Wiki", savedURL: "https://wiki.example.com/" } } },
          "u1", { id: "u1", childrenIds: ["d"], data: { itemContainer: {} } },
          "d", { id: "d", parentID: "u1", data: { tab: { savedTitle: "資料", savedURL: "https://docs.example.com/" } } },
          "p2", { id: "p2", childrenIds: ["e", "f"], data: { itemContainer: {} } },
          "e", { id: "e", parentID: "p2", data: { tab: { savedTitle: "ニュース", savedURL: "https://news.example.com/" } } },
          "f", { id: "f", parentID: "p2", data: { tab: { savedTitle: "音楽", savedURL: "https://music.example.com/" } } },
          "u2", { id: "u2", childrenIds: [], data: { itemContainer: {} } },
        ],
      },
    ],
  },
};
const fixturePath = path.join(SCRATCH, "store-demo-arc.json");
writeFileSync(fixturePath, JSON.stringify(importFixture));

const profile = mkdtempSync(path.join(os.tmpdir(), "harbor-shots-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: 380, height: 700 },
  deviceScaleFactor: 2, // 高解像度で撮る
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
});
let sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
const extId = new URL(sw.url()).host;
await sleep(1500);

// デモの Space / Pin を直接シード
await sw.evaluate(async () => {
  const mk = () => crypto.randomUUID();
  const work = {
    id: mk(), name: "Work", color: "blue",
    pins: [
      { id: mk(), title: "社内ポータル", url: "https://portal.example.com/" },
      { id: mk(), title: "メール", url: "https://mail.example.com/" },
      { id: mk(), title: "カレンダー", url: "https://calendar.example.com/" },
      { id: mk(), title: "プロジェクト", children: [
        { id: mk(), title: "課題トラッカー", url: "https://issues.example.com/" },
        { id: mk(), title: "Wiki", url: "https://wiki.example.com/" },
        { id: mk(), title: "CI ダッシュボード", url: "https://ci.example.com/" },
      ]},
    ],
  };
  const personal = {
    id: mk(), name: "Personal", color: "purple",
    pins: [
      { id: mk(), title: "ニュース", url: "https://news.example.com/" },
      { id: mk(), title: "音楽", url: "https://music.example.com/" },
      { id: mk(), title: "レシピ", url: "https://recipes.example.com/" },
    ],
  };
  await chrome.storage.sync.set({
    spacesOrder: [work.id, personal.id],
    ["space:" + work.id]: work,
    ["space:" + personal.id]: personal,
  });
});

const panel = await ctx.newPage();
await panel.goto(`chrome-extension://${extId}/sidepanel/panel.html`);
await sleep(1000);

// Work に正式に切り替えてからデモタブを開く(自動収容される)
await panel.locator(".chip", { hasText: "W" }).first().click();
await sleep(1200);
for (const [file] of demoTabs) {
  const p = await ctx.newPage();
  await p.goto("file://" + path.join(SCRATCH, file));
}
await sleep(1500);
await panel.bringToFront();
await sleep(300);

const rawShots = [];
const shoot = async (name) => {
  const p = path.join(SCRATCH, name);
  await panel.screenshot({ path: p });
  rawShots.push(p);
  return p;
};

// ショット 1: Work Space(フォルダ付き Pin + タブ)
const shot1 = await shoot("store-raw-1.png");
// ショット 2: Personal Space(テーマ色違い)
await panel.locator(".chip", { hasText: "P" }).first().click();
await sleep(1500);
const shot2 = await shoot("store-raw-2.png");
// ショット 3: Arc インポートのプレビュー
await panel.setInputFiles("#arc-file", fixturePath);
await sleep(600);
const shot3 = await shoot("store-raw-3.png");
await panel.click("#import-cancel");

// ---- 1280x800 に合成 --------------------------------------------------------
const captions = [
  { img: shot1, title: "Pin と Space でタブを整理", sub: "よく使うサイトはフォルダ階層つきの Pin に。一時タブは下のエリアに分離。" },
  { img: shot2, title: "Space でコンテキストを切り替え", sub: "仕事・個人などの作業スペースをワンクリックで切替。テーマ色つき。" },
  { img: shot3, title: "Arc からワンクリックでインポート", sub: "Arc の Space・Pin・フォルダ構造をそのまま持ち込めます。" },
];

const framer = await ctx.newPage();
await framer.setViewportSize({ width: 1280, height: 800 });
for (let i = 0; i < captions.length; i++) {
  const { img, title, sub } = captions[i];
  const b64 = readFileSync(img).toString("base64");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { margin:0; box-sizing:border-box; }
    body { width:1280px; height:800px; overflow:hidden;
      font-family:"Hiragino Sans",system-ui,sans-serif;
      background: linear-gradient(135deg,#0d2438 0%,#123b5c 55%,#1b5580 100%);
      display:flex; align-items:center; justify-content:space-between; padding:0 90px; }
    .text { color:#eaf6ff; max-width:520px; }
    .text h1 { font-size:44px; font-weight:700; line-height:1.35; margin-bottom:22px; }
    .text p { font-size:20px; line-height:1.8; opacity:.85; }
    .brand { display:flex; align-items:center; gap:12px; margin-bottom:40px;
      font-size:22px; font-weight:700; letter-spacing:.02em; }
    .brand img { width:40px; height:40px; border-radius:9px; }
    .shot { height:700px; border-radius:14px;
      box-shadow:0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
  </style></head><body>
    <div class="text">
      <div class="brand"><img src="data:image/png;base64,${readFileSync(path.join(EXT, "icons/icon128.png")).toString("base64")}">Tab Harbor</div>
      <h1>${title}</h1><p>${sub}</p>
    </div>
    <img class="shot" src="data:image/png;base64,${b64}">
  </body></html>`;
  const file = path.join(SCRATCH, `frame-${i}.html`);
  writeFileSync(file, html);
  await framer.goto("file://" + file);
  await sleep(400);
  // scale:"css" で deviceScaleFactor に関係なく正確に 1280x800 で出力する
  // (Chrome Web Store は 1280x800 ちょうどのみ受け付ける)
  await framer.screenshot({ path: path.join(OUT, `screenshot-${i + 1}.png`), scale: "css" });
  console.log("wrote", path.join(OUT, `screenshot-${i + 1}.png`));
}

await ctx.close();
