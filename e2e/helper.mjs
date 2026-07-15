// E2E 共通ヘルパー。
// 前提: cd e2e && npm run setup(playwright + Chromium のダウンロード)
// 注意: ブランド版 Google Chrome は --load-extension を無視するため、
//       Playwright 同梱 Chromium(channel: "chromium")を使うこと。
import { chromium } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
export function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

export function tmpdir(prefix = "harbor-e2e-") {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

// <title> だけのテストページを作って file:// URL を返す
export function writePage(dir, name, title) {
  const p = path.join(dir, name);
  writeFileSync(p, `<title>${title}</title>`);
  return "file://" + p;
}

export async function launch() {
  const profile = tmpdir("harbor-prof-");
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 380, height: 700 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const sw =
    ctx.serviceWorkers()[0] ??
    (await ctx.waitForEvent("serviceworker", { timeout: 15000 }));
  const extId = new URL(sw.url()).host;
  await sleep(1200);
  return { ctx, sw, extId };
}

// パネルをタブとして開く(sidePanel の中身と同一ページ)
export async function openPanel(ctx, extId, errors) {
  const panel = await ctx.newPage();
  if (errors) {
    panel.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  }
  await panel.goto(`chrome-extension://${extId}/sidepanel/panel.html`);
  await sleep(1000);
  return panel;
}

export const labels = (panel, sel) =>
  panel.$$eval(sel + " .label", (els) => els.map((e) => e.textContent));

// 拡張の i18n メッセージを実行中のページ / SW から取得する。
// テスト側で文言をハードコードしない(ブラウザの UI ロケールに依存しない)ため。
export function msg(pageOrWorker, key, ...subs) {
  return pageOrWorker.evaluate(
    ([k, s]) => chrome.i18n.getMessage(k, s),
    [key, subs.map(String)]
  );
}

export async function finish(ctx, errors) {
  if (errors) {
    check("パネルの JS エラーなし", errors.length === 0, errors.join(" | ").slice(0, 250));
  }
  await ctx.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
