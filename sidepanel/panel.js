// Tab Harbor - side panel UI
// ロジックはすべて background.js 側。ここは表示とメッセージ送信のみ。

const GROUP_COLOR_HEX = {
  grey: "#5f6368",
  blue: "#3b78e7",
  red: "#d93025",
  yellow: "#e8a600",
  green: "#188038",
  pink: "#d01884",
  purple: "#a142f4",
  cyan: "#0097a7",
  orange: "#e8710a",
};

const $ = (sel) => document.querySelector(sel);
const els = {
  spaceDot: $("#space-dot"),
  spaceName: $("#space-name"),
  editSpace: $("#edit-space"),
  chips: $("#space-chips"),
  globalPinList: $("#global-pin-list"),
  globalPinCurrent: $("#global-pin-current"),
  globalNewFolder: $("#global-new-folder"),
  pinList: $("#pin-list"),
  pinCurrent: $("#pin-current"),
  tabList: $("#tab-list"),
  newTab: $("#new-tab"),
  tooltip: $("#tooltip"),
  dialog: $("#space-dialog"),
  dialogTitle: $("#dialog-title"),
  form: $("#space-form"),
  nameInput: $("#space-name-input"),
  swatches: $("#color-swatches"),
  deleteBtn: $("#delete-space"),
  cancelBtn: $("#dialog-cancel"),
  importArc: $("#import-arc"),
  arcFile: $("#arc-file"),
  importDialog: $("#import-dialog"),
  importBody: $("#import-body"),
  importConfirm: $("#import-confirm"),
  importCancel: $("#import-cancel"),
  newFolder: $("#new-folder"),
  folderDialog: $("#folder-dialog"),
  folderForm: $("#folder-form"),
  folderDialogTitle: $("#folder-dialog-title"),
  folderNameInput: $("#folder-name-input"),
  folderCancel: $("#folder-cancel"),
  pinEditDialog: $("#pin-edit-dialog"),
  pinEditForm: $("#pin-edit-form"),
  pinEditNameInput: $("#pin-edit-name-input"),
  pinEditUrlInput: $("#pin-edit-url-input"),
  pinEditCancel: $("#pin-edit-cancel"),
};

let windowId = null;
let state = null;
let dialogMode = null; // "create" | "edit"
let selectedColor = "blue";
let gpContextMenuEl = null; // 表示中のコンテキストメニュー要素
let pinEditState = null;    // { pin, spaceId }
let dragItemId = null;      // DnD 中の Pin / フォルダの id
let dragItemSpaceId = null; // DnD 中のアイテムの spaceId (null = 共通 Pin)
let dragTabId = null;       // DnD 中のタブ id
let folderDialogState = null; // { mode, folderId?, spaceId }

init();

async function init() {
  const win = await chrome.windows.getCurrent();
  windowId = win.id;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "harbor:changed") refreshSoon();
  });
  bindStaticHandlers();
  buildSwatches();
  await refresh();
}

// Service Worker が停止直後だとチャネルが閉じてエラーになる(MV3 既知問題)。
// 150ms 待ってから 1 度だけリトライし、それでも失敗したら警告を出して null を返す。
async function send(msg) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      console.warn("[TabHarbor panel]", e);
      return null;
    }
  }
}

let refreshTimer = null;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 80);
}

async function refresh() {
  const next = await send({ type: "getState", windowId });
  if (!next || next.error) return;
  state = next;
  render();
}

// ---------------------------------------------------------------------------
// レンダリング
// ---------------------------------------------------------------------------
function render() {
  const active = state.spaces.find((s) => s.id === state.activeSpaceId);
  const accent = GROUP_COLOR_HEX[active?.color] ?? GROUP_COLOR_HEX.blue;
  document.documentElement.style.setProperty("--accent", accent);
  els.spaceName.textContent = active?.name ?? "Tab Harbor";

  renderChips();
  renderGlobalPins();
  renderPins();
  renderTabs();
}

