# ストア掲載情報(Chrome Web Store / Edge Add-ons 提出用)

ダッシュボードにコピペするための確定版。

## 基本情報

- **名前**: Tab Harbor
- **カテゴリ**: Chrome「仕事効率化 › ワークフローと計画」/ Edge「Productivity」
- **言語**: 日本語 + English
- **サポート URL**: https://github.com/itwuthe3/tab-harbor
- **プライバシーポリシー URL**: https://github.com/itwuthe3/tab-harbor/blob/main/PRIVACY.md
- **検索キーワード(Edge・日本語リスティング)**: タブ管理、サイドバー、タブグループ、
  ワークスペース、tab manager、sidebar、Arc
- **検索キーワード(Edge・英語リスティング)**: tab manager、sidebar、tab groups、
  workspaces、Arc、vertical tabs、productivity

## 短い説明(132 文字以内)

日本語:

> Arc 風サイドバーでタブを整理。Pin(固定タブ)と Space(作業スペース)で
> 仕事・個人などのコンテキストを一瞬で切替。フォルダ階層、Arc からの
> インポート対応。データ収集なし。

English:

> Arc-style sidebar tab manager. Pin your go-to sites, switch contexts with
> Spaces, import your setup from Arc. No data collection.

## 詳細説明(日本語)

> Tab Harbor は、Arc ブラウザの「Pin 中心のサイドバー」と「Space による
> コンテキスト分離」を Microsoft Edge / Google Chrome で再現するタブ管理拡張です。
>
> こんな方に:
> ・タブを開きすぎて、目的のタブが見つからない
> ・仕事用・調べ物用・個人用で、タブ一式をまるごと切り替えたい
> ・Arc から移行してきて、あのサイドバー体験が恋しい
>
> ■ Pin — よく使うサイトを「アプリ」のように
> サイドバー上部に固定したサイトは、クリックすると開いているタブにフォーカスし、
> なければ開きます。開いたタブは Pin と一体化して一時タブの一覧を汚さず、
> ページ内で移動しても Pin が追跡。「－」ボタンでタブだけ閉じて Pin を残せます。
> フォルダによる階層整理(ドラッグ&ドロップ・折りたたみ・ネスト)にも対応。
>
> ■ Space — 作業スペースをまるごと切り替え
> 「仕事」「調べ物」「個人」など、Pin とタブのセットを Space として保持します。
> 切り替えると対象のタブグループが展開され、ほかは折りたたまれます。テーマ色つき。
> 新しいタブは現在の Space に自動で振り分けられ、ブラウザを再起動しても
> タブ構成を復元します。
>
> ■ Arc からのインポート
> Arc の StorableSidebar.json を選ぶだけで、Space・Pin(フォルダ階層ごと)・
> Favorites・開いていたタブを取り込めます。
>
> ■ キーボードショートカット
> Alt+Shift+H: サイドバーを開く
> Alt+Shift+. / Alt+Shift+,: Space を巡回切替
> (ブラウザのショートカット設定ページから変更できます)
>
> ■ プライバシー
> データはブラウザ内にのみ保存され、外部サーバーへの送信・アナリティクス・
> トラッキングは一切ありません。ソースコードは GitHub で公開しています:
> https://github.com/itwuthe3/tab-harbor
>
> ■ ヒント
> Edge の「垂直タブ」と組み合わせると、より Arc に近い画面構成になります。

## 詳細説明(English)

