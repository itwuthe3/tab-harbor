// タブの Space 間移動(v0.1.5):
// 右クリックメニュー / チップへのドラッグ&ドロップ / 非ライブ Space への移動(savedTabs 追記)
import { launch, openPanel, check, finish, sleep, tmpdir, writePage, labels, msg } from "./helper.mjs";

const dir = tmpdir();
const { ctx, sw, extId } = await launch();
const errors = [];

const pages = {};
for (const [f, t] of [["a.html", "Doc A"], ["b.html", "Doc B"], ["c.html", "Doc C"]]) {
  const p = await ctx.newPage();
  await p.goto(writePage(dir, f, t));
  pages[t] = p;
}
await sleep(1500);

const panel = await openPanel(ctx, extId, errors);

const groupTabs = (title) =>
  sw.evaluate(async (t) => {
    const groups = await chrome.tabGroups.query({ title: t });
    if (!groups.length) return null;
    const tabs = await chrome.tabs.query({ groupId: groups[0].id });
    return tabs.map((x) => x.url || x.pendingUrl);
  }, title);

// Work Space を作成(作成直後は Work がアクティブ)→ Home に戻る
await panel.locator(".chip.add").click();
await panel.fill("#space-name-input", "Work");
await panel.click("#dialog-save");
await sleep(1200);
await panel.locator(".chip", { hasText: "H" }).first().click();
await sleep(1200);

// --- 1. 右クリックメニューで移動(ライブ Space へ)------------------------------
await panel.locator("#tab-list .row", { hasText: "Doc A" }).first().click({ button: "right" });
await sleep(300);
const header = await panel.textContent(".context-menu .context-menu-header").catch(() => "");
check("メニュー: 「別の Space に移動」ヘッダーが出る", header === (await msg(panel, "moveToSpaceHeader")), header);
await panel.locator(".context-menu .context-menu-item", { hasText: "Work" }).click();
await sleep(1000);
check(
  "メニュー移動: Doc A が Work グループへ移り、タブ一覧から消える",
  (await groupTabs("Work"))?.some((u) => u.includes("a.html")) &&
    !(await labels(panel, "#tab-list")).some((t) => t.includes("Doc A"))
);

// --- 2. チップへのドラッグ&ドロップで移動 --------------------------------------
// タブ行の dragstart は dataTransfer を参照するため DataTransfer を渡して合成する
const dt = await panel.evaluateHandle(() => new DataTransfer());
const rowB = panel.locator("#tab-list .row", { hasText: "Doc B" }).first();
await rowB.dispatchEvent("dragstart", { dataTransfer: dt });
const workChip = panel.locator(".chip", { hasText: "W" }).first();
await workChip.dispatchEvent("dragover", { dataTransfer: dt });
const highlighted = await workChip.evaluate((el) => el.classList.contains("drop-target"));
await workChip.dispatchEvent("drop", { dataTransfer: dt });
await sleep(1000);
check("DnD: ドラッグ中にチップがハイライトされる", highlighted);
check(
  "DnD 移動: Doc B も Work グループへ",
  (await groupTabs("Work"))?.some((u) => u.includes("b.html")) &&
    !(await labels(panel, "#tab-list")).some((t) => t.includes("Doc B")),
  JSON.stringify(await groupTabs("Work"))
);

// --- 3. 🔍 非ライブ Space への移動: savedTabs に追記されタブは閉じる ---------------
// Work グループを消して(userClosed も除去 = 再起動相当)非ライブ状態にする
await sw.evaluate(async () => {
  const groups = await chrome.tabGroups.query({ title: "Work" });
  for (const g of groups) {
    const tabs = await chrome.tabs.query({ groupId: g.id });
    await chrome.tabs.remove(tabs.map((t) => t.id));
  }
});
await sleep(2500); // snapshot(1.5s)を待って savedTabs:Work を確定させる
await sw.evaluate(async () => {
  const all = await chrome.storage.session.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith("userClosed:"));
  if (keys.length) await chrome.storage.session.remove(keys);
});

const tabsBefore = await sw.evaluate(async () => (await chrome.tabs.query({ currentWindow: true })).length);
await panel.locator("#tab-list .row", { hasText: "Doc C" }).first().click({ button: "right" });
await sleep(300);
await panel.locator(".context-menu .context-menu-item", { hasText: "Work" }).click();
await sleep(1000);
const tabsAfter = await sw.evaluate(async () => (await chrome.tabs.query({ currentWindow: true })).length);
const savedWork = await sw.evaluate(async () => {
  const all = await chrome.storage.local.get(null);
  const key = Object.keys(all).find((k) => k.startsWith("savedTabs:") && JSON.stringify(all[k]).includes("c.html"));
  return all[key] ?? null;
});
check(
  "🔍 非ライブ移動: タブが閉じ savedTabs に追記される",
  tabsAfter === tabsBefore - 1 && Array.isArray(savedWork),
  JSON.stringify(savedWork)
);

// 移動先へ切替 → 復元バー経由で Doc C を開ける
await panel.locator(".chip", { hasText: "W" }).first().click();
await sleep(2000);
const barText = await panel.textContent(".restore-bar .restore-btn").catch(() => "");
check("🔍 切替後: 復元バーに移動分が含まれる", /\d/.test(barText), barText);
await panel.click(".restore-bar .restore-btn");
await sleep(2000);
check("🔍 復元で Doc C が Work に開く", (await groupTabs("Work"))?.some((u) => u.includes("c.html")), JSON.stringify(await groupTabs("Work")));

// --- 4. 🔍 Space が 1 つだけの場合はメニューを出さない ------------------------------
// Work を削除して Home のみにする
await panel.click("#edit-space");
await panel.click("#delete-space");
await panel.click("#delete-space");
await sleep(1500);
await panel.locator("#tab-list .row").first().click({ button: "right" });
await sleep(300);
check("🔍 Space が 1 つならメニューは出ない", (await panel.$$eval(".context-menu", (els) => els.length)) === 0);

await finish(ctx, errors);
