// Arc の StorableSidebar.json を Tab Harbor のインポート形式に変換する。
//
// Arc のフォーマット(非公式・観察ベース):
//   sidebar.containers[] のうち "spaces" を持つものが実体。
//   spaces / items は [id文字列, オブジェクト, ...] の交互配列。
//   space.containerIDs = ["pinned", <uuid>, "unpinned", <uuid>] のキー値交互配列。
//   item は parentID / childrenIds で木構造。data.tab が実タブ、
//   data.list がフォルダ、data.itemContainer がコンテナ。
//   topAppsContainerIDs = Favorites(全 Space 共通の最上段グリッド)のコンテナ ID 群。
//
// 出力: [{ name, pins: <木>, savedTabs: [url] }]
//   pins の木: Pin = {title, url} / フォルダ = {title, children: [...]}(ネスト保持)
// Favorites は全 Space 共通という Arc の意味論に合わせ、各 Space の Pin 先頭に入れる。
// savedTabs(未 Pin タブ)はフォルダ概念が無いためフラットな URL リスト。
"use strict";

function parseArcSidebar(json) {
  const containers = json?.sidebar?.containers ?? [];
  const out = [];
  for (const container of containers) {
    if (!container || !Array.isArray(container.spaces)) continue;
    const spaces = container.spaces.filter(isArcObj);
    if (!spaces.length) continue;
    const items = (container.items ?? []).filter(isArcObj);
    const byId = new Map(items.map((i) => [i.id, i]));
    const childrenOf = new Map();
    for (const item of items) {
      if (!item.parentID) continue;
      if (!childrenOf.has(item.parentID)) childrenOf.set(item.parentID, []);
      childrenOf.get(item.parentID).push(item.id);
    }
    // Favorites (topApps): 文字列要素をコンテナ ID とみなして全部さらう。
    // グリッド表示なのでフォルダ概念は無く、フラットに集める
    const favorites = (container.topAppsContainerIDs ?? [])
      .filter((id) => typeof id === "string")
      .flatMap((id) => flattenArcPins(collectArcItems(id, byId, childrenOf)));

    spaces.forEach((space, index) => {
      const ids = arcKvList(space.containerIDs).size
        ? arcKvList(space.containerIDs)
        : arcKvList(space.newContainerIDs);
      const pins = dedupeTree([
        ...favorites,
        ...collectArcItems(ids.get("pinned"), byId, childrenOf),
      ]);
      const tabs = flattenArcPins(
        collectArcItems(ids.get("unpinned"), byId, childrenOf)
      );
      out.push({
        name: arcSpaceName(space, index, spaces.length),
        pins,
        savedTabs: [...new Set(tabs.map((t) => t.url))],
      });
    });
  }
  return out;
}

function isArcObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// フォルダ名の既定値。node からパーサー単体で実行される場合は chrome が無いのでガードする
function arcFolderFallback() {
  return globalThis.chrome?.i18n?.getMessage("defaultFolderName") || "Folder";
}

// ["key", value, "key", value, ...] 形式を Map にする
function arcKvList(arr) {
  const map = new Map();
  if (!Array.isArray(arr)) return map;
  for (let i = 0; i + 1 < arr.length; i += 2) {
    if (typeof arr[i] === "string") map.set(arr[i], arr[i + 1]);
  }
  return map;
}

function arcSpaceName(space, index, total) {
  const title = typeof space.title === "string" ? space.title.trim() : "";
  if (title) return title.slice(0, 40);
  return total > 1 ? `Arc ${index + 1}` : "Arc";
}

// コンテナ ID から木を辿り、フォルダ構造を保持したまま集める。
// タブ → {title, url} / フォルダ(data.list)→ {title, children}(空フォルダは捨てる)/
// コンテナ等 → 子をそのまま並べる
function collectArcItems(rootId, byId, childrenOf) {
  if (!rootId) return [];
  const seen = new Set();
  const build = (id) => {
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const item = byId.get(id);
    if (item && isArcObj(item.data) && isArcObj(item.data.tab)) {
      const url = item.data.tab.savedURL || "";
      if (!/^(https?|file):/.test(url)) return [];
      return [{ title: String(item.data.tab.savedTitle || item.title || url), url }];
    }
    // childrenIds を優先(並び順を保持)、なければ parentID の逆引きで補完
    let children = Array.isArray(item?.childrenIds)
      ? item.childrenIds.filter((c) => byId.has(c))
      : [];
    if (!children.length) children = childrenOf.get(id) ?? [];
    const childItems = children.flatMap(build);
    if (item && isArcObj(item.data) && isArcObj(item.data.list)) {
      return childItems.length
        ? [{ title: String(item.title || arcFolderFallback()), children: childItems }]
        : [];
    }
    return childItems;
  };
  return build(rootId);
}

// 木から Pin(葉)だけをフラットに取り出す
function flattenArcPins(items) {
  return items.flatMap((item) =>
    Array.isArray(item.children) ? flattenArcPins(item.children) : [item]
  );
}

// 木全体で URL の重複を除き、空になったフォルダを落とす
function dedupeTree(items, seen = new Set()) {
  const out = [];
  for (const item of items) {
    if (Array.isArray(item.children)) {
      const children = dedupeTree(item.children, seen);
      if (children.length) out.push({ title: item.title, children });
    } else {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
    }
  }
  return out;
}

globalThis.parseArcSidebar = parseArcSidebar;
