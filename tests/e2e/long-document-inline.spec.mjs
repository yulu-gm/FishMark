import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { test, expect } from "./product-fixture.mjs";

test("混合长文首次打开后仍可准确编辑、撤销、保存和重开", async ({ product }) => {
  const source = await readFile("fixtures/performance/complex-20000-lines.md", "utf8");
  const identity = JSON.parse(await readFile("fixtures/performance/complex-20000-lines.fixture.json", "utf8"));
  expect(createHash("sha256").update(source).digest("hex")).toBe(identity.sha256);
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const addition = "\n\n纯文本报告，数字123；保持全文内容。";
  await product.append(addition);
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source + addition);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+z" : "Control+y");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source + addition);
  await product.manualSave();
  await product.expectSaved(source + addition);
  await product.checkpoint("long-document-inline-save");
  await product.normalClose();
  await product.launch(source + addition);
  await product.expectSaved(source + addition);
  await product.normalClose();
});
