// ストア用スクリーンショット(1280x800)を日英 2 セット生成する:
// デモデータを流し込んだパネルを撮影し、キャプション付きフレームに合成する。
//
// 事前準備(任意の作業ディレクトリで):
//   npm i playwright && npx playwright install chromium --no-shell
// 実行: node scripts/gen-store-shots.mjs
//   → dist/store-assets/screenshot-{ja,en}-{1..3}.png
//
// UI 言語の固定方法: ブラウザの UI ロケールは macOS では --lang で変えられないため、
// 拡張を一時ディレクトリへコピーし、_locales の ja / en 両方を対象言語のカタログで
// 上書きしてからロードする(どの OS ロケールでも対象言語で表示される)。
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, cpSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(EXT, "dist", "store-assets");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// ロケールごとのデモデータとキャプション
// ---------------------------------------------------------------------------
const LOCALES = {
  ja: {
    demoTabs: ["週次レポート", "API 設計メモ", "リリース計画"],
    personalTab: "読みかけの記事",
    seed: {
      workPins: ["社内ポータル", "メール", "カレンダー"],
      folder: { title: "プロジェクト", children: ["課題トラッカー", "Wiki", "CI ダッシュボード"] },
      personalPins: ["ニュース", "音楽", "レシピ"],
      globalPins: ["検索", "チャット", "カレンダー", "AI アシスタント"],
    },
    fixture: {
      s1: { title: "仕事", pins: ["ポータル", "メール", "Wiki"], tab: "資料" },
      s2: { title: "プライベート", pins: ["ニュース", "音楽"] },
    },
    captions: [
      { title: "Pin と Space でタブを整理", sub: "全 Space 共通の Global Pin、フォルダ階層つきの Space Pin。一時タブは下のエリアに分離。" },
      { title: "Space でコンテキストを切り替え", sub: "仕事・個人などの作業スペースをワンクリックで切替。テーマ色つき、復元はメモリに優しい遅延方式。" },
      { title: "Arc からワンクリックでインポート", sub: "Arc の Space・Pin・フォルダ構造をそのまま持ち込めます。" },
    ],
  },
  en: {
    demoTabs: ["Weekly report", "API design notes", "Release plan"],
    personalTab: "Reading list",
    seed: {
      workPins: ["Portal", "Mail", "Calendar"],
      folder: { title: "Project", children: ["Issue tracker", "Wiki", "CI dashboard"] },
      personalPins: ["News", "Music", "Recipes"],
      globalPins: ["Search", "Chat", "Calendar", "AI assistant"],
    },
    fixture: {
      s1: { title: "Work", pins: ["Portal", "Mail", "Wiki"], tab: "Docs" },
      s2: { title: "Personal", pins: ["News", "Music"] },
    },
    captions: [
      { title: "Organize tabs with Pins and Spaces", sub: "Global Pins shared across every Space, folder hierarchies for pins — and temporary tabs kept separate below." },
      { title: "Switch contexts in one click", sub: "Keep work and personal Spaces with their own theme colors. Tabs restore lazily to save memory." },
      { title: "One-click import from Arc", sub: "Bring over your Spaces, pins and folder structure from Arc." },
    ],
  },
};

// 対象言語のカタログで _locales を丸ごと上書きした拡張のコピーを作る
function prepareExtDir(locale, workDir) {
  const dir = path.join(workDir, "ext-" + locale);
  for (const item of ["manifest.json", "background.js", "sidepanel", "icons", "_locales"]) {
    cpSync(path.join(EXT, item), path.join(dir, item), { recursive: true });
  }
  const catalog = readFileSync(path.join(EXT, "_locales", locale, "messages.json"));
  writeFileSync(path.join(dir, "_locales", "ja", "messages.json"), catalog);
  writeFileSync(path.join(dir, "_locales", "en", "messages.json"), catalog);
  return dir;
}

