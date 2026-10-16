import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "./product-fixture.mjs";

async function chrome(page) {
  await expect(page.locator('[data-fishmark-command="toggle-reading-mode"], [aria-keyshortcuts="F11"], [data-fishmark-shell-mode]')).toHaveCount(0);
  for (const region of ["workspace-tab-strip", "app-status-bar"]) {
    const element = page.locator(`[data-fishmark-region="${region}"]`);
    await expect(element).toBeVisible();
    await expect(element).toHaveAttribute("data-visibility", "visible");
    const geometry = await element.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);
  }
  await expect(page.locator(".document-word-count")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--fishmark-env-reading-mode"))).toBe("0");
}

test("permanent chrome survives old preferences, resize, edits, source mode, tabs, empty workspace and restart", async ({ product }) => {
  test.setTimeout(120_000);
  const source = "# Permanent chrome\n\n**Chinese 中文** and ordinary text.\n\n## Second heading\n\nLast paragraph.";
  await product.seed(source, 60_000);
  // The shipped schema has no persisted shell flag. Unknown legacy-like fields
  // cannot resurrect that layout; valid preferences and recovery still load.
  await writeFile(join(product.profile, "preferences.json"), JSON.stringify({
    version: 3, autosave: { idleDelayMs: 60_000 }, ui: { sidePanelWidth: 310 },
    theme: { mode: "dark", effectsMode: "off" }, readingMode: true, shellMode: "reading"
  }));
  const page = await product.launch(source);
  await chrome(page);
  const menu = await product.current.app.evaluate(({ Menu }) => {
    const flatten = items => items.flatMap(item => [{ label: item.label, accelerator: String(item.accelerator ?? "") }, ...flatten(item.submenu?.items ?? [])]);
    return flatten(Menu.getApplicationMenu().items);
  });
  expect(menu.some(item => /reading|阅读|F11/i.test(item.label + item.accelerator))).toBe(false);
  const owner = await product.current.app.browserWindow(page);
  for (const width of [1280, 900]) {
    const size = await owner.evaluate((window, width) => { window.setSize(width, 900); return window.getContentSize(); }, width);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(size[0]);
    await chrome(page);
    await page.screenshot({ path: product.testInfo.outputPath(`permanent-chrome-${width}.png`) });
  }
  await owner.dispose();
  const originalCount = await page.locator(".document-word-count").textContent();
  await product.focus(page); await page.keyboard.press("F11");
  await chrome(page);
  expect((await product.snapshot()).activeDocument).toMatchObject({ content: source, isDirty: false });
  await product.append(" additional characters");
  await expect(page.locator(".document-word-count")).not.toHaveText(originalCount);
  await chrome(page);
  await page.getByRole("button", { name: "Switch to source mode", exact: true }).click();
  await chrome(page);
  await page.getByRole("button", { name: "Switch to WYSIWYM mode", exact: true }).click();
  await product.focus(page); await page.keyboard.press("Control+z");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  await expect(page.locator(".document-word-count")).toHaveText(originalCount);
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.locator(".outline-panel-item").filter({ hasText: "Second heading" }).click();
  await chrome(page);
  const firstId = (await product.snapshot()).activeTabId;
  await product.current.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items
    .find(item => item.label === "File").submenu.items.find(item => item.label === "New").click());
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(2);
  await chrome(page);
  await expect(page.locator(".document-word-count")).toHaveText("字数 0");
  await page.getByRole("button", { name: "Close Untitled.md", exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).activeTabId).toBe(firstId);
  await chrome(page);
  await product.normalClose();
  const reopened = await product.launch(source, { openDocument: false });
  await chrome(reopened);
  const preferences = await reopened.evaluate(() => window.fishmark.getPreferences());
  expect(preferences.ui.sidePanelWidth).toBe(310);
  expect(preferences.theme.mode).toBe("dark");
  await reopened.getByRole("button", { name: "Close roundtrip.md", exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(0);
  await chrome(reopened);
  await expect(reopened.locator(".document-word-count")).toHaveText("字数 0");
  await expect(reopened.locator('[data-fishmark-region="empty-state"]')).toBeVisible();
  expect(await readFile(product.documentPath, "utf8")).toBe(source);
  await product.checkpoint("permanent-chrome-empty-after-restart");
  await product.normalClose();
});
