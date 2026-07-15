// Arc 風 Pinned Tab: タブ束縛 / ページ内遷移追従 / タブだけ閉じる / カスタム名の固定
import { launch, openPanel, check, finish, sleep, tmpdir, writePage, labels } from "./helper.mjs";

const dir = tmpdir();
const { ctx, sw, extId } = await launch();
const errors = [];

const docsUrl = writePage(dir, "docs.html", "Docs page");
const driftUrl = writePage(dir, "drift.html", "Drifted page");
const docs = await ctx.newPage();
await docs.goto(docsUrl);
const mail = await ctx.newPage();
await mail.goto(writePage(dir, "mail.html", "Mail page"));
await sleep(1200);

const panel = await openPanel(ctx, extId, errors);
const tabCount = () => sw.evaluate(async () => (await chrome.tabs.query({ currentWindow: true })).length);
const activeUrl = () => sw.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? "");

// --- 1. Pin 化で束縛され、タブ一覧から消える ------------------------------------
const docsTabRow = panel.locator("#tab-list .row", { hasText: "Docs" }).first();
await docsTabRow.hover();
await docsTabRow.locator('[title="この Space に Pin する"]').click();
await sleep(700);
check(
  "Pin 化: タブ一覧から消え live 表示",
  !(await labels(panel, "#tab-list")).some((t) => t.includes("Docs")) &&
    (await panel.$eval("#pin-list .row.pin-row", (el) => el.classList.contains("live")))
);

// --- 2. Pin クリックで束縛タブへ -------------------------------------------------
await mail.bringToFront();
await sleep(500);
await panel.locator("#pin-list .row.pin-row").click();
await sleep(800);
check(
  "Pin クリック: 束縛タブがアクティブ + ハイライト",
  (await activeUrl()).includes("docs") && (await panel.$eval("#pin-list .row.pin-row", (el) => el.classList.contains("active-tab")))
);

// --- 3. 🔍 ページ内遷移しても束縛維持 --------------------------------------------
const before = await tabCount();
await docs.goto(driftUrl);
await sleep(1000);
check("🔍 遷移後: ラベルがライブタイトルに", (await panel.textContent("#pin-list .row.pin-row .label")).includes("Drifted"));
await mail.bringToFront();
await sleep(500);
await panel.locator("#pin-list .row.pin-row").click();
await sleep(800);
check("🔍 遷移後クリック: 同じタブへ(新規タブなし)", (await activeUrl()).includes("drift") && (await tabCount()) === before);

// --- 4. タブだけ閉じる(－)-------------------------------------------------------
const pinRow = panel.locator("#pin-list .row.pin-row");
await pinRow.hover();
await pinRow.locator('[title^="タブを閉じる"]').click();
await sleep(800);
check(
  "－で閉じる: Pin は残り live 解除",
  (await panel.$$eval("#pin-list .row.pin-row", (els) => els.length)) === 1 &&
    !(await panel.$eval("#pin-list .row.pin-row", (el) => el.classList.contains("live"))) &&
    (await tabCount()) === before - 1
);

// --- 5. 再クリックで Pin の URL から開き直し --------------------------------------
await panel.locator("#pin-list .row.pin-row").click();
await sleep(1200);
check("再クリック: Pin の URL で再束縛", (await activeUrl()).includes("docs.html") && !(await labels(panel, "#tab-list")).some((t) => t.includes("Docs")));

// --- 6. ✎ でカスタム名を固定(ライブタイトルより優先)----------------------------
await pinRow.hover();
await pinRow.locator('[title^="Pin 名を編集"]').click();
await sleep(300);
await panel.fill(".pin-rename-input", "My Docs");
await panel.press(".pin-rename-input", "Enter");
await sleep(700);
check(
  "リネーム: カスタム名が表示され custom クラスが付く",
  (await panel.textContent("#pin-list .row.pin-row .label")) === "My Docs" &&
    (await panel.$eval("#pin-list .row.pin-row", (el) => el.classList.contains("custom")))
);
// 束縛タブを遷移させてもカスタム名が優先される
const rebound = ctx.pages().find((p) => p.url().includes("docs.html"));
await rebound.goto(driftUrl);
await sleep(1000);
check("🔍 遷移してもカスタム名が優先", (await panel.textContent("#pin-list .row.pin-row .label")) === "My Docs");

// 空でリネームするとライブタイトルに戻る
await pinRow.hover();
await pinRow.locator('[title^="Pin 名を編集"]').click();
await sleep(300);
await panel.fill(".pin-rename-input", "");
await panel.press(".pin-rename-input", "Enter");
await sleep(700);
check("🔍 空リネーム: ライブタイトルに戻る", (await panel.textContent("#pin-list .row.pin-row .label")).includes("Drifted"));

await finish(ctx, errors);
