// Tab Harbor - service worker
// Space = タブグループ(要件 §4 方式A)。グループ ID は揮発するため、
// 「グループのタイトル = Space 名」を永続的な対応付けの根拠にする。

const NO_GROUP = -1; // chrome.tabGroups.TAB_GROUP_ID_NONE
const DEFAULT_SPACE = { name: "Home", color: "blue" };
const GROUP_COLORS = ["blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange", "grey"];
const RESTORABLE_URL = /^(https?|file):/;

// ---------------------------------------------------------------------------
// 直列化キュー: タブ/グループ操作とセッション状態の更新を競合させない
// ---------------------------------------------------------------------------
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch((e) => console.warn("[TabHarbor]", e));
  return run;
}

// ---------------------------------------------------------------------------
// 永続データ (storage.local): Space 定義と Pin
//   storage.sync は per-item 8KB 上限があり大量 Pin で quota 超過するため local を使う。
//   spacesOrder: [spaceId, ...]
//   space:<id>:  { id, name, color, pins: [{ id, title, url }] }
// ---------------------------------------------------------------------------
async function getOrder() {
  const { spacesOrder = [] } = await chrome.storage.local.get("spacesOrder");
  return spacesOrder;
}
async function setOrder(order) {
  await chrome.storage.local.set({ spacesOrder: order });
}
async function getSpace(id) {
  const key = "space:" + id;
  const obj = await chrome.storage.local.get(key);
  return obj[key] ?? null;
}
async function saveSpace(space) {
  await chrome.storage.local.set({ ["space:" + space.id]: space });
}
async function getAllSpaces() {
  const order = await getOrder();
  if (!order.length) return [];
  const obj = await chrome.storage.local.get(order.map((id) => "space:" + id));
  return order.map((id) => obj["space:" + id]).filter(Boolean);
}

// storage.sync にデータが残っている場合は storage.local へ一度だけ移行する
async function migrateFromSync() {
  const { spacesOrder } = await chrome.storage.sync.get("spacesOrder");
  if (!Array.isArray(spacesOrder) || !spacesOrder.length) return;
  const { spacesOrder: localOrder } = await chrome.storage.local.get("spacesOrder");
  if (localOrder) return; // 移行済み
  const keys = ["spacesOrder", ...spacesOrder.map((id) => "space:" + id)];
  const data = await chrome.storage.sync.get(keys);
  await chrome.storage.local.set(data);
  await chrome.storage.sync.remove(keys).catch(() => {});
}

// ---------------------------------------------------------------------------
// セッション状態 (storage.session): ウィンドウごとの Space⇄グループ対応
//   bindings: { [windowId]: { activeSpaceId, groups: {spaceId: groupId},
//                             lastTab: {spaceId: tabId} } }
// ---------------------------------------------------------------------------
async function getBindings() {
  const { bindings = {} } = await chrome.storage.session.get("bindings");
  return bindings;
}
async function setBindings(bindings) {
  await chrome.storage.session.set({ bindings });
}

// ---------------------------------------------------------------------------
// 初期化・再関連付け
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener((details) => {
  enqueue(async () => {
    await init();
    if (details.reason === "install") await adoptAllWindows();
  });
});
chrome.runtime.onStartup.addListener(() => enqueue(init));

async function init() {
  await migrateFromSync();
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  let order = await getOrder();
  if (!order.length) {
    const space = {
      id: crypto.randomUUID(),
      name: DEFAULT_SPACE.name,
      color: DEFAULT_SPACE.color,
      pins: [],
    };
    await saveSpace(space);
    await setOrder([space.id]);
  }
  await reassociateAll();
}

// openPanelOnActionClick が効かない環境向けのフォールバック
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

async function reassociateAll() {
  const spaces = await getAllSpaces();
  const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const bindings = {};
  for (const win of wins) {
    bindings[win.id] = await bindWindow(win.id, spaces);
  }
  await setBindings(bindings);
  broadcast();
}

