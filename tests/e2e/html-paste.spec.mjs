import { test, expect } from "./product-fixture.mjs";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test("网页格式粘贴成 Markdown，独立撤销并保存重开", async ({ product }) => {
  const source = "replace\n";
  const expected = "## 标题\n\n**粗体**和[链接](https://example.com/)\n\n> 引用\n";
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  await product.focus(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+ArrowRight" : "Shift+End");
  const handled = await page.locator(".document-editor .cm-content").evaluate(element => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/html", '<h2>标题</h2><p><strong>粗体</strong>和<a href="https://example.com/">链接</a></p><blockquote>引用</blockquote>');
    clipboardData.setData("text/plain", "标题\n粗体和链接\n引用");
    clipboardData.items.add(new File(["PNG"], "clip.png", { type: "image/png" }));
    return !element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  expect(handled).toBe(true);
  const content = async () => (await product.snapshot()).activeDocument.content;
  await expect.poll(content).toBe(expected);
  expect((await product.mainEvidence()).filter(event => event.detail?.channel === "fishmark:import-clipboard-image")).toEqual([]);
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
