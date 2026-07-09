---
name: verify
description: Tab Harbor 拡張を実ブラウザ(headless Chromium)にロードして E2E 検証する手順
---

# Tab Harbor の動作検証

## ハマりどころ(先に読む)

- **ブランド版 Google Chrome(137+)は `--load-extension` を無視する。**
  `/Applications/Google Chrome.app` では拡張がロードされず、service worker が
  永遠に現れない。Playwright 同梱の Chromium(Chrome for Testing)を使うこと。
- Playwright の `headless: true` はデフォルトで headless shell(拡張非対応)を
  探す。**`channel: "chromium"` を指定**するとフル Chromium の new headless に
  なり、拡張が動く。
- サイドパネルの UI は `chrome-extension://<id>/sidepanel/panel.html` を
  **通常のタブとして開けば**そのまま操作・スクリーンショットできる
  (`sidePanel` API の枠に入れる必要はない)。ただしそのタブ自身も
  自動収容(タブグループ入り)される点はテスト上のアーティファクト。

## セットアップ

```bash
cd <scratchpad>
npm i playwright --no-audit --no-fund
npx playwright install chromium --no-shell
```

## 起動レシピ

```js
import { chromium } from "playwright";
const ctx = await chromium.launchPersistentContext(mkdtempSync(...), {
  channel: "chromium",
  headless: true,
  viewport: { width: 380, height: 700 }, // サイドバー幅を模す
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
});
let sw = ctx.serviceWorkers()[0] ?? await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;
```

## 駆動のコツ

- 実状態の突き合わせは service worker 側で:
  `sw.evaluate(() => chrome.tabGroups.query({}))` /
  `chrome.storage.sync.get(null)` / `chrome.storage.local.get(null)`
- タブの自動収容は `onCreated` から 300ms 遅延で走るので、タブ操作後は
  1 秒以上待ってから状態を確認する。savedTabs スナップショットは 1.5 秒
  デバウンス。
- テストページはネットワーク不要の `file://`(scratchpad に書いた HTML)を使う。
  Pin / savedTabs は `https?|file:` のみ対象なので `about:blank` は対象外。

## 検証すべきフロー

既存の E2E 一式(scratchpad の `e2e.mjs` / `probe-restore.mjs` 参照):
初期収容 → Pin 追加/重複/クリックフォーカス → Space 作成/切替(折りたたみ状態)→
連打 → 2 段階削除 → 新規タブ収容 → タブを閉じる → storage.sync 永続化 →
グループ消失後の savedTabs 復元。

Arc インポート(`e2e-import.mjs` 参照): `page.setInputFiles("#arc-file", fixture)` で
ファイル選択ダイアログを迂回できる。フィクスチャは StorableSidebar.json の
交互配列([id, obj, ...])形式を再現すること。再インポート(統合・重複 0)と
壊れた JSON / Space の無い JSON のエラー表示も見る。実データでのパーサー確認は
node から `import("<repo>/sidepanel/arc-import.js")` →
`globalThis.parseArcSidebar(...)` で可能(URL は出力しないこと)。

Pinned Tab 挙動(`e2e-pintabs.mjs` 参照): Pin の束縛タブはタブ一覧から消え、
`.pin-row.live` / `.active-tab` クラスで状態が出る。ページ内遷移後も束縛が
維持されること(新規タブが増えないこと)を必ず見る。

Pin フォルダ(`e2e-folders.mjs` 参照): パネルの DnD ハンドラは dataTransfer に
依存しないので、`locator.dispatchEvent("dragstart")` → 対象行に
`dispatchEvent("drop")` の合成イベントで移動を駆動できる(ブラウザ本来の
ドラッグ機構は通らない点に留意)。フォルダ削除は × を 2 回クリック。
