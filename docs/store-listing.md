# ストア掲載情報(Chrome Web Store / Edge Add-ons 提出用)

ダッシュボードにコピペするための下書き。2026-07-09 作成。

## 基本情報

- **名前**: Tab Harbor
- **カテゴリ**: 仕事効率化 / Productivity(Chrome は「ツール」系、Edge は「Productivity」)
- **言語**: 日本語(必要なら英語も追加)

## 短い説明(132 文字以内)

> Arc 風のサイドバーでタブを整理。Pin(固定タブ)と Space(作業スペース)で
> コンテキストを切り替え。Arc からのインポート対応。

英語版:

> Arc-style sidebar for your tabs. Organize with pinned tabs and Spaces,
> switch contexts instantly, and import your setup from Arc.

## 詳細説明

> Tab Harbor は、Arc ブラウザの中核体験(Pin 中心のサイドバー / Space による
> コンテキスト分離)を Edge / Chrome で再現するタブ管理拡張です。
>
> ◆ Pin(固定タブ)
> よく使うサイトをサイドバー上部に固定。クリックすると開いているタブに
> フォーカスし、なければ開きます。タブはPin行そのものとして振る舞い、
> 一時タブの一覧を汚しません。フォルダで階層化もできます。
>
> ◆ Space(作業スペース)
> 「仕事」「調べ物」「個人」など、Pin とタブのセットをまるごと切り替え。
> Space はタブグループとして実装され、切り替えると他の Space は
> 折りたたまれます。ショートカット(Alt+Shift+. / ,)で巡回切替。
>
> ◆ Arc からのインポート
> Arc の StorableSidebar.json を選ぶだけで、Space・Pin(フォルダ階層ごと)・
> 開いていたタブを取り込めます。
>
> ◆ プライバシー
> データはブラウザ内にのみ保存され、外部送信は一切ありません。
>
> ※ Edge では「垂直タブ」と併用すると、より Arc に近い見た目になります。

## 単一目的の説明(Chrome「プライバシーへの取り組み」タブ)

> Organize the user's tabs in a sidebar: pinned tabs and tab groups ("Spaces")
> that the user can switch between. All features (pinning, grouping, switching,
> importing an Arc sidebar file) serve this single tab-management purpose.

## 権限の使用理由(審査用・英語)

| 権限 | 理由 |
|---|---|
| `sidePanel` | Renders the extension's tab-management UI in the browser side panel. |
| `tabs` | Reads tab title/URL/favicon to list the user's open tabs in the sidebar, focuses or closes tabs the user clicks, and opens pinned URLs. |
| `tabGroups` | Implements Spaces: each Space is a tab group that the extension creates, renames, collapses and expands when the user switches Spaces. |
| `storage` | Persists pins, Space settings and per-Space tab URLs locally (`storage.local`) and via the user's own browser sync (`storage.sync`). Nothing is sent to any server. |
| `favicon` | Displays site icons next to pins and tabs in the sidebar. |

- **リモートコード**: 使用しない(No, I am not using remote code)
- **データ収集(Chrome の Data usage / Edge の Privacy)**: 収集しない。
  すべて「No」で申告(WebsiteContent 等の収集なし)
- **プライバシーポリシー URL**: PRIVACY.md を公開した URL を記載
  (GitHub リポジトリ公開 or GitHub Pages / Gist)

## 提出物チェックリスト

- [ ] `scripts/package.sh` で生成した zip(`dist/tab-harbor-<version>.zip`)
- [ ] スクリーンショット 1280x800(最低 1 枚、推奨 3 枚)
- [ ] ストアアイコン: Chrome 128x128(`icons/icon128.png` を流用可)、
      Edge 300x300(要リサイズ生成)
- [ ] プライバシーポリシーの公開 URL
- [ ] 再提出時は manifest.json の `version` を上げる

## 審査の目安

- Chrome Web Store: 登録料 $5(初回のみ)。審査は通常 1〜3 日
  (`tabs` 権限があるためもう少しかかることもある)
- Edge Add-ons: 登録無料。審査は数日〜1 週間程度
- 公開範囲は「公開」のほか「限定公開(リンクを知っている人のみ)」も選べる。
  社内配布が主目的なら限定公開から始めるのが安全