function renderChips() {
  els.chips.replaceChildren();
  for (const space of state.spaces) {
    const chip = document.createElement("button");
    chip.className = "chip" + (space.id === state.activeSpaceId ? " active" : "");
    chip.style.background = GROUP_COLOR_HEX[space.color] ?? GROUP_COLOR_HEX.grey;
    chip.textContent = [...space.name][0]?.toUpperCase() ?? "?";
    chip.title = space.name;
    chip.addEventListener("click", () => {
      send({ type: "switchSpace", windowId, spaceId: space.id });
    });
    els.chips.appendChild(chip);
  }
  const add = document.createElement("button");
  add.className = "chip add";
  add.textContent = "+";
  add.title = "新しい Space を作成";
  add.addEventListener("click", () => openDialog("create"));
  els.chips.appendChild(add);
}

function renderGlobalPins() {
  els.globalPinList.replaceChildren();
  const items = state.globalPins ?? [];

  const strip = document.createElement("div");
  strip.className = "global-pin-icons";

  if (!items.length) {
    strip.classList.add("empty");
    strip.textContent = "タブをドロップ、または「＋ 現在のタブ」で追加";
    strip.addEventListener("dragover", (e) => {
      if (!dragTabId && !dragItemId) return;
      e.preventDefault();
      strip.classList.add("drag-over");
    });
    strip.addEventListener("dragleave", () => strip.classList.remove("drag-over"));
    strip.addEventListener("drop", (e) => {
      e.preventDefault();
      strip.classList.remove("drag-over");
      if (dragTabId) {
        send({ type: "pinTabAt", spaceId: null, tabId: dragTabId, targetFolderId: null, targetIndex: undefined });
        dragTabId = null;
      } else if (dragItemId) {
        if (dragItemSpaceId !== null) {
          send({ type: "transferPin", fromSpaceId: dragItemSpaceId, toSpaceId: null, itemId: dragItemId, targetFolderId: null, targetIndex: undefined });
        }
        dragItemId = null;
        dragItemSpaceId = null;
      }
    });
    els.globalPinList.appendChild(strip);
    return;
  }

  renderGlobalIconLevel(items, null, strip);

  const endZone = document.createElement("div");
  endZone.className = "global-pin-end-zone";
  bindDropTarget(endZone, () => ({ targetFolderId: null, targetIndex: undefined }), null);
  strip.appendChild(endZone);

  els.globalPinList.appendChild(strip);
}

function renderGlobalIconLevel(items, containerId, strip) {
  items.forEach((item, index) => {
    if (Array.isArray(item.children)) {
      strip.appendChild(globalFolderIcon(item, containerId, index));
      if (!item.collapsed) {
        const sub = document.createElement("div");
        sub.className = "gp-subfolder";
        renderGlobalIconLevel(item.children, item.id, sub);
        strip.appendChild(sub);
      }
    } else {
      strip.appendChild(globalPinIcon(item, containerId, index));
    }
  });
}

function globalPinIcon(pin, containerId, index) {
  const btn = document.createElement("button");
  btn.className = "gp-icon" + (pin.active ? " active-tab" : "");
  btn.draggable = true;
  btn.appendChild(faviconEl(pin.url, pin.favIconUrl || ""));

  btn.addEventListener("click", () =>
    send({ type: "openGlobalPin", windowId, pinId: pin.id })
  );
  btn.addEventListener("contextmenu", (e) => showGpContextMenu(e, pin, null));
  btn.addEventListener("mouseenter", () =>
    showTooltip(btn, pin.customTitle || pin.liveTitle || pin.title, pin.url)
  );
  btn.addEventListener("mouseleave", hideTooltip);
  btn.addEventListener("dragstart", () => {
    dragItemId = pin.id;
    dragItemSpaceId = null;
    hideTooltip();
  });
  bindDropTarget(btn, () => ({ targetFolderId: containerId, targetIndex: index }), null);
  return btn;
}

