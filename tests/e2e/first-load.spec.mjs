import { rename, stat, utimes } from "node:fs/promises";
import { test, expect } from "./product-fixture.mjs";

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

test("first load preserves native undo and a genuine equal-text reload resets its history", async ({ product }) => {
  const source = "# First load\n\nOriginal 中文 text.";
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const exit = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await exit.isVisible()) await exit.click();
  await product.focus(page);
  await page.keyboard.press("Control+z"); await frames(page);
  expect((await product.snapshot()).activeDocument).toMatchObject({ content: source, isDirty: false });
  await product.append(" UNSAVED draft");
  const draft = source + " UNSAVED draft";
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(draft);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(draft);
  await product.manualSave(); await product.expectSaved(draft);
  const before = await stat(product.documentPath);
  // Change only this owned fixture's disk version; its bytes stay identical.
  await utimes(product.documentPath, before.atime, new Date(before.mtimeMs + 2000));
  await expect.poll(async () => (await product.snapshot()).activeDocument.externalChange).toEqual({ kind: "modified" });
  await expect(page.locator('[data-fishmark-region="external-file-conflict-banner"]')).toBeVisible();
  await page.getByRole("button", { name: "重载磁盘版本", exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).activeDocument.externalChange).toBe(null);
  await product.expectSaved(draft);
  await product.focus(page); await page.keyboard.press("Control+z"); await frames(page);
  expect((await product.snapshot()).activeDocument).toMatchObject({ content: draft, isDirty: false });
  expect(await product.disk()).toBe(draft);
  await product.checkpoint("equal-text-real-reload-preserved-bytes-cleared-old-history");
  await product.append(" after reload"); await product.manualSave(); await product.expectSaved(draft + " after reload");
  await product.normalClose();
});

test("a failed external reload preserves the saved edit's native undo history", async ({ product }) => {
  const source = "# Failed reload\n\nOriginal 中文 text.";
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const exit = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await exit.isVisible()) await exit.click();
  await product.append(" saved edit");
  const saved = source + " saved edit";
  await product.manualSave(); await product.expectSaved(saved);
  const heldPath = product.documentPath + ".held";
  await rename(product.documentPath, heldPath);
  await expect.poll(async () => (await product.snapshot()).activeDocument.externalChange).toEqual({ kind: "deleted" });
  await page.getByRole("button", { name: "重载磁盘版本", exact: true }).click();
  await expect(page.locator('.cm-content[contenteditable="true"]')).toBeVisible();
  expect((await product.snapshot()).activeDocument).toMatchObject({ content: saved, isDirty: false, externalChange: { kind: "deleted" } });
  await product.focus(page); await page.keyboard.press("Control+z");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  // Restore the same physical file, so the original file identity remains valid.
  await rename(heldPath, product.documentPath);
  await product.checkpoint("failed-reload-retained-native-undo-and-conflict");
  await page.getByRole("button", { name: "保留当前编辑", exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).activeDocument.externalChange).toBe(null);
  await product.manualSave(); await product.expectSaved(source);
  await product.normalClose();
});