// ウィンドウ内のタブグループを名前で Space と突き合わせる
async function bindWindow(windowId, spaces) {
  const b = { activeSpaceId: null, groups: {}, lastTab: {} };
  const groups = await chrome.tabGroups.query({ windowId }).catch(() => []);
  const byName = new Map(spaces.map((s) => [s.name, s]));
  for (const g of groups) {
    const s = byName.get(g.title);
    if (s && !(s.id in b.groups)) b.groups[s.id] = g.id;
  }
  const [activeTab] = await chrome.tabs.query({ windowId, active: true });
  if (activeTab && activeTab.groupId !== NO_GROUP) {
    const sid = Object.keys(b.groups).find(
      (id) => b.groups[id] === activeTab.groupId
    );
    if (sid) b.activeSpaceId = sid;
  }
  if (!b.activeSpaceId) b.activeSpaceId = spaces[0]?.id ?? null;
  return b;
}

// 初回インストール時: 既存のグループ外タブを各ウィンドウのアクティブ Space に収容
async function adoptAllWindows() {
  const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
  for (const win of wins) {
    const tabs = await chrome.tabs.query({
      windowId: win.id,
      groupId: NO_GROUP,
    });
    const ids = tabs.filter((t) => !t.pinned).map((t) => t.id);
    if (ids.length) await groupIntoActiveSpace(win.id, ids);
  }
  broadcast();
}

// ---------------------------------------------------------------------------
// Space 操作
// ---------------------------------------------------------------------------
async function switchSpace(windowId, spaceId) {
  const space = await getSpace(spaceId);
  if (!space) return;
  const bindings = await getBindings();
  const b = bindings[windowId] ?? { activeSpaceId: null, groups: {}, lastTab: {} };

  // 直前の Space のアクティブタブを記憶(戻ってきた時に復帰)
  const [cur] = await chrome.tabs.query({ windowId, active: true });
  if (cur && b.activeSpaceId) b.lastTab[b.activeSpaceId] = cur.id;

  let gid = await liveGroupId(b, spaceId);
  if (gid === undefined) {
    // このウィンドウにグループが無い → 前回保存した URL から復元、無ければ新規タブ
    gid = await materializeSpace(windowId, space);
    b.groups[spaceId] = gid;
  }

  const tabsInGroup = await chrome.tabs.query({ windowId, groupId: gid });
  const target =
    tabsInGroup.find((t) => t.id === b.lastTab[spaceId]) ?? tabsInGroup[0];

  b.activeSpaceId = spaceId;
  bindings[windowId] = b;
  await setBindings(bindings);

  await chrome.tabGroups.update(gid, { collapsed: false }).catch(() => {});
  if (target) await chrome.tabs.update(target.id, { active: true });

  // 他の管理下グループは折りたたむ(アクティブタブを含むと失敗するので後段で)
  for (const [sid, otherGid] of Object.entries(b.groups)) {
    if (sid === spaceId) continue;
    chrome.tabGroups.update(otherGid, { collapsed: true }).catch(() => {});
  }
  broadcast();
}

// groupId がまだ生きていれば返し、死んでいれば binding から除去
async function liveGroupId(binding, spaceId) {
  const gid = binding.groups[spaceId];
  if (gid === undefined) return undefined;
  try {
    await chrome.tabGroups.get(gid);
    return gid;
  } catch {
    delete binding.groups[spaceId];
    return undefined;
  }
}

// Space のグループをウィンドウ内に実体化する(保存 URL の復元つき)
async function materializeSpace(windowId, space) {
  const key = "savedTabs:" + space.id;
  const { [key]: saved = [] } = await chrome.storage.local.get(key);
  const tabIds = [];
  for (const url of saved.filter((u) => RESTORABLE_URL.test(u))) {
    try {
      const t = await chrome.tabs.create({ windowId, url, active: false });
      tabIds.push(t.id);
    } catch {
      /* 開けない URL はスキップ */
    }
  }
  if (!tabIds.length) {
    const t = await chrome.tabs.create({ windowId, active: false });
    tabIds.push(t.id);
  }
  const gid = await chrome.tabs.group({
    tabIds,
    createProperties: { windowId },
  });
  await chrome.tabGroups.update(gid, { title: space.name, color: space.color });
  return gid;
}