function globalFolderIcon(folder, containerId, index) {
  const btn = document.createElement("button");
  btn.className = "gp-icon";
  btn.title = `${folder.title} (${countPins(folder.children)}件)`;
  btn.draggable = true;

  const icon = document.createElement("span");
  icon.textContent = folder.collapsed ? "📁" : "📂";
  icon.style.pointerEvents = "none";
  btn.appendChild(icon);

  btn.addEventListener("click", () =>
    send({ type: "toggleFolder", spaceId: null, folderId: folder.id })
  );
  btn.addEventListener("contextmenu", (e) => showGpContextMenu(e, folder, null));
  btn.addEventListener("dblclick", () => openFolderDialog("rename", folder, null));
  btn.addEventListener("dragstart", (e) => {
    dragItemId = folder.id;
    dragItemSpaceId = null;
    e.stopPropagation();
  });
  bindDropTarget(btn, () => ({ targetFolderId: folder.id, targetIndex: undefined }), null, "drag-into");
  return btn;
}

function renderPins() {
  els.pinList.replaceChildren();
  if (!state.pins.length) {
    const hint = document.createElement("div");
    hint.className = "empty-hint";
    hint.textContent = "Pin はまだありません。「＋ 現在のタブ」で追加、またはタブをここへドロップ。";
    // Pin が 0 件のときはヒント全体をドロップ受け皿にする
    hint.addEventListener("dragover", (e) => {
      if (!dragTabId && !dragItemId) return;
      e.preventDefault();
      hint.classList.add("drag-over");
    });
    hint.addEventListener("dragleave", () => hint.classList.remove("drag-over"));
    hint.addEventListener("drop", (e) => {
      e.preventDefault();
      hint.classList.remove("drag-over");
      if (dragTabId) {
        send({ type: "pinTabAt", spaceId: state.activeSpaceId, tabId: dragTabId, targetFolderId: null, targetIndex: undefined });
        dragTabId = null;
      } else if (dragItemId) {
        if (dragItemSpaceId !== state.activeSpaceId) {
          send({ type: "transferPin", fromSpaceId: dragItemSpaceId, toSpaceId: state.activeSpaceId, itemId: dragItemId, targetFolderId: null, targetIndex: undefined });
        }
        dragItemId = null;
        dragItemSpaceId = null;
      }
    });
    els.pinList.appendChild(hint);
    return;
  }
  renderPinLevel(state.pins, null, 0, els.pinList, state.activeSpaceId);
  els.pinList.appendChild(pinListBottomZone(state.activeSpaceId));
}

// リスト末尾の透明ドロップゾーン(最後のアイテムより下へのドロップを受け付ける)
function pinListBottomZone(spaceId) {
  const zone = document.createElement("div");
  zone.className = "pin-drop-bottom";
  bindDropTarget(zone, () => ({ targetFolderId: null, targetIndex: undefined }), spaceId);
  return zone;
}

// 木を再帰描画する。行自体は listEl 直下のフラットな兄弟で、
// 深さはインデント(padding)でのみ表現する
function renderPinLevel(items, containerId, depth, listEl, spaceId) {
  items.forEach((item, index) => {
    if (Array.isArray(item.children)) {
      listEl.appendChild(folderRow(item, containerId, index, depth, listEl, spaceId));
      if (!item.collapsed) renderPinLevel(item.children, item.id, depth + 1, listEl, spaceId);
    } else {
      listEl.appendChild(pinRow(item, containerId, index, depth, spaceId));
    }
  });
}

function countPins(items) {
  let n = 0;
  for (const item of items ?? []) {
    n += Array.isArray(item.children) ? countPins(item.children) : 1;
  }
  return n;
}

function indent(row, depth) {
  if (depth > 0) row.style.paddingLeft = 8 + depth * 16 + "px";
}

