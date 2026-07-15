// 基本フロー: 初期収容 / Pin / Space 作成・切替・削除 / タブ操作 / 永続化
import { launch, openPanel, check, finish, sleep, tmpdir, writePage, labels } from "./helper.mjs";

const dir = tmpdir();
const { ctx, sw, extId } = await launch();
const errors = [];

const p1 = await ctx.newPage();
await p1.goto(writePage(dir, "docs.html", "Docs page"));
const p2 = await ctx.newPage();
await p2.goto(writePage(dir, "mail.html", "Mail page"));
await sleep(1500);

const panel = await openPanel(ctx, extId, errors);

const swState = () =>
  sw.evaluate(async () => {
    const groups = await chrome.tabGroups.query({});
    const out = [];
    for (const g of groups) {
      const tabs = await chrome.tabs.query({ groupId: g.id });
      out.push({ title: g.title, color: g.color, collapsed: g.collapsed, tabs: tabs.map((t) => t.url || t.pendingUrl) });
    }
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { groups: out, activeTabUrl: active?.url };
  });

// --- 1. 初期状態 --------------------------------------------------------------
let st = await swState();
const home = st.groups.find((g) => g.title === "Home");
check(
  "初期状態: Home グループが既存タブを収容",
  !!home && home.tabs.some((u) => u.includes("docs")) && home.tabs.some((u) => u.includes("mail")),
  JSON.stringify(st.groups.map((g) => [g.title, g.tabs.length]))
);
check("パネル: ヘッダーに Home", (await panel.textContent("#space-name")) === "Home");
let tabLabels = await labels(panel, "#tab-list");
check("パネル: タブ一覧に Docs / Mail", tabLabels.some((t) => t.includes("Docs")) && tabLabels.some((t) => t.includes("Mail")), JSON.stringify(tabLabels));

// --- 2. Pin 追加(タブ行の 📌)------------------------------------------------
const docsRow = panel.locator("#tab-list .row", { hasText: "Docs" }).first();
await docsRow.hover();
await docsRow.locator('[title="この Space に Pin する"]').click();
await sleep(600);
let pinLabels = await labels(panel, "#pin-list");
check("Pin 追加: Docs が Pin 一覧に出る", pinLabels.some((t) => t.includes("Docs")), JSON.stringify(pinLabels));
tabLabels = await labels(panel, "#tab-list");
check("Pin 追加: Docs はタブ一覧から消える(束縛)", !tabLabels.some((t) => t.includes("Docs")));

// 🔍 重複 Pin は作られない
await p1.bringToFront();
await sleep(300);
await panel.click("#pin-current");
await sleep(600);
pinLabels = await labels(panel, "#pin-list");
check("🔍 重複 Pin は作られない", pinLabels.filter((t) => t.includes("Docs")).length === 1);

// --- 3. Pin クリック → 既存タブへフォーカス ------------------------------------
const before = (await swState()).groups.reduce((n, g) => n + g.tabs.length, 0);
await p2.bringToFront();
await sleep(300);
await panel.locator("#pin-list .row", { hasText: "Docs" }).click();
await sleep(800);
st = await swState();
const after = st.groups.reduce((n, g) => n + g.tabs.length, 0);
check("Pin クリック: 既存タブにフォーカス(新規タブなし)", st.activeTabUrl?.includes("docs") && after === before, `${before}→${after}`);

// --- 4. Space 作成(Work / purple)---------------------------------------------
await panel.locator(".chip.add").click();
await panel.fill("#space-name-input", "Work");
await panel.click('.swatch[data-color="purple"]');
await panel.click("#dialog-save");
await sleep(1200);
st = await swState();
const work = st.groups.find((g) => g.title === "Work");
check("Space 作成: Work(purple)が生成・展開", !!work && work.color === "purple" && work.collapsed === false, JSON.stringify(st.groups.map((g) => [g.title, g.color, g.collapsed])));
check("Space 作成: Home は折りたたみ", st.groups.find((g) => g.title === "Home")?.collapsed === true);
check("パネル: ヘッダーが Work", (await panel.textContent("#space-name")) === "Work");
check("Work の Pin は空(Space ごとに独立)", (await labels(panel, "#pin-list")).length === 0);

// --- 5. Home に戻る -------------------------------------------------------------
await panel.locator(".chip", { hasText: "H" }).first().click();
await sleep(1200);
st = await swState();
check(
  "Space 切替: Home 展開・Work 折りたたみ",
  st.groups.find((g) => g.title === "Home")?.collapsed === false && st.groups.find((g) => g.title === "Work")?.collapsed === true
);
check("Space 切替: Home の Pin が戻る", (await labels(panel, "#pin-list")).some((t) => t.includes("Docs")));

// 🔍 連打切替
for (let i = 0; i < 4; i++) {
  await panel.locator(".chip", { hasText: i % 2 ? "H" : "W" }).first().click();
  await sleep(120);
}
await sleep(1500);
st = await swState();
check("🔍 連打切替後もグループは 2 つ", st.groups.length === 2, JSON.stringify(st.groups.map((g) => g.title)));

// --- 6. Space 削除(2 段階確認)-------------------------------------------------
await panel.locator(".chip", { hasText: "W" }).first().click();
await sleep(1000);
await panel.click("#edit-space");
await panel.click("#delete-space");
await panel.click("#delete-space");
await sleep(1500);
st = await swState();
check("Space 削除: Work グループとタブが消える", !st.groups.some((g) => g.title === "Work"), JSON.stringify(st.groups.map((g) => g.title)));
check("Space 削除後: Home に戻る", (await panel.textContent("#space-name")) === "Home");

// --- 7. 新しいタブ / タブを閉じる ------------------------------------------------
const n1 = (await swState()).groups.find((g) => g.title === "Home")?.tabs.length ?? 0;
await panel.click("#new-tab");
await sleep(1200);
const n2 = (await swState()).groups.find((g) => g.title === "Home")?.tabs.length ?? 0;
check("新しいタブ: Home グループ内に増える", n2 === n1 + 1, `${n1}→${n2}`);

const mailRow = panel.locator("#tab-list .row", { hasText: "Mail" }).first();
await mailRow.hover();
await mailRow.locator(".row-btn.close").click();
await sleep(800);
check("タブを閉じる: Mail が消える", !(await labels(panel, "#tab-list")).some((t) => t.includes("Mail")));

// --- 8. 永続化(storage.local)---------------------------------------------------
const stored = await sw.evaluate(() => chrome.storage.local.get(null));
check(
  "永続化: spacesOrder と Pin が storage.local に保存",
  stored.spacesOrder?.length === 1 && Object.values(stored).some((v) => v?.pins?.some?.((p) => p.title?.includes("Docs"))),
  JSON.stringify(stored).slice(0, 150)
);

await finish(ctx, errors);