async function createSpace(windowId, name, color) {
  const space = { id: crypto.randomUUID(), name, color, pins: [] };
  await saveSpace(space);
  await setOrder([...(await getOrder()), space.id]);
  await switchSpace(windowId, space.id);
  return space.id;
}

async function updateSpace(spaceId, patch) {
  const space = await getSpace(spaceId);
  if (!space) return;
  Object.assign(space, patch);
  await saveSpace(space);
  // 全ウィンドウの対応グループへ名前・色を反映
  const bindings = await getBindings();
  for (const b of Object.values(bindings)) {
    const gid = b.groups[spaceId];
    if (gid !== undefined) {
      chrome.tabGroups
        .update(gid, { title: space.name, color: space.color })
        .catch(() => {});
    }
  }
  broadcast();
}

async function deleteSpace(windowId, spaceId) {
  const order = await getOrder();
  if (order.length <= 1) return; // 最後の 1 つは消せない
  const bindings = await getBindings();
  // 全ウィンドウで対応グループのタブを閉じる
  for (const b of Object.values(bindings)) {
    const gid = b.groups[spaceId];
    if (gid !== undefined) {
      const tabs = await chrome.tabs.query({ groupId: gid }).catch(() => []);
      if (tabs.length) await chrome.tabs.remove(tabs.map((t) => t.id)).catch(() => {});
      delete b.groups[spaceId];
    }
    delete b.lastTab[spaceId];
  }
  const newOrder = order.filter((id) => id !== spaceId);
  await setOrder(newOrder);
  await chrome.storage.local.remove("space:" + spaceId);
  await chrome.storage.local.remove("savedTabs:" + spaceId);
  for (const b of Object.values(bindings)) {
    if (b.activeSpaceId === spaceId) b.activeSpaceId = newOrder[0];
  }
  await setBindings(bindings);
  if (bindings[windowId]) await switchSpace(windowId, newOrder[0]);
  broadcast();
}

// ---------------------------------------------------------------------------
// タブの自動収容: グループ外の新規タブをアクティブ Space に入れる
// ---------------------------------------------------------------------------
async function groupIntoActiveSpace(windowId, tabIds) {
  const bindings = await getBindings();
  let b = bindings[windowId];
  if (!b) {
    b = await bindWindow(windowId, await getAllSpaces());
    bindings[windowId] = b;
  }
  const sid = b.activeSpaceId;
  if (!sid) return;
  const space = await getSpace(sid);
  if (!space) return;

  const gid = await liveGroupId(b, sid);
  if (gid !== undefined) {
    await chrome.tabs.group({ tabIds, groupId: gid }).catch(() => {});
  } else {
    const newGid = await chrome.tabs.group({
      tabIds,
      createProperties: { windowId },
    });
    await chrome.tabGroups.update(newGid, {
      title: space.name,
      color: space.color,
    });
    b.groups[sid] = newGid;
  }
  await setBindings(bindings);
}

async function adoptTab(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return; // すでに閉じられた
  }
  if (tab.groupId !== NO_GROUP || tab.pinned) return;
  const win = await chrome.windows.get(tab.windowId).catch(() => null);
  if (!win || win.type !== "normal") return;
  await groupIntoActiveSpace(tab.windowId, [tabId]);
}

// ---------------------------------------------------------------------------
// Pin 操作
//   space.pins は木構造: Pin = {id, title, url} /
//   フォルダ = {id, title, children: [...], collapsed?}(ネスト可)
// ---------------------------------------------------------------------------
function isFolder(item) {
  return Array.isArray(item?.children);
}

// 木を辿って Pin(葉)だけを列挙する
function* iterPins(items) {
  for (const item of items ?? []) {
    if (isFolder(item)) yield* iterPins(item.children);
    else yield item;
  }
}