function pinRow(pin, containerId, index, depth, spaceId) {
  const row = document.createElement("div");
  // 束縛タブを持つ Pin は「生きているタブ」として表示(Arc の Pinned Tab)
  // customTitle 設定済みの Pin は .custom クラスで ✎ ボタンを常時薄く表示
  row.className =
    "row pin-row" +
    (pin.tabId ? " live" : "") +
    (pin.active ? " active-tab" : "") +
    (pin.customTitle ? " custom" : "");
  row.draggable = true;
  indent(row, depth);
  row.appendChild(faviconEl(pin.url, pin.favIconUrl || ""));

  const label = document.createElement("span");
  label.className = "label";
  // customTitle(ユーザー固定名) → liveTitle(開いているタブ名) → 保存名 の優先順位
  label.textContent = pin.customTitle || pin.liveTitle || pin.title;
  row.appendChild(label);

  row.appendChild(
    rowButton("✎", pin.customTitle ? "Pin 名を編集(空で保存するとリセット)" : "Pin 名を編集", (e) => {
      e.stopPropagation();
      startPinRename(pin, label, row, spaceId);
    }, "rename")
  );

  if (pin.tabId) {
    row.appendChild(
      rowButton("－", "タブを閉じる(Pin は残る)", (e) => {
        e.stopPropagation();
        send({ type: "closeTab", tabId: pin.tabId });
      })
    );
  }
  row.appendChild(
    rowButton("×", "Pin を外す", (e) => {
      e.stopPropagation();
      send({ type: "removeItem", spaceId, itemId: pin.id });
    })
  );

  row.addEventListener("click", () => {
    if (spaceId === null) {
      send({ type: "openGlobalPin", windowId, pinId: pin.id });
    } else {
      send({ type: "openPin", windowId, spaceId, pinId: pin.id });
    }
  });
  row.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideGpContextMenu();
    hideTooltip();
    showSpacePinContextMenu(e, pin, spaceId);
  });

  // ホバープレビュー(FR-3 簡易版: タイトル + URL)
  row.addEventListener("mouseenter", () =>
    showTooltip(row, pin.customTitle || pin.title, pin.url)
  );
  row.addEventListener("mouseleave", hideTooltip);

  // DnD: この行の位置(同じ階層のこの位置)へ移動
  row.addEventListener("dragstart", () => {
    dragItemId = pin.id;
    dragItemSpaceId = spaceId;
    hideTooltip();
  });
  bindDropTarget(row, () => ({ targetFolderId: containerId, targetIndex: index }), spaceId);
  return row;
}

// Pin 名のインライン編集。Enter/blur で確定、Escape でキャンセル。
// 空で確定すると customTitle を解除してライブタイトルに戻る。
function startPinRename(pin, label, row, spaceId) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "pin-rename-input";
  input.value = pin.customTitle || pin.liveTitle || pin.title;
  input.maxLength = 200;
  input.addEventListener("click", (e) => e.stopPropagation());
  label.replaceWith(input);
  row.draggable = false;
  hideTooltip();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    row.draggable = true;
    if (save) {
      send({
        type: "renamePin",
        spaceId,
        pinId: pin.id,
        customTitle: input.value.trim(),
      });
    } else {
      input.replaceWith(label);
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
  input.focus();
  input.select();
}

function folderRow(folder, containerId, index, depth, listEl, spaceId) {
  const row = document.createElement("div");
  row.className = "row folder-row" + (folder.collapsed ? "" : " folder-open");
  row.draggable = true;
  indent(row, depth);

  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.textContent = "▶";
  row.appendChild(chevron);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = folder.title;
  row.appendChild(label);

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = String(countPins(folder.children));
  row.appendChild(badge);

  // フォルダ削除は中身ごと消えるため 2 段階クリック(2 秒で解除)
  const removeBtn = rowButton("×", "フォルダを中身ごと削除", (e) => {
    e.stopPropagation();
    if (!removeBtn.classList.contains("confirming")) {
      removeBtn.classList.add("confirming");
      removeBtn.title = "もう一度クリックで削除";
      setTimeout(() => removeBtn.classList.remove("confirming"), 2000);
      return;
    }
    send({ type: "removeItem", spaceId, itemId: folder.id });
  });
  row.appendChild(removeBtn);

  row.addEventListener("click", () => {
    send({ type: "toggleFolder", spaceId, folderId: folder.id });
  });
  row.addEventListener("dblclick", () => openFolderDialog("rename", folder, spaceId));

  // DnD: フォルダ行へのドロップは「フォルダの中へ入れる」
  row.addEventListener("dragstart", (e) => {
    dragItemId = folder.id;
    dragItemSpaceId = spaceId;
    e.stopPropagation();
  });
  bindDropTarget(row, () => ({ targetFolderId: folder.id, targetIndex: undefined }), spaceId, "drag-into");
  return row;
}

