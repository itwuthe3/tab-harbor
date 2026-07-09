# Tab Harbor

Arc 風のサイドバー体験を Microsoft Edge / Google Chrome にもたらすタブ管理拡張(Manifest V3)。
Pin(固定タブ)と Space(作業スペース)で、タブをコンテキストごとに整理します。

Edge と Chrome は同一の拡張 API(`sidePanel` / `tabs` / `tabGroups`)を持つため、
単一のコードベースで両ブラウザに対応しています。

## 機能

- **サイドバー** — 上部に Pin、下部に現在のタブ(Arc と同じ上下構造)。
  タブの開閉・切替・タイトル変更をリアルタイム反映
- **Pin** — Arc の Pinned Tab と同じく「Pin 行 = タブそのもの」。クリックで
  束縛タブにフォーカス(ページ内で別 URL に遷移していても追従)、なければ開いて束縛。
  束縛タブは下の「タブ」一覧には出ず、Pin 行がアクティブ表示・ライブタイトルを引き受ける。
  「－」でタブだけ閉じて Pin を残せる。ホバーでプレビュー。データは `storage.local` に保存
- **Pin フォルダ** — 「＋ フォルダ」で作成(ネスト可)。行クリックで折りたたみ、
  ダブルクリックでリネーム、ドラッグで Pin の並べ替え・フォルダへの出し入れ。
  フォルダの × は中身ごと削除のため 2 段階クリック
- **Space** — タブグループとして実装。作成・命名・テーマ色・削除。
  切替で対象グループを展開し他を折りたたむ。グループ外の新規タブは
  アクティブ Space に自動収容。ブラウザ再起動などでグループが消えても
  保存済み URL からタブを復元
- **ショートカット** — `Alt+Shift+H` サイドバー開閉 / `Alt+Shift+.` 次の Space /
  `Alt+Shift+,` 前の Space
- **Arc からインポート** — ヘッダーの 📥 から Arc の `StorableSidebar.json`
  (macOS: `~/Library/Application Support/Arc/`)を選ぶと、Space・Pin タブ
  (フォルダ階層を保持)・未 Pin タブ(Space の復元用タブとして)・
  Favorites(各 Space の Pin 先頭に展開)を取り込む。同名 Space には Pin を統合
  (同名フォルダも統合)し、重複 URL はスキップ。Cookie・ログイン状態・履歴は対象外

## インストール

### ストア(準備中)

Chrome Web Store / Microsoft Edge Add-ons で公開予定。

### 開発版(Load unpacked)

1. このリポジトリを clone
2. ブラウザの拡張機能ページを開く
   - Edge: `edge://extensions` → 左下「開発者モード」を ON
   - Chrome: `chrome://extensions` → 右上「デベロッパーモード」を ON
3. 「展開して読み込み(Load unpacked)」でリポジトリのルートを選択
4. ツールバーの錨アイコンをクリックするとサイドバーが開く

## プライバシー

データ(Pin・Space 設定・復元用のタブ URL)はブラウザ内にのみ保存され、
外部への送信は一切ありません。詳細は [PRIVACY.md](PRIVACY.md) を参照。

## 既知の制約

- ブラウザネイティブの水平タブバーは拡張からは消せません
  (Edge の「垂直タブ」を併用すると Arc に近い見た目になります)
- Space 名とタブグループ名の対応で再起動後の復元を行うため、Space 名の重複は不可
- プロファイル(ログイン状態)の切替は拡張 API に存在しないため未対応

## 名前の由来

「タブが停泊する港」。Pin = 錨(いつでも戻れる)、Space = 泊地(区画)、
一時タブ = 出入りする船。

## 開発

```
manifest.json        MV3 マニフェスト(Edge / Chrome 共通)
background.js        サービスワーカー: Space⇄タブグループ同期・Pin・永続化
sidepanel/           サイドバー UI(表示のみ。ロジックは background 側)
icons/               アイコン(scripts/gen_icons.py で再生成)
scripts/             パッケージング・アセット生成
docs/                設計ドキュメント
```

- `scripts/package.sh` — ストア提出用 zip を `dist/` に生成
- `scripts/gen-store-shots.mjs` — ストア用スクリーンショットを生成
  (要 `playwright` + Chromium)
- [docs/store-listing.md](docs/store-listing.md) — ストア掲載文の下書き
- [docs/requirements.md](docs/requirements.md) — 要件定義・設計判断
- [docs/research.md](docs/research.md) — Arc の機能分解と拡張 API の調査メモ

## ロードマップ

- ホバープレビューのスクリーンショットサムネイル(現状はタイトル+URL)
- Space ごとのプロファイル連動(Native Messaging ホストの任意導入が前提)
