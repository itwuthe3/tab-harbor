# 調査メモ: Arc の機能分解と Edge 拡張 API の実現可否

調査日: 2026-07-09

## 前提

Arc は 2025年5月にメンテナンスモード入り(新機能・修正なし)。開発元 The Browser Company は
2025年9月に Atlassian に買収され Dia に注力しているため、移行は時期として妥当。

## Arc の対象機能の分解

| Arc の機能 | 実体 |
|---|---|
| Favorites / Pinned Tabs | Space ごとにサイドバー上部へ固定される「アプリ化したブックマーク」。クリックで復元、閉じても消えない。Pin 内サイトの外へ出るリンクは Peek(ポップアップ)で開く |
| 一時タブ(Today Tabs) | サイドバー下部。自動アーカイブされる通常タブ |
| ホバープレビュー | Pin にホバーすると内容に応じたポップアップ |
| Space | タブ・Pin をコンテキスト単位でグループ化。テーマ・アイコン付き。Profile より軽量 |
| Profile 連動 | Space に Profile(Cookie・履歴・ログイン状態が別)を割り当て、Space 切替で自動的にログイン状態も切替 |

## Edge 拡張 API の実現可否

### できる(Chrome 互換 API が Edge で利用可能)

- **`chrome.sidePanel`** — Edge のサイドバーに拡張 UI を常駐表示できる。
  `setPanelBehavior({ openPanelOnActionClick: true })` でアイコンクリック起動。
  サイドバー内の拡張は通常の拡張 API すべてにアクセス可能
- **`chrome.tabs` / `chrome.tabGroups`** — タブ一覧・イベント監視・グループ化・折りたたみ。
  Edge は Chrome 互換 API としてどちらもサポート
- **`chrome.bookmarks` / `chrome.storage`** — Pin のデータ管理と同期
- **`chrome.tabs.captureVisibleTab`** — アクティブタブのスクリーンショット取得
  (訪問時にキャッシュしてプレビューに使う)
- **`chrome.commands`** — キーボードショートカット

### できない(API が存在しない)

- **プロファイルの切り替え・別プロファイルでのウィンドウ作成。**
  Chromium に「Profile Extension API」(`chrome.windows.create` に `profileName` を足す案)の
  提案があったが実装されていない。拡張は自分がインストールされたプロファイル内に完全に閉じる
- ネイティブの水平タブバーやブラウザ UI 自体を消す・置き換えること
- Edge ネイティブの「Workspaces」を拡張 API から操作すること

### 回避策(条件付きで可能)

- **Native Messaging** で小さなネイティブホストと stdio JSON で通信し、そこから
  `msedge --profile-directory="Profile 2" <URL>` を起動すれば「Space 切替でプロファイルごと
  切替」を疑似的に実現できる。Chrome ではこの方式のプロファイルスイッチャー拡張の実例あり
  (ホストが Local State ファイルを読んでプロファイルを列挙する)。
  **拡張とは別にネイティブアプリのインストールが必要** → 組織管理下の PC では導入ポリシーの確認必須

## Edge ネイティブ機能との比較

Edge には垂直タブ・Workspaces・Collections・プロファイルがネイティブ搭載されている。
Workspaces は Arc の Space に近いが拡張 API からは操作できない。
「垂直タブ + Workspaces + 手動プロファイル切替」で足りる部分は拡張で作らない選択肢がある。

## 名前の調査(2026-07-09)

- Chrome Web Store に「Harbor」(リサーチツール)と「Harbor - AI-Powered Tab Manager」
  (★4.4、同ジャンルのタブ管理拡張)が既存。LinkHarbor / CallHarbor / HarborDrop も存在
- Edge Add-ons ストアでは「Harbor」単体の同名拡張は Web 検索でヒットせず
  (公開前にストア内検索で再確認推奨)
- → 完全一致を避けて **Tab Harbor** に決定

## 参考リンク

- [Arc Help: Spaces](https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas)
- [Arc Help: Pinned Tabs](https://resources.arc.net/hc/en-us/articles/19231060187159-Pinned-Tabs-Tabs-you-want-to-stick-around)
- [Arc Help: Favorites](https://resources.arc.net/hc/en-us/articles/19230755904151-Favorites-Top-Tabs-Across-Every-Space)
- [Microsoft Edge: サイドバー拡張の開発ガイド](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar)
- [chrome.sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [chrome.tabGroups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups)
- [chrome.windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)
- [Chromium: Profile Extension API(提案止まり・未実装)](https://www.chromium.org/developers/design-documents/extensions/proposed-changes/apis-under-development/profile-extension-api/)
- [Microsoft Edge: Native Messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging)
- [Native Messaging 方式のプロファイルスイッチャー実例](https://github.com/garethj/chrome-profile-switcher)
- [Edge を Arc 風にする運用ガイド(垂直タブ・Workspaces)](https://medium.com/@zahir.r/how-to-make-edge-browser-exactly-like-arc-browser-279c439491d1)
- [Arc のメンテナンスモード入りと代替状況](https://supasidebar.com/blog/arc-browser-alternative-guide)
