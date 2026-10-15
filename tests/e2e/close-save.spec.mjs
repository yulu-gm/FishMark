import { test, expect } from "./product-fixture.mjs";
import { chooseClosePrompt } from "./close-dialog.mjs";

test("native window Cancel preserves pending edits, continued editing then application Quit Save survives relaunch", async ({ product }) => {
  test.skip(process.platform !== "win32", "Native close prompt interaction requires Windows.");
  const initial = "Native close original 原文";
  await product.seed(initial, 60_000);
  const page = await product.launch(initial);
  await product.append(" pending before cancel 草稿");
  const draft = initial + " pending before cancel 草稿";
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(draft);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  expect(await product.disk()).toBe(initial);
  const requestClose = () => product.current.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await chooseClosePrompt(product, "Cancel", requestClose);
  expect(page.isClosed()).toBe(false);
  await expect(page.locator('.cm-content[contenteditable="true"]')).toBeVisible();
  expect((await product.snapshot()).activeDocument.content).toBe(draft);
  await product.append(" continued after cancel");
  const expected = draft + " continued after cancel";
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(expected);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  await product.checkpoint("cancel-kept-editor-and-pending-text");
  await chooseClosePrompt(product, "Save", () => product.normalClose());
  expect(await product.disk()).toBe(expected);
  await product.launch(expected);
  await product.expectSaved(expected);
  await product.checkpoint("native-close-save-reopened-exact");
  await product.normalClose();
});

test("application Quit Don't Save deliberately discards draft without altering disk or restoring it on relaunch", async ({ product }) => {
  test.skip(process.platform !== "win32", "Native close prompt interaction requires Windows.");
  const initial = "Discard retains original disk 原文";
  await product.seed(initial, 60_000);
  await product.launch(initial);
  await product.append(" explicitly discard this draft");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(initial + " explicitly discard this draft");
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  expect(await product.disk()).toBe(initial);
  await product.checkpoint("dirty-before-deliberate-discard");
  await chooseClosePrompt(product, "Don't Save", () => product.normalClose());
  expect(await product.disk()).toBe(initial);
  expect((await product.mainEvidence()).filter(e => e.event === "save:start")).toEqual([]);
  await product.launch(initial);
  await product.expectSaved(initial);
  await product.checkpoint("discarded-text-not-restored");
  await product.normalClose();
});
