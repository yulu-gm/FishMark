import { test, expect } from "./product-fixture.mjs";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("只取消选中文字的粗体，并恢复选区与撤销历史", async ({ product }) => {
  const source = "**alpha beta**\n";
  const expected = "alpha **beta**\n";
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const content = async () => (await product.snapshot()).activeDocument.content;
  await product.focus(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowRight");
  expect(await page.evaluate(() => getSelection().toString())).toBe("alpha");
  await page.keyboard.press(`${mod}+b`);
  await expect.poll(content).toBe(expected);
  expect(await page.evaluate(() => getSelection().toString())).toBe("alpha");
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(content).toBe(source);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect.poll(content).toBe(expected);
  await product.manualSave();
  await product.expectSaved(expected);
  await product.normalClose();
  await product.launch(expected);
  await product.expectSaved(expected);
  await product.normalClose();
});