// 木構造を保ったまま Pin(葉)だけを変換する
function mapPinTree(items, fn) {
  return (items ?? []).map((item) =>
    isFolder(item) ? { ...item, children: mapPinTree(item.children, fn) } : fn(item)
  );
}

// URL 比較用の正規化(ハッシュのみ無視)
function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    return x.href;
  } catch {
    return u;
  }
}

// id の item と「その親配列・位置」を返す
function findItem(items, id) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.id === id) return { parent: items, index: i, item };
    if (isFolder(item)) {
      const found = findItem(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

async function addPinFromTab(windowId) {
  const bindings = await getBindings();
  const sid = bindings[windowId]?.activeSpaceId;
  if (!sid) return;
  const space = await getSpace(sid);
  const [tab] = await chrome.tabs.query({ windowId, active: true });
  if (!space || !tab || !tab.url || !RESTORABLE_URL.test(tab.url)) return;
  await addPin(sid, tab.title, tab.url);
}

async function addPin(spaceId, title, url) {
  const space = await getSpace(spaceId);
  if (!space) return;
  for (const pin of iterPins(space.pins)) {
    if (pin.url === url) return; // 重複 Pin は作らない(フォルダ内も含む)
  }
  space.pins.push({
    id: crypto.randomUUID(),
    title: (title || url).slice(0, 200),
    url,
  });
  await saveSpace(space);
  broadcast();
}

// Pin / フォルダ共通の削除(フォルダは子ごと消える)
async function removeItem(spaceId, itemId) {
  const space = await getSpace(spaceId);
  if (!space) return;
  const found = findItem(space.pins, itemId);
  if (!found) return;
  found.parent.splice(found.index, 1);
  await saveSpace(space);
  broadcast();
}

// item を targetFolderId(null = ルート)の targetIndex へ移動する
async function moveItem(spaceId, itemId, targetFolderId, targetIndex) {
  const space = await getSpace(spaceId);
  if (!space) return;
  const src = findItem(space.pins, itemId);
  if (!src) return;

  let target = space.pins;
  if (targetFolderId) {
    // フォルダを自分自身・子孫の中へは移動させない(循環防止)
    if (isFolder(src.item) && (src.item.id === targetFolderId || findItem(src.item.children, targetFolderId))) {
      return;
    }
    const folder = findItem(space.pins, targetFolderId);
    if (!folder || !isFolder(folder.item)) return;
    target = folder.item.children;
  }

  const [moved] = src.parent.splice(src.index, 1);
  let index = Number.isInteger(targetIndex) ? targetIndex : target.length;
  if (target === src.parent && src.index < index) index--;
  target.splice(Math.max(0, Math.min(index, target.length)), 0, moved);
  await saveSpace(space);
  broadcast();
}

async function createFolder(spaceId, title) {
  const space = await getSpace(spaceId);
  if (!space) return;
  space.pins.push({
    id: crypto.randomUUID(),
    title: String(title || "フォルダ").trim().slice(0, 80) || "フォルダ",
    children: [],
    collapsed: true,
  });
  await saveSpace(space);
  broadcast();
}

async function renameFolder(spaceId, folderId, title) {
  const space = await getSpace(spaceId);
  if (!space) return;
  const found = findItem(space.pins, folderId);
  if (!found || !isFolder(found.item)) return;
  found.item.title = String(title || "").trim().slice(0, 80) || found.item.title;
  await saveSpace(space);
  broadcast();
}

async function toggleFolder(spaceId, folderId) {
  const space = await getSpace(spaceId);
  if (!space) return;
  const found = findItem(space.pins, folderId);
  if (!found || !isFolder(found.item)) return;
  found.item.collapsed = !found.item.collapsed;
  await saveSpace(space);
  broadcast();
}

// customTitle を設定する。空文字で渡すと解除してライブタイトルに戻す。
async function renamePin(spaceId, pinId, customTitle) {
  const space = await getSpace(spaceId);
  if (!space) return;
  const found = findItem(space.pins, pinId);
  if (!found || isFolder(found.item)) return;
  const title = String(customTitle || "").trim().slice(0, 200);
  if (title) {
    found.item.customTitle = title;
  } else {
    delete found.item.customTitle;
  }
  await saveSpace(space);
  broadcast();
}

// Pin クリック(Arc の Pinned Tab 挙動):
// Pin は「自分のタブ」を 1 つ持つ。束縛済みタブがあれば URL が変わっていても
// そこへフォーカス。なければ URL 一致タブを束縛、それも無ければ新規に開いて束縛する。
// 束縛は session 状態(bindings[windowId].pinTabs = {pinId: tabId})。
async function openPin(windowId, spaceId, pinId) {
  const space = await getSpace(spaceId);
  const pin = space ? findItem(space.pins, pinId)?.item : null;
  if (!pin?.url) return;
  const bindings = await getBindings();
  const b = bindings[windowId] ?? { activeSpaceId: spaceId, groups: {}, lastTab: {} };
  b.pinTabs ??= {};
  const gid = b.groups[spaceId];

  // 1. 束縛済みのタブ(ページ内遷移していてもそのまま)
  let tab = null;
  if (b.pinTabs[pinId] !== undefined) {
    tab = await chrome.tabs.get(b.pinTabs[pinId]).catch(() => null);
    if (tab && tab.windowId !== windowId) tab = null;
  }
  // 2. URL が一致する既存タブを引き当てて束縛
  if (!tab) {
    const all = await chrome.tabs.query({ windowId });
    const bound = new Set(Object.values(b.pinTabs));
    const matches = all.filter(
      (t) =>
        !bound.has(t.id) &&
        (normUrl(t.url || "") === normUrl(pin.url) ||
          normUrl(t.pendingUrl || "") === normUrl(pin.url))
    );
    tab = matches.find((t) => t.groupId === gid) ?? matches[0] ?? null;
  }
  // 3. 新規に開く(Space のグループ内へ)
  if (!tab) {
    tab = await chrome.tabs.create({ windowId, url: pin.url, active: true });
    if (gid !== undefined) {
      await chrome.tabs.group({ tabIds: [tab.id], groupId: gid }).catch(() => {});
    }
  }
  b.pinTabs[pinId] = tab.id;
  bindings[windowId] = b;
  await setBindings(bindings);
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
  broadcast();
}

// ---------------------------------------------------------------------------
// Arc インポート: パース済みの Space 一覧を既存データにマージする
//   同名 Space は Pin を統合(URL 重複はスキップ)、それ以外は新規作成。
//   unpinned タブは savedTabs に入れ、初回切替時に復元されるようにする。
// ---------------------------------------------------------------------------
async function importSpaces(imported) {
  if (!Array.isArray(imported)) throw new Error("invalid import payload");
  const spaces = await getAllSpaces();
  const order = await getOrder();
  const byName = new Map(spaces.map((s) => [s.name, s]));
  const usedColors = spaces.map((s) => s.color);
  const summary = { created: 0, merged: 0, pinsAdded: 0 };

  for (const imp of imported) {
    const name = String(imp?.name ?? "").trim().slice(0, 40) || "Arc";
    let space = byName.get(name);
    if (!space) {
      space = { id: crypto.randomUUID(), name, color: pickColor(usedColors), pins: [] };
      usedColors.push(space.color);
      order.push(space.id);
      byName.set(name, space);
      summary.created++;
    } else {
      summary.merged++;
    }

    const haveUrls = new Set([...iterPins(space.pins)].map((p) => p.url));
    mergeImportedItems(space.pins, imp.pins ?? [], haveUrls, summary);
    await saveSpace(space);

    // savedTabs は既存分を先頭にした URL の和集合(上限 50)
    const importedTabs = (imp.savedTabs ?? []).filter((u) => RESTORABLE_URL.test(u));
    if (importedTabs.length) {
      const key = "savedTabs:" + space.id;
      const { [key]: existing = [] } = await chrome.storage.local.get(key);
      const union = [...new Set([...existing, ...importedTabs])].slice(0, 50);
      await chrome.storage.local.set({ [key]: union });
    }
  }
  await setOrder(order);
  broadcast();
  return summary;
}

// インポートされた木を既存の木へマージする。
// フォルダは同階層の同名フォルダへ統合、Pin は URL 重複を Space 全体でスキップ。
function mergeImportedItems(target, imported, haveUrls, summary) {
  for (const item of imported) {
    if (item && Array.isArray(item.children)) {
      const title = String(item.title ?? "フォルダ").trim().slice(0, 80) || "フォルダ";
      let folder = target.find((t) => isFolder(t) && t.title === title);
      let created = false;
      if (!folder) {
        folder = { id: crypto.randomUUID(), title, children: [], collapsed: true };
        target.push(folder);
        created = true;
      }
      mergeImportedItems(folder.children, item.children, haveUrls, summary);
      // 中身がすべて重複だった新規フォルダは残さない
      if (created && !folder.children.length) target.splice(target.indexOf(folder), 1);
    } else if (item?.url) {
      if (haveUrls.has(item.url) || !RESTORABLE_URL.test(item.url)) continue;
      target.push({
        id: crypto.randomUUID(),
        title: String(item.title || item.url).slice(0, 200),
        url: item.url,
      });
      haveUrls.add(item.url);
      summary.pinsAdded++;
    }
  }
}

function pickColor(usedColors) {
  return (
    GROUP_COLORS.find((c) => !usedColors.includes(c)) ??
    GROUP_COLORS[usedColors.length % GROUP_COLORS.length]
  );
}

// ---------------------------------------------------------------------------
// パネル向け状態のスナップショット
// ---------------------------------------------------------------------------
async function getState(windowId) {
  const spaces = await getAllSpaces();
  const bindings = await getBindings();
  let b = bindings[windowId];
  if (!b) {
    b = await bindWindow(windowId, spaces);
    bindings[windowId] = b;
    await setBindings(bindings);
  }
  const active = spaces.find((s) => s.id === b.activeSpaceId) ?? spaces[0];

  let groupTabs = [];
  const gid = active ? b.groups[active.id] : undefined;
  if (gid !== undefined) {
    groupTabs = await chrome.tabs.query({ windowId, groupId: gid }).catch(() => []);
  }
  const ungrouped = await chrome.tabs
    .query({ windowId, groupId: NO_GROUP })
    .catch(() => []);
  const allTabs = [...groupTabs, ...ungrouped];
  const byTabId = new Map(allTabs.map((t) => [t.id, t]));

  // Pin⇄タブの束縛を解決する(Arc の Pinned Tab)。
  // pass1: 既存の束縛のうち生きているものを採用
  // pass2: 未束縛の Pin に URL 一致タブを自動束縛
  b.pinTabs ??= {};
  const boundTabIds = new Set();
  const activePins = active?.pins ?? [];
  for (const pin of iterPins(activePins)) {
    const tab = byTabId.get(b.pinTabs[pin.id]);
    if (tab) boundTabIds.add(tab.id);
    else delete b.pinTabs[pin.id];
  }
  for (const pin of iterPins(activePins)) {
    if (b.pinTabs[pin.id] !== undefined) continue;
    const tab = allTabs.find(
      (t) => !boundTabIds.has(t.id) && normUrl(t.url || t.pendingUrl || "") === normUrl(pin.url)
    );
    if (tab) {
      b.pinTabs[pin.id] = tab.id;
      boundTabIds.add(tab.id);
    }
  }
  bindings[windowId] = b;
  await setBindings(bindings);

  const toView = (t) => ({
    id: t.id,
    title: t.title || t.pendingUrl || t.url || "",
    url: t.url || t.pendingUrl || "",
    favIconUrl: t.favIconUrl || "",
    active: t.active,
    audible: t.audible,
    grouped: t.groupId !== NO_GROUP,
  });

  return {
    windowId,
    activeSpaceId: active?.id ?? null,
    spaces: spaces.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      pinCount: [...iterPins(s.pins)].length,
    })),
    // Pin には束縛タブの状態(ライブタイトル・アクティブ・favicon)を焼き込む
    pins: mapPinTree(activePins, (pin) => {
      const tab = byTabId.get(b.pinTabs[pin.id]);
      return {
        ...pin,
        tabId: tab?.id ?? null,
        liveTitle: tab?.title ?? null,
        favIconUrl: tab?.favIconUrl ?? "",
        active: !!tab?.active,
      };
    }),
    // 束縛済みタブは「タブ」一覧に出さない(Pin 行がそのタブを表す)
    tabs: allTabs.filter((t) => !boundTabIds.has(t.id)).map(toView),
  };
}

