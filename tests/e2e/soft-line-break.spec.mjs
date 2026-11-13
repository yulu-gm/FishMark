import { test, expect } from "./product-fixture.mjs";

const original = "111222";
const withSoftBreak = "111\n222";

async function openAtMiddle(product) {
  await product.seed(original, 60000);
  const page = await product.launch(original);
  await product.focus(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
  return page;
}

function expectMarkdown(product, markdown) {
  return expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(markdown);
}

test("正文 Shift+Enter 插入单个 LF，输入可撤销且保存重开后保留换行", async ({ product }) => {
  const page = await openAtMiddle(product);
  await page.keyboard.press("Shift+Enter");
  await expectMarkdown(product, withSoftBreak);

  // 光标移开再移回，让接下来的输入成为独立的撤销步骤，不依赖按键间隔。
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("x");
  await expectMarkdown(product, "111\nx222");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expectMarkdown(product, withSoftBreak);

  await product.manualSave(page);
  await product.expectSaved(withSoftBreak, page);
  await product.normalClose();

  const reopened = await product.launch(withSoftBreak);
  await expect(reopened.locator(".cm-content .cm-line")).toHaveText(["111", "222"]);
  await product.normalClose();
});

test("正文 Enter 在同一位置插入两个 LF 来分段", async ({ product }) => {
  const page = await openAtMiddle(product);
  await page.keyboard.press("Enter");
  await expectMarkdown(product, "111\n\n222");
  await product.manualSave(page);
  await product.expectSaved("111\n\n222", page);
  await product.normalClose();
});
