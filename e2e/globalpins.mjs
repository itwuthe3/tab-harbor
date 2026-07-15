// Global Pin: 全 Space 共通のアイコングリッド / クリックでフォーカス /
// コンテキストメニュー削除 / Space Pin からのドラッグ移動(transferPin)
import { launch, openPanel, check, finish, sleep, tmpdir, writePage, labels, msg } from "./helper.mjs";

const dir = tmpdir();
const { ctx, sw, extId } = await launch();
const errors = [];

const pageA = await ctx.newPage();
await pageA.goto(writePage(dir, "a.html", "Site A"));
const pageB = await ctx.newPage();
await pageB.goto(writePage(dir, "b.html", "Site B"));
await sleep(1200);

const panel = await openPanel(ctx, extId, errors);
const gpCount = () => panel.$$eval("#global-pin-list .gp-icon", (els) => els.length);
const activeUrl = () => sw.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? "");

// --- 1. 現在のタブを Global Pin に追加 --------------------------------------------
await pageA.bringToFront();
await sleep(300);
await panel.click("#global-pin-current");
await sleep(700);
check("追加: アイコンが 1 つ出る", (await gpCount()) === 1);
check("追加: Site A はタブ一覧から消える", !(await labels(panel, "#tab-list")).some((t) => t.includes("Site A")));

// --- 2. 別 Space でも見える(全 Space 共通)---------------------------------------
await panel.locator(".chip.add").click();
await panel.fill("#space-name-input", "Work");
await panel.click("#dialog-save");
await sleep(1200);
check("Space を跨いでも Global Pin は表示される", (await panel.textContent("#space-name")) === "Work" && (await gpCount()) === 1);

// --- 3. クリックで束縛タブへフォーカス --------------------------------------------
await pageB.bringToFront();
await sleep(300);
await panel.locator("#global-pin-list .gp-icon").click();
await sleep(800);
check("クリック: Site A のタブにフォーカス", (await activeUrl()).includes("a.html"));

// --- 4. 🔍 右クリックメニューから削除 ---------------------------------------------
await panel.locator("#global-pin-list .gp-icon").click({ button: "right" });
await sleep(300);
const menuItems = await panel.$$eval(".context-menu .context-menu-item", (els) => els.map((e) => e.textContent));
check("🔍 コンテキストメニューが出る", menuItems.includes(await msg(panel, "menuEditPin")) && menuItems.includes(await msg(panel, "menuDelete")), JSON.stringify(menuItems));
await panel.locator(".context-menu .context-menu-item.danger").click();
await sleep(700);
check("🔍 削除: アイコンが消え、タブ一覧に Site A が戻る", (await gpCount()) === 0 && (await labels(panel, "#tab-list")).some((t) => t.includes("Site A")));

// --- 5. Space Pin をドラッグで Global Pin へ移動(transferPin)---------------------
const siteBRow = panel.locator("#tab-list .row", { hasText: "Site B" }).first();
await siteBRow.hover();
await siteBRow.locator(`[title="${await msg(panel, "pinToSpaceTitle")}"]`).click();
await sleep(700);
check("準備: Site B を Space Pin 化", (await labels(panel, "#pin-list")).some((t) => t.includes("Site B")));

await panel.locator("#pin-list .row.pin-row", { hasText: "Site B" }).dispatchEvent("dragstart");
await panel.locator("#global-pin-list .global-pin-icons").dispatchEvent("drop");
await sleep(700);
check(
  "transferPin: Space Pin → Global Pin に移動",
  (await gpCount()) === 1 && !(await labels(panel, "#pin-list")).some((t) => t.includes("Site B"))
);

// storage 上も globalPins に入っている
const stored = await sw.evaluate(() => chrome.storage.local.get("globalPins"));
check("storage: globalPins に保存", stored.globalPins?.length === 1 && stored.globalPins[0].url.includes("b.html"));

await finish(ctx, errors);