function bindDropTarget(row, getTarget, spaceId, hoverClass = "drag-over") {
  row.addEventListener("dragover", (e) => {
    if (!dragItemId && !dragTabId) return;
    e.preventDefault();
    row.classList.add(hoverClass);
  });
  row.addEventListener("dragleave", () => row.classList.remove(hoverClass));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove(hoverClass);
    if (dragItemId) {
      const { targetFolderId, targetIndex } = getTarget();
      if (dragItemId === targetFolderId) {
        // 自分自身へのドロップは無視
      } else if (dragItemSpaceId !== spaceId) {
        // 異なるスペース間の移動
        send({
          type: "transferPin",
          fromSpaceId: dragItemSpaceId,
          toSpaceId: spaceId,
          itemId: dragItemId,
          targetFolderId,
          targetIndex,
        });
      } else {
        send({
          type: "moveItem",
          spaceId,
          itemId: dragItemId,
          targetFolderId,
          targetIndex,
        });
      }
      dragItemId = null;
      dragItemSpaceId = null;
    } else if (dragTabId) {
      // タブを Pin に変換して指定位置へ挿入
      const { targetFolderId, targetIndex } = getTarget();
      send({ type: "pinTabAt", spaceId, tabId: dragTabId, targetFolderId, targetIndex });
      dragTabId = null;
    }
  });
}

function renderTabs() {
  els.tabList.replaceChildren();

  // 遅延復元ボタン: pendingRestoreCount > 0 のとき先頭に表示
  if (state.pendingRestoreCount > 0) {
    const wrap = document.createElement("div");
    wrap.className = "restore-bar";
    const restoreBtn = document.createElement("button");
    restoreBtn.className = "restore-btn";
    restoreBtn.textContent = `以前のタブ ${state.pendingRestoreCount} 件を復元`;
    restoreBtn.addEventListener("click", () =>
      send({ type: "restoreSavedTabs", windowId, spaceId: state.activeSpaceId })
    );
    const discardBtn = document.createElement("button");
    discardBtn.className = "restore-discard";
    discardBtn.textContent = "×";
    discardBtn.title = "破棄する";
    discardBtn.addEventListener("click", () =>
      send({ type: "discardSavedTabs", spaceId: state.activeSpaceId })
    );
    wrap.append(restoreBtn, discardBtn);
    els.tabList.appendChild(wrap);
  }

  if (!state.tabs.length) {
    const hint = document.createElement("div");
    hint.className = "empty-hint";
    hint.textContent = "この Space にタブはありません。";
    els.tabList.appendChild(hint);
    return;
  }
  for (const tab of state.tabs) {
    const row = document.createElement("div");
    row.className = "row" + (tab.active ? " active-tab" : "");
    row.draggable = true;
    row.appendChild(faviconEl(tab.url, tab.favIconUrl));

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = tab.title || "(無題)";
    label.title = tab.title;
    row.appendChild(label);

    if (tab.audible) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "♪";
      row.appendChild(badge);
    }

    row.appendChild(
      rowButton("📌", "この Space に Pin する", (e) => {
        e.stopPropagation();
        send({ type: "pinTab", spaceId: state.activeSpaceId, tabId: tab.id });
      })
    );
    row.appendChild(
      rowButton("×", "タブを閉じる", (e) => {
        e.stopPropagation();
        send({ type: "closeTab", tabId: tab.id });
      }, "close")
    );

    row.addEventListener("click", () => send({ type: "activateTab", tabId: tab.id }));

    // DnD: タブの並び替え & Pin エリアへのドロップによる Pin 化
    row.addEventListener("dragstart", (e) => {
      dragTabId = tab.id;
      dragItemId = null;
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => { dragTabId = null; });
    // 同エリア内でのドロップ: ブラウザのタブ順序を変更
    row.addEventListener("dragover", (e) => {
      if (!dragTabId || dragTabId === tab.id) return;
      e.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      if (!dragTabId || dragTabId === tab.id) return;
      send({ type: "moveTab", tabId: dragTabId, targetIndex: tab.index });
      dragTabId = null;
    });

    els.tabList.appendChild(row);
  }
}

