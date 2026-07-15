// 遅延復元: グループ消失後の Space 切替は先頭 1 タブのみ復元し、
// 残りは復元バー(復元 / 破棄)で扱う
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

check("準備: Work グループに 3+1 タブ", (await workTabs()).filter((u) => u.includes("w")).length >= 3);

// --- 1. グループ消失 → 切替で 1 枚だけ復元 + 復元バー -----------------------------
await panel.locator(".chip", { hasText: "H" }).first().click();
await sleep(1200);
await killWork();
await sleep(800);
await panel.locator(".chip", { hasText: "W" }).first().click();
await sleep(2000);
let tabs = await workTabs();
const barText = await panel.textContent(".restore-bar .restore-btn").catch(() => "");
check("遅延復元: 先頭 1 タブのみ即時復元", tabs.length === 1, JSON.stringify(tabs));
check("復元バー: 残り件数を表示", barText === (await msg(panel, "restoreTabs", "2")), barText);

// --- 2. 復元ボタン → 全タブが戻りバーが消える --------------------------------------
await panel.click(".restore-bar .restore-btn");
await sleep(2000);
tabs = await workTabs();
check("復元実行: 全タブが戻る", tabs.length >= 3, JSON.stringify(tabs));
check("復元実行: バーが消える", (await panel.$$eval(".restore-bar", (els) => els.length)) === 0);

// --- 3. 🔍 破棄ボタン → バーが消えタブは増えない ------------------------------------
await sleep(2000); // snapshot を待つ
await panel.locator(".chip", { hasText: "H" }).first().click();
await sleep(1200);
await killWork();
await sleep(800);
await panel.locator(".chip", { hasText: "W" }).first().click();
await sleep(2000);
check("🔍 再度 1 タブ + バー表示", (await workTabs()).length === 1 && (await panel.$$eval(".restore-bar", (els) => els.length)) === 1);
await panel.click(".restore-bar .restore-discard");
await sleep(800);
const pendingKeys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith("pendingRestore:")));
check(
  "🔍 破棄: バーが消えタブは増えず、pendingRestore も消える",
  (await panel.$$eval(".restore-bar", (els) => els.length)) === 0 && (await workTabs()).length === 1 && pendingKeys.length === 0,
  JSON.stringify(pendingKeys)
);

await finish(ctx, errors);
