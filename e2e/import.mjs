// Arc インポート: プレビュー / フォルダ構造保持(デフォルト折りたたみ)/ 再インポート統合 / 異常系
import { writeFileSync } from "node:fs";
import path from "node:path";
import { launch, openPanel, check, finish, sleep, tmpdir, labels } from "./helper.mjs";

const dir = tmpdir();
const fixture = {
  version: 1,
  sidebar: {
    containers: [
      { global: true },
      {
        topAppsContainerIDs: ["fav1"],
        spaces: [
          "space1", { id: "space1", title: "Imported", containerIDs: ["pinned", "pc1", "unpinned", "uc1"] },
          "space2", { id: "space2", containerIDs: ["pinned", "pc2", "unpinned", "uc2"] },
        ],
        items: [
          "fav1", { id: "fav1", childrenIds: ["ft1"], data: { itemContainer: {} } },
          "ft1", { id: "ft1", parentID: "fav1", data: { tab: { savedTitle: "Fav site", savedURL: "https://fav.example.com/" } } },
          "pc1", { id: "pc1", childrenIds: ["t1", "f1", "t-dup"], data: { itemContainer: {} } },
          "t1", { id: "t1", parentID: "pc1", data: { tab: { savedTitle: "Alpha", savedURL: "https://example.com/a" } } },
          "f1", { id: "f1", parentID: "pc1", childrenIds: ["t2"], title: "Folder", data: { list: {} } },
          "t2", { id: "t2", parentID: "f1", data: { tab: { savedTitle: "Beta (in folder)", savedURL: "https://example.com/b" } } },
          "t-dup", { id: "t-dup", parentID: "pc1", data: { tab: { savedTitle: "Alpha dup", savedURL: "https://example.com/a" } } },
          "uc1", { id: "uc1", childrenIds: ["t3"], data: { itemContainer: {} } },
          "t3", { id: "t3", parentID: "uc1", data: { tab: { savedTitle: "Today tab", savedURL: "https://example.com/today" } } },
          "pc2", { id: "pc2", childrenIds: [], data: { itemContainer: {} } },
          "uc2", { id: "uc2", childrenIds: [], data: { itemContainer: {} } },
        ],
      },
    ],
  },
};
const fixturePath = path.join(dir, "arc-fixture.json");
writeFileSync(fixturePath, JSON.stringify(fixture));
const garbagePath = path.join(dir, "garbage.json");
writeFileSync(garbagePath, "{ not json !!");
const emptyPath = path.join(dir, "empty.json");
writeFileSync(emptyPath, JSON.stringify({ sidebar: { containers: [{ global: true }] } }));

const { ctx, sw, extId } = await launch();
const errors = [];
const panel = await openPanel(ctx, extId, errors);

// --- 1. プレビュー -------------------------------------------------------------
await panel.setInputFiles("#arc-file", fixturePath);
await sleep(500);
const preview = await panel.textContent("#import-body");
check("プレビュー: Space 名と件数", preview.includes("Imported") && preview.includes("Pin 3") && preview.includes("タブ 1"), preview.replace(/\s+/g, " ").slice(0, 100));
check("プレビュー: 無名 Space はデフォルト名", preview.includes("Arc 2"));

// --- 2. インポート実行 -----------------------------------------------------------
await panel.click("#import-confirm");
await sleep(1200);
const result = await panel.textContent("#import-body");
check("実行結果: 新規 2 / Pin 追加 4", result.includes("新規 2") && result.includes("Pin 追加 4"), result.trim());
await panel.click("#import-cancel");
await sleep(600);
const chips = await panel.$$eval("#space-chips .chip:not(.add)", (els) => els.map((e) => e.title));
check("チップ: Home / Imported / Arc 2", JSON.stringify(chips) === JSON.stringify(["Home", "Imported", "Arc 2"]), JSON.stringify(chips));

// --- 3. Imported へ切替: フォルダは閉じた状態で入る ------------------------------
await panel.locator(".chip", { hasText: "I" }).first().click();
await sleep(2000);
let pinLabels = await labels(panel, "#pin-list");
check(
  "Pin: Favorites 先頭 + フォルダ行(中身はデフォルト折りたたみで非表示)",
  pinLabels[0] === "Fav site" && pinLabels.includes("Folder") && !pinLabels.includes("Beta (in folder)") && pinLabels.filter((t) => t.startsWith("Alpha")).length === 1,
  JSON.stringify(pinLabels)
);
const badge = await panel.textContent("#pin-list .row.folder-row .badge");
check("フォルダバッジ: 中の Pin 数 1", badge === "1");

// 展開すると中身がインデント表示される
await panel.locator("#pin-list .row.folder-row").click();
await sleep(600);
pinLabels = await labels(panel, "#pin-list");
const pad = await panel.$eval("#pin-list .row.folder-row + .row", (el) => el.style.paddingLeft);
check("フォルダ展開: Beta が 24px インデントで出る", pinLabels.includes("Beta (in folder)") && pad === "24px", pad);

// savedTabs(1 件)は即時復元され、復元バーは出ない
const st = await sw.evaluate(async () => {
  const groups = await chrome.tabGroups.query({ title: "Imported" });
  const tabs = groups.length ? await chrome.tabs.query({ groupId: groups[0].id }) : [];
  return tabs.map((t) => t.url || t.pendingUrl);
});
check("切替: savedTabs が復元される", st.some((u) => u.includes("example.com/today")), JSON.stringify(st));
check("復元バー: 残タブ無しなら出ない", (await panel.$$eval(".restore-bar", (els) => els.length)) === 0);

// --- 4. 🔍 再インポート → 統合・重複なし ----------------------------------------
await panel.setInputFiles("#arc-file", fixturePath);
await sleep(500);
await panel.click("#import-confirm");
await sleep(1200);
const re = await panel.textContent("#import-body");
check("🔍 再インポート: 統合 2 / Pin 追加 0", re.includes("新規 0") && re.includes("統合 2") && re.includes("Pin 追加 0"), re.trim());
await panel.click("#import-cancel");
await sleep(300);
check("🔍 再インポート: フォルダも重複しない", (await panel.$$eval("#pin-list .row.folder-row", (els) => els.length)) === 1);

// --- 5. 🔍 異常系 ---------------------------------------------------------------
await panel.setInputFiles("#arc-file", garbagePath);
await sleep(500);
const err = await panel.textContent("#import-body");
check("🔍 壊れた JSON: エラー表示 + 実行ボタン非表示", err.includes("読み取れませんでした") && (await panel.$eval("#import-confirm", (b) => b.hidden)));
await panel.click("#import-cancel");
await panel.setInputFiles("#arc-file", emptyPath);
await sleep(500);
check("🔍 Space の無い JSON: 見つからない旨", (await panel.textContent("#import-body")).includes("見つかりませんでした"));
await panel.click("#import-cancel");

await finish(ctx, errors);