function rowButton(text, title, onClick, extraClass = "") {
  const btn = document.createElement("button");
  btn.className = "row-btn" + (extraClass ? " " + extraClass : "");
  btn.textContent = text;
  btn.title = title;
  btn.addEventListener("click", onClick);
  return btn;
}

function faviconEl(pageUrl, favIconUrl) {
  const img = document.createElement("img");
  img.className = "favicon";
  img.alt = "";
  img.src = favIconUrl || faviconApiUrl(pageUrl);
  img.addEventListener("error", () => {
    img.replaceWith(letterEl(pageUrl));
  });
  return img;
}

function letterEl(pageUrl) {
  const div = document.createElement("div");
  div.className = "letter";
  let ch = "?";
  try {
    ch = new URL(pageUrl).hostname.replace(/^www\./, "")[0]?.toUpperCase() ?? "?";
  } catch {
    /* keep "?" */
  }
  div.textContent = ch;
  return div;
}

function faviconApiUrl(pageUrl) {
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", pageUrl);
  u.searchParams.set("size", "32");
  return u.href;
}

// ---------------------------------------------------------------------------
// ツールチップ
// ---------------------------------------------------------------------------
function showTooltip(anchor, title, url) {
  const tt = els.tooltip;
  tt.replaceChildren();
  const t = document.createElement("div");
  t.className = "tt-title";
  t.textContent = title;
  const u = document.createElement("div");
  u.className = "tt-url";
  u.textContent = url;
  tt.append(t, u);
  tt.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const top = Math.min(rect.bottom + 4, window.innerHeight - tt.offsetHeight - 8);
  tt.style.top = top + "px";
  tt.style.left = Math.min(rect.left + 8, window.innerWidth - 270) + "px";
}

function hideTooltip() {
  els.tooltip.hidden = true;
}

// ---------------------------------------------------------------------------
// Global Pin コンテキストメニュー
// ---------------------------------------------------------------------------
function showGpContextMenu(e, item, spaceId) {
  e.preventDefault();
  e.stopPropagation();
  hideGpContextMenu();
  hideTooltip();

  const menu = document.createElement("div");
  menu.className = "context-menu";
  const isFolder = Array.isArray(item.children);

  const renameBtn = document.createElement("button");
  renameBtn.className = "context-menu-item";
  renameBtn.textContent = isFolder ? "フォルダ名を変更" : "Pin を編集(名前・URL)";
  renameBtn.addEventListener("click", () => {
    hideGpContextMenu();
    if (isFolder) {
      openFolderDialog("rename", item, spaceId);
    } else {
      openPinEditDialog(item, spaceId);
    }
  });
  menu.appendChild(renameBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "context-menu-item danger";
  deleteBtn.textContent = isFolder ? "フォルダを削除(中身ごと)" : "削除";
  deleteBtn.addEventListener("click", () => {
    hideGpContextMenu();
    send({ type: "removeItem", spaceId, itemId: item.id });
  });
  menu.appendChild(deleteBtn);

  document.body.appendChild(menu);
  gpContextMenuEl = menu;

  // 画面端に収まるよう位置調整
  const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
  const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  setTimeout(() => {
    document.addEventListener("click", hideGpContextMenu, { once: true });
    document.addEventListener("contextmenu", hideGpContextMenu, { once: true });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") hideGpContextMenu();
    }, { once: true });
  }, 0);
}

function hideGpContextMenu() {
  gpContextMenuEl?.remove();
  gpContextMenuEl = null;
}

