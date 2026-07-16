// 遅延復元(v0.1.4 仕様):
// - Space 切替時に savedTabs を自動で開かない(常に新規タブ 1 枚 + 復元バー)
// - ユーザーがグループを閉じた場合(userClosed)は復元バー自体を出さない
// - 復元ボタンで全 URL を開き、切替時に作られた空タブは自動で閉じる
import { launch, openPanel, check, finish, sleep, tmpdir, writePage, msg } from "./helper.mjs";

const dir = tmpdir();
const { ctx, sw, extId } = await launch();
const errors = [];
const panel = await openPanel(ctx, extId, errors);

// Work Space を作り、3 ページ開いて snapshot させる
await panel.locator(".chip.add").click();
await panel.fill("#space-name-input", "Work");
await panel.click("#dialog-save");
await sleep(1200);
for (const [f, t] of [["w1.html", "Work 1"], ["w2.html", "Work 2"], ["w3.html", "Work 3"]]) {
  const p = await ctx.newPage();
  await p.goto(writePage(dir, f, t));
}
await sleep(2500); // 収容 + snapshot(1.5s デバウンス)

const workTabs = () =>
  sw.evaluate(async () => {
    const groups = await chrome.tabGroups.query({ title: "Work" });
    if (!groups.length) return [];
    const tabs = await chrome.tabs.query({ groupId: groups[0].id });
    return tabs.map((t) => t.url || t.pendingUrl);
  });
const killWork = () =>
  sw.evaluate(async () => {
    const groups = await chrome.tabGroups.query({ title: "Work" });
    for (const g of groups) {
      const tabs = await chrome.tabs.query({ groupId: g.id });
      await chrome.tabs.remove(tabs.map((t) => t.id));
    }
  });
// ブラウザ再起動相当: session の userClosed フラグを消す
const clearUserClosed = () =>
  sw.evaluate(async () => {
    const all = await chrome.storage.session.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith("userClosed:"));
    if (keys.length) await chrome.storage.session.remove(keys);
    return keys.length;
  });
const barCount = () => panel.$$eval(".restore-bar", (els) => els.length);
const isBlank = (u) => /newtab|^about:blank$|^$/.test(u ?? "");

check("準備: Work グループに 3 タブ + 空タブ", (await workTabs()).filter((u) => u.includes("w")).length >= 3);

// --- 1. 🔍 ユーザーがグループを閉じた場合: 復元バーは出ない ------------------------
await panel.locator(".chip", { hasText: "H" }).first().click();
await sleep(1200);
await killWork();
await sleep(800);
await panel.locator(".chip", { hasText: "W" }).first().click();
await sleep(2000);
let tabs = await workTabs();
check("🔍 userClosed: 新規タブ 1 枚のみでバーは出ない", tabs.length === 1 && isBlank(tabs[0]) && (await barCount()) === 0, JSON.stringify(tabs));
const savedKept = await sw.evaluate(async () => {
  const all = await chrome.storage.local.get(null);
  const key = Object.keys(all).find((k) => k.startsWith("savedTabs:") && JSON.stringify(all[k]).includes("w1"));
  return !!key;
});
check("🔍 userClosed でも savedTabs 自体は残る", savedKept);

// --- 2. 再起動相当(userClosed 無し)→ バー表示、自動では開かない -------------------
await panel.locator(".chip", { hasText: "H" }).first().click();
await sleep(1200);
await killWork();
await sleep(800);
await clearUserClosed();
await panel.locator(".chip", { hasText: "W" }).first().click();
await sleep(2000);
tabs = await workTabs();
const barText = await panel.textContent(".restore-bar .restore-btn").catch(() => "");
check("切替: savedTabs を自動で開かず新規タブ 1 枚のみ", tabs.length === 1 && isBlank(tabs[0]), JSON.stringify(tabs));
check("復元バー: 全 3 件の復元を提示", barText === (await msg(panel, "restoreTabs", "3")), barText);

// --- 3. 復元ボタン → 全タブが戻り、空タブは自動で閉じられる ------------------------
await panel.click(".restore-bar .restore-btn");
await sleep(2000);
tabs = await workTabs();
check(
  "復元実行: 3 タブが戻り、空タブは閉じられる",
  tabs.length === 3 && tabs.every((u) => u.includes("w")) && !tabs.some(isBlank),
  JSON.stringify(tabs)
);
check("復元実行: バーが消える", (await barCount()) === 0);

// --- 4. 🔍 破棄ボタン → バーが消えタブは増えない ------------------------------------
await sleep(2000); // snapshot を待つ
await panel.locator(".chip", { hasText: "H" }).first().click();
await sleep(1200);
await killWork();
await sleep(800);
await clearUserClosed();
await panel.locator(".chip", { hasText: "W" }).first().click();
await sleep(2000);
check("🔍 再度 1 タブ + バー表示", (await workTabs()).length === 1 && (await barCount()) === 1);
await panel.click(".restore-bar .restore-discard");
await sleep(800);
const pendingKeys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith("pendingRestore:")));
check(
  "🔍 破棄: バーが消えタブは増えず、pendingRestore も消える",
  (await barCount()) === 0 && (await workTabs()).length === 1 && pendingKeys.length === 0,
  JSON.stringify(pendingKeys)
);

await finish(ctx, errors);
