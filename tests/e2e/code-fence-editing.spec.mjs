import { test, expect } from "./product-fixture.mjs";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const source = "before\n\n```python\nalpha\n    return 1\n```\n\nafter\n";

test("代码块 Tab 缩进留在编辑器内，Enter 继承缩进且可撤销保存", async ({ product }) => {
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const content = async () => (await product.snapshot()).activeDocument.content;
  const editor = page.locator(".cm-content[contenteditable=true]");
  await page.locator(".cm-line").filter({ hasText: "alpha" }).click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+ArrowRight" : "Shift+End");
  await page.keyboard.press("Tab");
  const indented = source.replace("alpha\n    return", "  alpha\n      return");
  await expect.poll(content).toBe(indented);
  await expect(editor).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect.poll(content).toBe(source);
  await expect(editor).toBeFocused();
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(content).toBe(indented);
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(content).toBe(source);

  await page.locator(".cm-line").filter({ hasText: "return 1" }).click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("next()");
  const continued = source.replace("return 1\n", "return 1\n    next()\n");
  await expect.poll(content).toBe(continued);
  await product.manualSave();
  await product.expectSaved(continued);
  await product.normalClose();
  await product.launch(continued);
  await product.expectSaved(continued);
  await product.normalClose();
});