function showSpacePinContextMenu(e, pin, spaceId) {
  const menu = document.createElement("div");
  menu.className = "context-menu";

  const editBtn = document.createElement("button");
  editBtn.className = "context-menu-item";
  editBtn.textContent = "Pin を編集(名前・URL)";
  editBtn.addEventListener("click", () => { hideGpContextMenu(); openPinEditDialog(pin, spaceId); });
  menu.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "context-menu-item danger";
  deleteBtn.textContent = "削除";
  deleteBtn.addEventListener("click", () => {
    hideGpContextMenu();
    send({ type: "removeItem", spaceId, itemId: pin.id });
  });
  menu.appendChild(deleteBtn);

  document.body.appendChild(menu);
  gpContextMenuEl = menu;

  const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
  const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  setTimeout(() => {
    document.addEventListener("click", hideGpContextMenu, { once: true });
    document.addEventListener("contextmenu", hideGpContextMenu, { once: true });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") hideGpContextMenu(); }, { once: true });
  }, 0);
}

// ---------------------------------------------------------------------------
// Space 作成・編集ダイアログ
// ---------------------------------------------------------------------------
function buildSwatches() {
  els.swatches.replaceChildren();
  for (const [name, hex] of Object.entries(GROUP_COLOR_HEX)) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "swatch";
    sw.style.background = hex;
    sw.title = name;
    sw.dataset.color = name;
    sw.addEventListener("click", () => selectColor(name));
    els.swatches.appendChild(sw);
  }
}

function selectColor(name) {
  selectedColor = name;
  for (const sw of els.swatches.children) {
    sw.classList.toggle("selected", sw.dataset.color === name);
  }
}

function openDialog(mode) {
  dialogMode = mode;
  const active = state?.spaces.find((s) => s.id === state.activeSpaceId);
  if (mode === "edit" && active) {
    els.dialogTitle.textContent = "Space を編集";
    els.nameInput.value = active.name;
    selectColor(active.color);
    els.deleteBtn.hidden = state.spaces.length <= 1;
  } else {
    els.dialogTitle.textContent = "新しい Space";
    els.nameInput.value = "";
    selectColor("blue");
    els.deleteBtn.hidden = true;
  }
  els.deleteBtn.classList.remove("confirming");
  els.deleteBtn.textContent = "削除";
  els.dialog.showModal();
  els.nameInput.focus();
}

function bindStaticHandlers() {
  els.globalPinCurrent.addEventListener("click", () =>
    send({ type: "addGlobalPinFromTab", windowId })
  );
  els.globalNewFolder.addEventListener("click", () =>
    openFolderDialog("create", null, null)
  );
  els.pinCurrent.addEventListener("click", () =>
    send({ type: "addPinFromTab", windowId })
  );
  els.newTab.addEventListener("click", () => send({ type: "newTab", windowId }));
  els.editSpace.addEventListener("click", () => openDialog("edit"));
  els.cancelBtn.addEventListener("click", () => els.dialog.close());

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.nameInput.value.trim();
    if (!name) return;
    if (dialogMode === "create") {
      send({ type: "createSpace", windowId, name, color: selectedColor });
    } else {
      send({
        type: "updateSpace",
        spaceId: state.activeSpaceId,
        patch: { name, color: selectedColor },
      });
    }
    els.dialog.close();
  });

  // 削除は誤操作防止の 2 段階クリック
  els.deleteBtn.addEventListener("click", () => {
    if (!els.deleteBtn.classList.contains("confirming")) {
      els.deleteBtn.classList.add("confirming");
      els.deleteBtn.textContent = "本当に削除(タブも閉じる)";
      return;
    }
    send({ type: "deleteSpace", windowId, spaceId: state.activeSpaceId });
    els.dialog.close();
  });

  els.newFolder.addEventListener("click", () => openFolderDialog("create", null, state.activeSpaceId));
  els.folderCancel.addEventListener("click", () => els.folderDialog.close());
  els.folderForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = els.folderNameInput.value.trim();
    if (!title || !folderDialogState) return;
    if (folderDialogState.mode === "create") {
      send({ type: "createFolder", spaceId: folderDialogState.spaceId, title });
    } else if (folderDialogState.mode === "renamePin") {
      send({ type: "renamePin", spaceId: folderDialogState.spaceId, pinId: folderDialogState.pinId, customTitle: title });
    } else {
      send({
        type: "renameFolder",
        spaceId: folderDialogState.spaceId,
        folderId: folderDialogState.folderId,
        title,
      });
    }
    els.folderDialog.close();
  });

  els.pinEditCancel.addEventListener("click", () => els.pinEditDialog.close());
  els.pinEditForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pinEditState) return;
    send({
      type: "updatePin",
      spaceId: pinEditState.spaceId,
      pinId: pinEditState.pin.id,
      customTitle: els.pinEditNameInput.value.trim(),
      url: els.pinEditUrlInput.value.trim(),
    });
    els.pinEditDialog.close();
  });

  bindImportHandlers();
}

