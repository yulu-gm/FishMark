import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "./product-fixture.mjs";

const source = ["# Compact layout", "", "| Name | Notes |", "| --- | --- |", "| Alpha | Readable cell |", "", ...Array.from({ length: 100 }, (_, i) => `Paragraph ${i}: readable document content.\n`)].join("\n");

for (const mode of ["light", "dark"]) test(`compact chrome and table remain usable in ${mode}`, async ({ product }) => {
  test.setTimeout(120_000);
  await product.seed(source, 60_000);
  await writeFile(join(product.profile, "preferences.json"), JSON.stringify({ version: 3, autosave: { idleDelayMs: 60_000 }, theme: { mode, effectsMode: "off" } }));
  const page = await product.launch(source);
  const owner = await product.current.app.browserWindow(page);
  for (const width of [1280, 900]) {
    const size = await owner.evaluate((window, width) => { window.setSize(width, 800); return window.getContentSize(); }, width);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(size[0]);
    const scrollbar = page.locator('[data-editor-scrollbar-axis="vertical"]');
    await expect(scrollbar).toBeVisible();
    // CodeMirror schedules scrollbar geometry on its next measure after resize.
    await expect.poll(() => page.evaluate(() => Math.abs(innerWidth - document.querySelector('[data-editor-scrollbar-axis="vertical"]').getBoundingClientRect().right))).toBeLessThanOrEqual(2);
    const geometry = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const rail = rect('.app-rail'), editor = rect('.document-editor'), bar = rect('.app-status-bar'), track = rect('[data-editor-scrollbar-axis="vertical"]');
      const workspace = rect('.app-workspace'), tabs = rect('.workspace-tab-strip');
      return { width: innerWidth, height: innerHeight, railRight: rail.right, editorRight: editor.right, editorBottom: editor.bottom,
        barTop: bar.top, barBottom: bar.bottom, trackRight: track.right, tabsTop: tabs.top, workspaceTop: workspace.top };
    });
    expect(geometry.width - geometry.trackRight).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.editorRight - geometry.trackRight)).toBeLessThanOrEqual(2);
    expect(geometry.editorBottom).toBeLessThanOrEqual(geometry.barTop + 1);
    expect(geometry.height - geometry.barBottom).toBeLessThanOrEqual(4);
    expect(geometry.railRight).toBeLessThanOrEqual(56);
    expect(Math.abs(geometry.tabsTop - geometry.workspaceTop)).toBeLessThanOrEqual(1);
    await scrollbar.focus();
    await expect(scrollbar).toBeFocused();
    const before = await page.locator('.cm-scroller').evaluate(el => el.scrollTop);
    await page.keyboard.press('PageDown');
    await expect.poll(() => page.locator('.cm-scroller').evaluate(el => el.scrollTop)).toBeGreaterThan(before);
    const thumb = await scrollbar.locator('.fishmark-editor-scrollbar-thumb').boundingBox();
    const beforeDrag = await page.locator('.cm-scroller').evaluate(el => el.scrollTop);
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
    await page.mouse.down();
    await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => page.locator('.cm-scroller').evaluate(el => el.scrollTop)).toBeGreaterThan(beforeDrag);
    await page.screenshot({ path: product.testInfo.outputPath(`compact-${mode}-${width}.png`) });
  }
  await owner.dispose();
  await product.focus(page); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
  const cell = page.locator('.cm-table-widget-input').first();
  await expect(cell).toBeVisible();
  const box = await cell.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(30);
  expect(box.height).toBeLessThanOrEqual(42);
  await cell.click();
  await expect(cell).toBeFocused();
  await page.screenshot({ path: product.testInfo.outputPath(`compact-${mode}-table.png`) });
  await page.keyboard.type('X');
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).not.toBe(source);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  // A focused table replaces the rail with table tools; leave it before opening outline.
  await page.locator('.cm-line').filter({ hasText: 'Compact layout' }).first().click();
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(page.locator('.side-panel')).toBeVisible();
  expect((await product.snapshot()).activeDocument.content).toBe(source);
  await product.normalClose();
});