// ---------------------------------------------------------------------------
// 再起動復元用スナップショット (storage.local: savedTabs:<spaceId>)
// ---------------------------------------------------------------------------
let snapshotTimer = null;
function scheduleSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => enqueue(snapshotTabs), 1500);
}
async function snapshotTabs() {
  const bindings = await getBindings();
  const bySpace = {};
  for (const b of Object.values(bindings)) {
    for (const [sid, gid] of Object.entries(b.groups)) {
      const tabs = await chrome.tabs.query({ groupId: gid }).catch(() => []);
      const urls = tabs
        .map((t) => t.pendingUrl || t.url || "")
        .filter((u) => RESTORABLE_URL.test(u));
      if (urls.length) bySpace[sid] = [...(bySpace[sid] ?? []), ...urls];
    }
  }
  const payload = {};
  for (const [sid, urls] of Object.entries(bySpace)) {
    payload["savedTabs:" + sid] = urls.slice(0, 50);
  }
  if (Object.keys(payload).length) await chrome.storage.local.set(payload);
}

// ---------------------------------------------------------------------------
// イベント
// ---------------------------------------------------------------------------
let broadcastTimer = null;
function broadcast() {
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ type: "harbor:changed" }).catch(() => {});
  }, 120);
}

chrome.tabs.onCreated.addListener((tab) => {
  // opener 側で後からグループに入れられるケースがあるため少し待つ
  setTimeout(() => enqueue(() => adoptTab(tab.id)), 300);
  scheduleSnapshot();
  broadcast();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  // Pin の束縛タブが閉じられたら束縛を解く(Pin 自体は残る)
  enqueue(async () => {
    const bindings = await getBindings();
    let changed = false;
    for (const b of Object.values(bindings)) {
      for (const [pinId, boundId] of Object.entries(b.pinTabs ?? {})) {
        if (boundId === tabId) {
          delete b.pinTabs[pinId];
          changed = true;
        }
      }
    }
    if (changed) await setBindings(bindings);
  });
  scheduleSnapshot();
  broadcast();
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url || info.title || info.favIconUrl || info.groupId !== undefined) {
    scheduleSnapshot();
    broadcast();
  }
});
chrome.tabs.onMoved.addListener(() => broadcast());
chrome.tabs.onAttached.addListener((tabId) => {
  setTimeout(() => enqueue(() => adoptTab(tabId)), 300);
  broadcast();
});