function buildFixture(f) {
  const items = [];
  const pinIds = f.s1.pins.map((_, i) => "a" + i);
  items.push("p1", { id: "p1", childrenIds: pinIds, data: { itemContainer: {} } });
  f.s1.pins.forEach((title, i) =>
    items.push("a" + i, { id: "a" + i, parentID: "p1", data: { tab: { savedTitle: title, savedURL: `https://s1-${i}.example.com/` } } })
  );
  items.push("u1", { id: "u1", childrenIds: ["d"], data: { itemContainer: {} } });
  items.push("d", { id: "d", parentID: "u1", data: { tab: { savedTitle: f.s1.tab, savedURL: "https://docs.example.com/" } } });
  const pin2Ids = f.s2.pins.map((_, i) => "b" + i);
  items.push("p2", { id: "p2", childrenIds: pin2Ids, data: { itemContainer: {} } });
  f.s2.pins.forEach((title, i) =>
    items.push("b" + i, { id: "b" + i, parentID: "p2", data: { tab: { savedTitle: title, savedURL: `https://s2-${i}.example.com/` } } })
  );
  items.push("u2", { id: "u2", childrenIds: [], data: { itemContainer: {} } });
  return {
    sidebar: {
      containers: [
        {
          spaces: [
            "s1", { id: "s1", title: f.s1.title, containerIDs: ["pinned", "p1", "unpinned", "u1"] },
            "s2", { id: "s2", title: f.s2.title, containerIDs: ["pinned", "p2", "unpinned", "u2"] },
          ],
          items,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// 1 ロケール分の撮影
// ---------------------------------------------------------------------------
async function generate(locale) {
  const conf = LOCALES[locale];
  const work = mkdtempSync(path.join(os.tmpdir(), `harbor-shot-${locale}-`));
  const extDir = prepareExtDir(locale, work);

  const demoTabFiles = conf.demoTabs.map((title, i) => {
    const file = path.join(work, `tab-${i}.html`);
    writeFileSync(file, `<title>${title}</title>`);
    return file;
  });
  const fixturePath = path.join(work, "arc-demo.json");
  writeFileSync(fixturePath, JSON.stringify(buildFixture(conf.fixture)));

  const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(os.tmpdir(), "harbor-prof-")), {
    channel: "chromium",
    headless: true,
    viewport: { width: 380, height: 700 },
    deviceScaleFactor: 2, // 高解像度で撮る
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  await sleep(1500);

  // デモの Space / Pin / Global Pin を直接シード
  await sw.evaluate(async (seed) => {
    // インストール時に作られたデフォルト Space(Home)のレコードを残さない。
    // 残っているとパネルタブが Home のグループに収容され、以降の表示が乱れる
    await chrome.storage.local.clear();
    const mk = () => crypto.randomUUID();
    const pin = (title, i, host) => ({ id: mk(), title, url: `https://${host}-${i}.example.com/` });
    const workSpace = {
      id: mk(), name: "Work", color: "blue",
      pins: [
        ...seed.workPins.map((t, i) => pin(t, i, "work")),
        { id: mk(), title: seed.folder.title, collapsed: false, children: seed.folder.children.map((t, i) => pin(t, i, "proj")) },
      ],
    };
    const personal = {
      id: mk(), name: "Personal", color: "purple",
      pins: seed.personalPins.map((t, i) => pin(t, i, "personal")),
    };
    const globalPins = seed.globalPins.map((t, i) => pin(t, i, "global"));
    await chrome.storage.local.set({
      spacesOrder: [workSpace.id, personal.id],
      ["space:" + workSpace.id]: workSpace,
      ["space:" + personal.id]: personal,
      globalPins,
    });
  }, conf.seed);

  const panel = await ctx.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel/panel.html`);
  await sleep(1000);

  // 撮影用にパネルをタブとして開いているため、タブ一覧に「Tab Harbor」自身が
  // 写り込む(実運用のサイドパネルでは起きない)。再レンダリングのたびに間引く
  await panel.evaluate(() => {
    const prune = () => {
      for (const row of document.querySelectorAll("#tab-list .row")) {
        if (row.querySelector(".label")?.textContent === "Tab Harbor") row.remove();
      }
    };
    new MutationObserver(prune).observe(document.querySelector("#tab-list"), { childList: true });
    prune();
  });

  // ブラウザ自身の新規タブページはシステムロケールのタイトル(例: 「新しいタブ」)に
  // なるため、Space 切替時に作られる NTP はデモページへ差し替える
  const replaceNtp = async (file) => {
    const ntp = ctx.pages().find((p) => p.url().startsWith("chrome://new"));
    if (ntp) await ntp.goto("file://" + file);
  };

  // Work に正式に切り替えてからデモタブを開く(自動収容される)
  await panel.locator(".chip", { hasText: "W" }).first().click();
  await sleep(1200);
  await replaceNtp(demoTabFiles[0]);
  for (const file of demoTabFiles.slice(1)) {
    const p = await ctx.newPage();
    await p.goto("file://" + file);
  }
  await sleep(1500);
  await panel.bringToFront();
  await sleep(300);

  const shoot = async (name) => {
    const p = path.join(work, name);
    await panel.screenshot({ path: p });
    return p;
  };

  // ショット 1: Work Space(Global Pin + フォルダ付き Pin + タブ)
  const shot1 = await shoot("raw-1.png");
  // ショット 2: Personal Space(テーマ色違い)
  await panel.locator(".chip", { hasText: "P" }).first().click();
  await sleep(1500);
  const personalFile = path.join(work, "tab-personal.html");
  writeFileSync(personalFile, `<title>${conf.personalTab}</title>`);
  await replaceNtp(personalFile);
  await sleep(1200);
  const shot2 = await shoot("raw-2.png");
  // ショット 3: Arc インポートのプレビュー
  await panel.setInputFiles("#arc-file", fixturePath);
  await sleep(600);
  const shot3 = await shoot("raw-3.png");
  await panel.click("#import-cancel");

  // ---- 1280x800 に合成 ------------------------------------------------------
  const shots = [shot1, shot2, shot3];
  const framer = await ctx.newPage();
  await framer.setViewportSize({ width: 1280, height: 800 });
  const brandIcon = readFileSync(path.join(EXT, "icons/icon128.png")).toString("base64");
  for (let i = 0; i < conf.captions.length; i++) {
    const { title, sub } = conf.captions[i];
    const b64 = readFileSync(shots[i]).toString("base64");
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
        <div class="brand"><img src="data:image/png;base64,${brandIcon}">Tab Harbor</div>
        <h1>${title}</h1><p>${sub}</p>
      </div>
      <img class="shot" src="data:image/png;base64,${b64}">
    </body></html>`;
    const file = path.join(work, `frame-${i}.html`);
    writeFileSync(file, html);
    await framer.goto("file://" + file);
    await sleep(400);
    // scale:"css" で deviceScaleFactor に関係なく正確に 1280x800 で出力する
    // (Chrome Web Store は 1280x800 ちょうどのみ受け付ける)
    const out = path.join(OUT, `screenshot-${locale}-${i + 1}.png`);
    await framer.screenshot({ path: out, scale: "css" });
    console.log("wrote", out);
  }

  await ctx.close();
}

for (const locale of Object.keys(LOCALES)) {
  await generate(locale);
}
