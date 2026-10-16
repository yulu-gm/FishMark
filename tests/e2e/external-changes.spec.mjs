import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "./product-fixture.mjs";
import { chooseClosePrompt } from "./close-dialog.mjs";

const initial = "Inactive original 原文";
const external = "EXTERNAL changed on disk while another tab is active 外部内容";
async function tabs(product) {
  await product.seed(initial, 60_000);
  const page = await product.launch(initial);

  const first = (await product.snapshot()).activeTabId;
  const otherPath = join(product.directory, "documents", "other.md");
  await writeFile(otherPath, "Other tab unchanged", "utf8");
  await page.evaluate(() => {
    const input = document.createElement("input"); input.type = "file";
    input.dataset.externalFixture = "true"; document.body.append(input);
  });
  await page.locator("input[data-external-fixture]").setInputFiles(otherPath);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(document.querySelector("input[data-external-fixture]").files[0]);
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(2);
  const second = (await product.snapshot()).activeTabId;
  expect(second).not.toBe(first);
  expect((await product.snapshot()).activeDocument.path).toBe(otherPath);
  await expect.poll(async () => (await product.mainEvidence()).filter(e => e.event === "watch:end").length).toBeGreaterThan(0);
  return { page, first, second, otherPath };
}
async function modifyInactive(product, state) {
  expect((await product.snapshot()).activeTabId).toBe(state.second);
  const before = (await product.mainEvidence()).filter(e => e.event === "external:changed").length;
  await writeFile(product.documentPath, external, "utf8");
  await expect.poll(async () => (await product.mainEvidence()).filter(e => e.event === "external:changed").length).toBeGreaterThan(before);
  expect((await product.snapshot()).activeTabId).toBe(state.second);
  expect((await product.snapshot()).activeDocument.content).toBe("Other tab unchanged");
  expect(await readFile(state.otherPath, "utf8")).toBe("Other tab unchanged");
  expect(await product.disk()).toBe(external);
  await product.checkpoint("external-arrived-while-other-tab-active");
  await state.page.locator(`[data-tab-id="${state.first}"]`).click();
  await expect.poll(async () => (await product.snapshot()).activeTabId).toBe(state.first);
  await expect.poll(async () => (await product.snapshot()).activeDocument.externalChange).toEqual({ kind: "modified" });
  await expect(state.page.locator('[data-fishmark-region="external-file-conflict-banner"]')).toBeVisible();
}

test("inactive clean tab receives external change, retains old text until explicit reload and continues saving", async ({ product }) => {
  const state = await tabs(product);
  await modifyInactive(product, state);
  expect((await product.snapshot()).activeDocument.content).toBe(initial);
  expect(await product.disk()).toBe(external);
  await product.checkpoint("clean-tab-conflict-before-reload");
  await state.page.getByRole("button", { name: "重载磁盘版本", exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(external);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(false);
  await product.append(" continued after deliberate reload");
  await product.manualSave();
  await product.expectSaved(external + " continued after deliberate reload");
  expect(await readFile(state.otherPath, "utf8")).toBe("Other tab unchanged");
  await product.checkpoint("reload-continued-exact-save");
  await product.normalClose();
});

test("inactive dirty conflict blocks native close Save, Cancel keeps editability, explicit keep-memory permits save", async ({ product }) => {
  test.skip(process.platform !== "win32", "Native close prompt interaction requires Windows.");
  const state = await tabs(product);
  await state.page.locator(`[data-tab-id="${state.first}"]`).click();
  await product.append(" UNSAVED local draft 草稿");
  const draft = initial + " UNSAVED local draft 草稿";
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(draft);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  await state.page.locator(`[data-tab-id="${state.second}"]`).click();
  await expect.poll(async () => (await product.snapshot()).activeTabId).toBe(state.second);
  expect((await product.snapshot()).tabs.find(t => t.tabId === state.first).isDirty).toBe(true);
  expect(await product.disk()).toBe(initial);
  await modifyInactive(product, state);
  expect((await product.snapshot()).activeDocument.content).toBe(draft);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  expect(await product.disk()).toBe(external);
  await product.checkpoint("dirty-tab-conflict-draft-and-disk-preserved");
  const requestClose = () => product.current.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await chooseClosePrompt(product, "Save", requestClose);
  await expect.poll(async () => (await product.mainEvidence()).filter(e => e.event === "close:end" && e.detail.status === "error").length).toBe(1);
  const rejected = (await product.mainEvidence()).find(e => e.event === "close:end" && e.detail.status === "error");
  expect(rejected.detail.error.code).toBe("disk-version-conflict");
  expect(await product.disk()).toBe(external);
  expect((await product.snapshot()).activeDocument.content).toBe(draft);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(true);
  expect(product.current.app.windows().filter(p => !p.isClosed())).toHaveLength(1);
  await expect(state.page.locator('.cm-content[contenteditable="true"]')).toBeVisible();
  await product.checkpoint("native-close-save-rejected-with-both-versions-intact");
  await chooseClosePrompt(product, "Cancel", requestClose);
  expect((await product.snapshot()).activeDocument.content).toBe(draft);
  await product.append(" continued after cancel");
  const continued = draft + " continued after cancel";
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(continued);
  expect(await product.disk()).toBe(external);
  await state.page.getByRole("button", { name: "保留当前编辑", exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).activeDocument.externalChange).toBe(null);
  expect((await product.snapshot()).activeDocument.content).toBe(continued);
  await product.manualSave();
  await product.expectSaved(continued);
  expect(await readFile(state.otherPath, "utf8")).toBe("Other tab unchanged");
  await product.checkpoint("explicit-keep-memory-exact-save");
  await product.normalClose();
});
