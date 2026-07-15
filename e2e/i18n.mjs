// i18n: en / ja カタログの整合性と、静的 HTML への翻訳適用を検証する
import { readFileSync } from "node:fs";
import path from "node:path";
import { EXT, launch, openPanel, check, finish, msg } from "./helper.mjs";

// --- 1. カタログの静的検証(ブラウザ不要)----------------------------------------
const en = JSON.parse(readFileSync(path.join(EXT, "_locales/en/messages.json"), "utf8"));
const ja = JSON.parse(readFileSync(path.join(EXT, "_locales/ja/messages.json"), "utf8"));
const enKeys = Object.keys(en).sort();
const jaKeys = Object.keys(ja).sort();
check(
  "カタログ: en と ja のキーが一致",
  JSON.stringify(enKeys) === JSON.stringify(jaKeys),
  enKeys.filter((k) => !jaKeys.includes(k)).concat(jaKeys.filter((k) => !enKeys.includes(k))).join(",")
);
const placeholdersMatch = enKeys.every((k) => {
  const pe = Object.keys(en[k].placeholders ?? {}).sort();
  const pj = Object.keys(ja[k].placeholders ?? {}).sort();
  return JSON.stringify(pe) === JSON.stringify(pj);
});
check("カタログ: placeholders 定義が一致", placeholdersMatch);

// パネル側のソースが参照するキーがカタログに存在するか
const src =
  readFileSync(path.join(EXT, "sidepanel/panel.js"), "utf8") +
  readFileSync(path.join(EXT, "sidepanel/panel.html"), "utf8") +
  readFileSync(path.join(EXT, "background.js"), "utf8") +
  readFileSync(path.join(EXT, "sidepanel/arc-import.js"), "utf8");
const used = new Set(
  [...src.matchAll(/\bt\("([A-Za-z0-9]+)"/g), ...src.matchAll(/data-i18n(?:-title|-placeholder)?="([A-Za-z0-9]+)"/g), ...src.matchAll(/getMessage\("([A-Za-z0-9]+)"/g)].map((m) => m[1])
);
const missing = [...used].filter((k) => !en[k]);
check("参照キーがすべてカタログに存在", missing.length === 0, missing.join(","));

// --- 2. 実ブラウザ: manifest と静的 HTML が翻訳される ------------------------------
const { ctx, sw, extId } = await launch();
const errors = [];
const panel = await openPanel(ctx, extId, errors);

const uiLang = await sw.evaluate(() => chrome.i18n.getUILanguage());
console.log("(info) UI language:", uiLang);

const desc = await sw.evaluate(() => chrome.runtime.getManifest().description);
check("manifest: description が __MSG__ のまま残っていない", !desc.includes("__MSG_"), desc);
check("manifest: description がカタログの文言と一致", desc === (await msg(panel, "extDescription")));

check("静的 HTML: ＋現在のタブ ボタンが翻訳される", (await panel.textContent("#pin-current")) === (await msg(panel, "pinCurrentBtn")));
check("静的 HTML: タブセクションのラベルが翻訳される", (await panel.textContent("#tabs-section .section-label")) === (await msg(panel, "tabsLabel")));
check(
  "静的 HTML: title 属性が翻訳される",
  (await panel.getAttribute("#import-arc", "title")) === (await msg(panel, "importArcTitle"))
);
check(
  "静的 HTML: placeholder が翻訳される",
  (await panel.getAttribute("#pin-edit-name-input", "placeholder")) === (await msg(panel, "pinNamePlaceholder"))
);

// 動的 UI のメッセージ解決(キーがそのまま表示されていない)
const gpHint = await panel.textContent("#global-pin-list .global-pin-icons");
check("動的 UI: Global Pin の空ヒントが翻訳される", gpHint === (await msg(panel, "gpEmptyHint")), gpHint);

await finish(ctx, errors);