// ユーザーがタブバー側で他 Space のタブをクリックした場合に追随する
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  enqueue(async () => {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return;
    }
    if (tab.groupId === NO_GROUP) return;
    const bindings = await getBindings();
    const b = bindings[windowId];
    if (!b) return;
    const sid = Object.keys(b.groups).find((id) => b.groups[id] === tab.groupId);
    if (sid && sid !== b.activeSpaceId) {
      b.activeSpaceId = sid;
      await setBindings(bindings);
    }
    broadcast();
  });
});

chrome.tabGroups.onRemoved.addListener((group) => {
  enqueue(async () => {
    const bindings = await getBindings();
    for (const b of Object.values(bindings)) {
      for (const [sid, gid] of Object.entries(b.groups)) {
        if (gid === group.id) delete b.groups[sid];
      }
    }
    await setBindings(bindings);
    broadcast();
  });
});

chrome.windows.onCreated.addListener((win) => {
  if (win.type !== "normal") return;
  enqueue(async () => {
    const bindings = await getBindings();
    bindings[win.id] = await bindWindow(win.id, await getAllSpaces());
    await setBindings(bindings);
    broadcast();
  });
});
chrome.windows.onRemoved.addListener((windowId) => {
  enqueue(async () => {
    const bindings = await getBindings();
    delete bindings[windowId];
    await setBindings(bindings);
  });
});