> Tab Harbor brings Arc's signature sidebar experience — pinned tabs and
> Spaces — to Microsoft Edge and Google Chrome.
>
> For you if:
> • You drown in open tabs and can't find the one you need
> • You want to swap entire tab sets between work, research and personal contexts
> • You migrated from Arc and miss that sidebar
>
> ■ Pins — your go-to sites, app-like
> Pinned sites live at the top of the sidebar. Clicking one focuses its tab
> (or opens it), and that tab merges into the pin instead of cluttering your
> tab list. The pin follows in-page navigation, and "–" closes the tab while
> keeping the pin. Organize pins into nested, collapsible folders with
> drag & drop.
>
> ■ Spaces — switch whole working contexts
> Keep separate sets of pins and tabs for work, research, personal life.
> Switching a Space expands its tab group and collapses the rest, with theme
> colors per Space. New tabs join the active Space automatically, and your
> layout survives browser restarts.
>
> ■ Import from Arc
> Pick your Arc StorableSidebar.json and bring over Spaces, pinned tabs
> (with folder structure), Favorites and open tabs.
>
> ■ Keyboard shortcuts
> Alt+Shift+H: toggle the sidebar / Alt+Shift+. and Alt+Shift+,: cycle Spaces
>
> ■ Privacy
> Everything is stored inside your browser. No servers, no analytics,
> no tracking. Open source: https://github.com/itwuthe3/tab-harbor
>
> ■ Tip
> Pairs nicely with Edge's vertical tabs for the full Arc-like layout.

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
| `storage` | Persists pins, Space settings and per-Space tab URLs locally (`storage.local`). Nothing is sent to any server. |
| `favicon` | Displays site icons next to pins and tabs in the sidebar. |

- **リモートコード**: 使用しない(No, I am not using remote code)
- **データ収集(Chrome の Data usage / Edge の Privacy)**: 収集しない。
  すべて「No」で申告(WebsiteContent 等の収集なし)

## Notes for certification(Edge・審査担当者向けメモ)

**注意: この欄は URL を含む文章を「禁止文字」として弾く**(2026-07 提出時に確認)。
`https://` 形式のリンクや記号(引用符・コロン等)を含めず、プレーンな英文で書くこと。
リポジトリの場所は散文で説明する(例: repository tab-harbor on GitHub)。
テスターは Arc を持っていないため、インポート機能の検証用に
`examples/arc-sample.json` を用意してある(リポジトリの examples フォルダと案内する)。

実際に通った文面:

> Tab Harbor is a tab manager in the browser side panel. No account or sign-in is
> needed to test any feature. All data stays in browser storage, nothing is sent
> to any server, and no remote code is used. The UI is in Japanese. The source
> code is public on GitHub (repository tab-harbor by user itwuthe, digit three,
> no spaces).
>
> How to test. Click the toolbar icon to open the side panel. Existing tabs are
> grouped into a default Space named Home, which is a normal tab group.
>
> Pins. Hover a tab row and click the pin button. Clicking a pin focuses or
> reopens its tab. The minus button closes the tab and keeps the pin, the x
> button removes the pin. The New folder button in the Pin section header
> creates folders, and pins can be dragged onto them.
>
> Spaces. Create one via the plus chip in the header. Clicking chips switches
> context, expanding the target tab group and collapsing the others.
>
> Arc import. Click the import icon in the header and select an Arc sidebar
> file. Testers without the Arc browser can use the sample file named
> arc-sample.json, found in the examples folder of the GitHub repository
> mentioned above.
>
> Permissions. The sidePanel permission renders the UI, tabs lists and focuses
> or closes tabs, tabGroups implements Spaces, storage persists pins and
> settings locally, and favicon shows site icons.

## 提出物チェックリスト

- [ ] `scripts/package.sh` で生成した zip(`dist/tab-harbor-<version>.zip`)
- [ ] スクリーンショット 3 枚 1280x800(`dist/store-assets/screenshot-*.png`)
- [ ] ストアアイコン: Chrome 128x128(`icons/icon128.png`)、
      Edge 300x300(`dist/store-assets/icon300.png`)
- [ ] プライバシーポリシー URL(上記)
- [ ] 再提出時は manifest.json の `version` を上げる

## 審査の目安

- Chrome Web Store: 登録料 $5(初回のみ)。審査は通常 1〜3 日
  (`tabs` 権限があるためもう少しかかることもある)
- Edge Add-ons: 登録無料。審査は数日〜1 週間程度
- 公開範囲は「公開」のほか「限定公開(リンクを知っている人のみ)」も選べる
