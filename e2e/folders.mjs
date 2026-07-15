// Pin フォルダ: 作成(デフォルト折りたたみ)/ DnD 出し入れ / リネーム / 2 段階削除
// パネルの DnD ハンドラは dataTransfer 非依存のため dragstart/drop の合成イベントで駆動できる
import { launch, openPanel, check, finish, sleep, tmpdir, writePage, labels, msg } from "./helper.mjs";

const dir = tmpdir();
const { ctx, sw, extId } = await launch();
const errors = [];

const p1 = await ctx.newPage();
await p1.goto(writePage(dir, "a.html", "Doc A"));
const p2 = await ctx.newPage();
await p2.goto(writePage(dir, "b.html", "Doc B"));
await sleep(1200);

const panel = await openPanel(ctx, extId, errors);

// 2 つのタブを Pin 化
const pinToSpace = await msg(panel, "pinToSpaceTitle");
for (const name of ["Doc A", "Doc B"]) {
  const row = panel.locator("#tab-list .row", { hasText: name }).first();
  await row.hover();
  await row.locator(`[title="${pinToSpace}"]`).click();
  await sleep(500);
}
check("準備: Pin が 2 件", (await labels(panel, "#pin-list")).length === 2);

// --- 1. フォルダ作成(デフォルトで閉じた状態)---------------------------------
await panel.click("#new-folder");
await panel.fill("#folder-name-input", "Work stuff");
await panel.click("#folder-form button[type=submit]");
await sleep(700);
let l = await labels(panel, "#pin-list");
check("フォルダ作成: 行が追加される", l.includes("Work stuff"), JSON.stringify(l));
check("フォルダ作成: デフォルトは折りたたみ", !(await panel.$eval("#pin-list .row.folder-row", (el) => el.classList.contains("folder-open"))));

// --- 2. Pin をフォルダへドラッグ → 展開して確認 --------------------------------
await panel.locator("#pin-list .row", { hasText: "Doc A" }).first().dispatchEvent("dragstart");
await panel.locator("#pin-list .row.folder-row").dispatchEvent("drop");
await sleep(700);
check("DnD: バッジが 1 になり中身は隠れたまま", (await panel.textContent("#pin-list .row.folder-row .badge")) === "1" && !(await labels(panel, "#pin-list")).includes("Doc A"));

await panel.locator("#pin-list .row.folder-row").click(); // 展開
await sleep(600);
const inner = await panel.$eval("#pin-list .row.folder-row + .row", (el) => ({ pad: el.style.paddingLeft, text: el.querySelector(".label").textContent }));
check("展開: Doc A がインデント表示", inner.text.includes("Doc A") && inner.pad === "24px", JSON.stringify(inner));

// --- 3. フォルダ内 Pin のクリック ------------------------------------------------
await p2.bringToFront();
await sleep(300);
await panel.locator("#pin-list .row", { hasText: "Doc A" }).click();
await sleep(700);
const activeUrl = await sw.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? "");
check("フォルダ内 Pin クリック: 既存タブへフォーカス", activeUrl.includes("a.html"), activeUrl);

// --- 4. リネーム(ダブルクリック)------------------------------------------------
await panel.locator("#pin-list .row.folder-row").dblclick();
await sleep(300);
const prefilled = await panel.inputValue("#folder-name-input");
await panel.fill("#folder-name-input", "Renamed");
await panel.click("#folder-form button[type=submit]");
await sleep(700);
check("リネーム: 事前入力 + 反映", prefilled === "Work stuff" && (await labels(panel, "#pin-list")).includes("Renamed"));

// dblclick で click(トグル)も 2 回走るので、現在の開閉状態に合わせて開いておく
if (!(await panel.$eval("#pin-list .row.folder-row", (el) => el.classList.contains("folder-open")))) {
  await panel.locator("#pin-list .row.folder-row").click();
  await sleep(600);
}

// --- 5. 🔍 Pin をルートへ戻す(別 Pin の位置へドロップ)--------------------------
await panel.locator("#pin-list .row", { hasText: "Doc A" }).first().dispatchEvent("dragstart");
await panel.locator("#pin-list .row", { hasText: "Doc B" }).first().dispatchEvent("drop");
await sleep(700);
const shape = await sw.evaluate(async () => {
  const all = await chrome.storage.local.get(null);
  const space = Object.values(all).find((v) => v?.pins);
  const walk = (items) => items.map((i) => (Array.isArray(i.children) ? `[${i.title}:${walk(i.children)}]` : i.title[4]));
  return walk(space.pins).join(",");
});
check("🔍 ルートへ戻す: Doc A は Doc B の前、フォルダは空", shape === "A,B,[Renamed:]", shape);

// --- 6. 🔍 フォルダ削除は 2 段階 --------------------------------------------------
const folderRow = panel.locator("#pin-list .row.folder-row");
await folderRow.hover();
await folderRow.locator(".row-btn").click();
check("🔍 削除 1 回目: 確認状態でまだ消えない", (await panel.$$eval("#pin-list .row.folder-row", (els) => els.length)) === 1 && (await folderRow.locator(".row-btn").evaluate((b) => b.classList.contains("confirming"))));
await folderRow.locator(".row-btn").click();
await sleep(700);
check("🔍 削除 2 回目: フォルダが消え Pin は残る", (await panel.$$eval("#pin-list .row.folder-row", (els) => els.length)) === 0 && (await labels(panel, "#pin-list")).length === 2);

await finish(ctx, errors);