// ---------------------------------------------------------------------------
// ショートカット: Space 巡回
// ---------------------------------------------------------------------------
chrome.commands.onCommand.addListener((command) => {
  if (command !== "next-space" && command !== "prev-space") return;
  enqueue(async () => {
    const win = await chrome.windows
      .getLastFocused({ windowTypes: ["normal"] })
      .catch(() => null);
    if (!win) return;
    const order = await getOrder();
    if (order.length < 2) return;
    const bindings = await getBindings();
    const cur = bindings[win.id]?.activeSpaceId ?? order[0];
    let i = order.indexOf(cur);
    if (i < 0) i = 0;
    const step = command === "next-space" ? 1 : order.length - 1;
    await switchSpace(win.id, order[(i + step) % order.length]);
  });
});

// ---------------------------------------------------------------------------
// パネルからのメッセージ
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string" || msg.type.startsWith("harbor:")) {
    return false;
  }
  dispatch(msg).then(
    (result) => sendResponse(result ?? { ok: true }),
    (err) => sendResponse({ error: String(err) })
  );
  return true; // 非同期応答
});

async function dispatch(msg) {
  switch (msg.type) {
    case "getState":
      return getState(msg.windowId);
    case "switchSpace":
      return enqueue(() => switchSpace(msg.windowId, msg.spaceId));
    case "createSpace":
      return enqueue(() => createSpace(msg.windowId, msg.name, msg.color));
    case "updateSpace":
      return enqueue(() => updateSpace(msg.spaceId, msg.patch));
    case "deleteSpace":
      return enqueue(() => deleteSpace(msg.windowId, msg.spaceId));
    case "addPinFromTab":
      return enqueue(() => addPinFromTab(msg.windowId));
    case "pinTab": {
      return enqueue(async () => {
        const tab = await chrome.tabs.get(msg.tabId).catch(() => null);
        if (tab && tab.url && RESTORABLE_URL.test(tab.url)) {
          await addPin(msg.spaceId, tab.title, tab.url);
        }
      });
    }
    case "removeItem":
      return enqueue(() => removeItem(msg.spaceId, msg.itemId));
    case "moveItem":
      return enqueue(() =>
        moveItem(msg.spaceId, msg.itemId, msg.targetFolderId ?? null, msg.targetIndex)
      );
    case "createFolder":
      return enqueue(() => createFolder(msg.spaceId, msg.title));
    case "renameFolder":
      return enqueue(() => renameFolder(msg.spaceId, msg.folderId, msg.title));
    case "toggleFolder":
      return enqueue(() => toggleFolder(msg.spaceId, msg.folderId));
    case "renamePin":
      return enqueue(() => renamePin(msg.spaceId, msg.pinId, msg.customTitle));
    case "openPin":
      return enqueue(() => openPin(msg.windowId, msg.spaceId, msg.pinId));
    case "importArc":
      return enqueue(() => importSpaces(msg.spaces));
    case "activateTab":
      return chrome.tabs.update(msg.tabId, { active: true });
    case "closeTab":
      return chrome.tabs.remove(msg.tabId);
    case "newTab":
      return chrome.tabs.create({ windowId: msg.windowId, active: true });
    default:
      throw new Error("unknown message: " + msg.type);
  }
}
