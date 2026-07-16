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

## セットアップと実行

**E2E 一式はリポジトリ内 `e2e/` にある**(scratchpad は日をまたぐと消えるため、
テストは必ずリポジトリ側に置く/追加する)。

```bash
cd e2e
npm run setup   # 初回のみ(playwright + Chromium)
npm test        # 全スイート(basic / import / folders / pintabs / globalpins / restore)
node basic.mjs  # 単体実行
```

共通ヘルパーは `e2e/helper.mjs`。以下は内部の仕組みの説明。

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

## 検証すべきフロー(各スイートの対応)

- `basic.mjs`: 初期収容 → Pin 追加/重複/クリックフォーカス → Space 作成/切替
  (折りたたみ状態)→ 連打 → 2 段階削除 → 新規タブ収容 → タブを閉じる →
  storage.local 永続化(sync は 8KB/item 上限のため不使用)
- `import.mjs`: Arc インポート。`page.setInputFiles("#arc-file", fixture)` で
  ファイル選択を迂回。フィクスチャは StorableSidebar.json の交互配列
  ([id, obj, ...])形式。インポートされたフォルダはデフォルト折りたたみ。
  再インポート(統合・重複 0)と壊れた JSON / Space 無し JSON のエラーも見る。
  実データのパーサー確認は node で `import(".../sidepanel/arc-import.js")` →
  `globalThis.parseArcSidebar(...)`(URL は出力しないこと)
- `pintabs.mjs`: Pinned Tab 束縛。束縛タブはタブ一覧から消え `.pin-row.live` /
  `.active-tab` で状態表示。ページ内遷移後も束縛維持(新規タブが増えない)。
  ✎ のインラインリネーム(`.pin-rename-input`、空 Enter で解除)も見る
- `folders.mjs`: Pin フォルダ。作成時はデフォルト折りたたみ。Pin/フォルダ行の
  DnD ハンドラは dataTransfer 非依存なので `dispatchEvent("dragstart")` →
  `dispatchEvent("drop")` の合成イベントで駆動できる。ただし**タブ行**の
  dragstart は dataTransfer を使うため、合成する場合は DataTransfer ハンドルを
  eventInit で渡す必要がある。フォルダ削除は × 2 回
- `globalpins.mjs`: 全 Space 共通 Pin。`#global-pin-current` で追加、
  Space を跨いで表示、右クリックで `.context-menu`(編集/削除)、
  Space Pin からのドラッグで transferPin
- `restore.mjs`: 遅延復元(v0.1.4 仕様)。切替時に savedTabs は自動で開かず、
  常に新規タブ 1 枚 + `.restore-bar`(全件を復元 / × 破棄)。復元実行時は
  空タブが自動で閉じる。ユーザーがグループを閉じた場合は session の
  `userClosed:<spaceId>` フラグでバー自体を抑止(テストで再起動相当にするには
  このフラグを session から消す)。snapshot は 1.5 秒デバウンス