function openFolderDialog(mode, folder, spaceId) {
  folderDialogState = mode === "rename"
    ? { mode, folderId: folder.id, spaceId }
    : { mode, spaceId };
  els.folderDialogTitle.textContent = mode === "rename" ? "フォルダ名を変更" : "新しいフォルダ";
  els.folderNameInput.value = mode === "rename" ? folder.title : "";
  els.folderDialog.showModal();
  els.folderNameInput.focus();
}

function openPinEditDialog(pin, spaceId) {
  pinEditState = { pin, spaceId };
  els.pinEditNameInput.value = pin.customTitle || "";
  els.pinEditUrlInput.value = pin.url || "";
  els.pinEditDialog.showModal();
  els.pinEditUrlInput.focus();
  els.pinEditUrlInput.select();
}

// ---------------------------------------------------------------------------
// Arc インポート
// ---------------------------------------------------------------------------
let pendingImport = null;

function bindImportHandlers() {
  els.importArc.addEventListener("click", () => els.arcFile.click());
  els.importCancel.addEventListener("click", () => els.importDialog.close());

  els.arcFile.addEventListener("change", async () => {
    const file = els.arcFile.files[0];
    els.arcFile.value = ""; // 同じファイルを再選択できるようにする
    if (!file) return;
    pendingImport = null;
    let error = null;
    try {
      pendingImport = parseArcSidebar(JSON.parse(await file.text()));
    } catch (e) {
      error = e;
    }
    renderImportPreview(error);
    els.importDialog.showModal();
  });

  els.importConfirm.addEventListener("click", async () => {
    if (!pendingImport?.length) return;
    els.importConfirm.disabled = true;
    const result = await send({ type: "importArc", spaces: pendingImport });
    els.importConfirm.disabled = false;
    renderImportResult(result);
  });
}

function renderImportPreview(error) {
  els.importBody.replaceChildren();
  els.importCancel.textContent = "キャンセル";
  if (error || !pendingImport?.length) {
    const p = document.createElement("p");
    p.textContent = error
      ? "ファイルを読み取れませんでした。Arc の StorableSidebar.json を選んでください。"
      : "このファイルに Space が見つかりませんでした。";
    els.importBody.appendChild(p);
    els.importConfirm.hidden = true;
    return;
  }
  els.importConfirm.hidden = false;
  for (const space of pendingImport) {
    const row = document.createElement("div");
    row.className = "import-row";
    const dot = document.createElement("span");
    dot.className = "dot";
    const name = document.createElement("span");
    name.className = "label";
    name.textContent = space.name;
    const counts = document.createElement("span");
    counts.className = "counts";
    counts.textContent = `Pin ${countPins(space.pins)} / タブ ${space.savedTabs.length}`;
    row.append(dot, name, counts);
    els.importBody.appendChild(row);
  }
  const note = document.createElement("p");
  note.className = "import-note";
  note.textContent =
    "同名の Space には Pin を統合します(重複 URL はスキップ)。フォルダはフラット展開されます。";
  els.importBody.appendChild(note);
}

function renderImportResult(result) {
  els.importBody.replaceChildren();
  const p = document.createElement("p");
  p.textContent = result && !result.error
    ? `インポート完了: Space 新規 ${result.created} / 統合 ${result.merged} / Pin 追加 ${result.pinsAdded}`
    : "インポートに失敗しました: " + (result?.error ?? "不明なエラー");
  els.importBody.appendChild(p);
  els.importConfirm.hidden = true;
  els.importCancel.textContent = "閉じる";
  pendingImport = null;
}
