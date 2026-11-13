import { test, expect } from "./product-fixture.mjs";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const start = process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home";

async function openPairingSettings(page) {
  await page.getByRole("button", { name: "打开偏好设置" }).click();
  await page.getByRole("button", { name: "自动配对", exact: true }).click();
}

test("普通配对、反向选区包裹、退格与撤销使用真实输入", async ({ product }) => {
  const source = "中文\n";
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const content = async () => (await product.snapshot()).activeDocument.content;
  await product.focus(page);
  await page.keyboard.press(start);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.type('"');
  await expect.poll(content).toBe('"中文"\n');
  expect(await page.evaluate(() => getSelection().toString())).toBe("中文");
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(content).toBe(source);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("(");
  await expect.poll(content).toBe("中文()\n");
  await page.keyboard.press("Backspace");
  await expect.poll(content).toBe(source);
  await page.keyboard.type("(x)");
  await expect.poll(content).toBe("中文(x)\n");
  await product.manualSave();
  await product.expectSaved("中文(x)\n");
  await product.normalClose();
});

test("配对设置即时生效并跨重启保存，Markdown 配对不阻止围栏输入", async ({ product }) => {
  const source = "text\n";
  await product.seed(source, 60_000);
  let page = await product.launch(source);
  const content = async () => (await product.snapshot()).activeDocument.content;
  await openPairingSettings(page);
  await expect(page.locator("#settings-auto-pair-brackets")).toBeChecked();
  await page.locator("#settings-auto-pair-brackets").click();
  await expect(page.locator("#settings-auto-pair-brackets")).not.toBeChecked();
  await page.locator("#settings-auto-pair-markdown").click();
  await expect(page.locator("#settings-auto-pair-markdown")).toBeChecked();
  await product.checkpoint("pairing-settings");
  await page.getByRole("button", { name: "关闭设置" }).click();
  await product.focus(page);
  await page.keyboard.press(start);
  await page.keyboard.type("(");
  await expect.poll(content).toBe("(text\n");
  await page.keyboard.press("Backspace");
  await expect.poll(content).toBe(source);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+ArrowRight" : "Shift+End");
  await page.keyboard.type("*");
  await expect.poll(content).toBe("*text*\n");
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(content).toBe(source);
  // 清空当前行后逐键输入，加粗标记和围栏均不能被自动跳过吞掉。
  await page.keyboard.press("Backspace");
  await expect.poll(content).toBe("\n");
  // 连续输入跨过设置关闭动画，验证延迟焦点恢复不会中途抢走编辑焦点。
  await page.keyboard.type("**bold**", { delay: 30 });
  await expect(page.locator(".document-editor .cm-content")).toBeFocused();
  await expect.poll(content).toBe("**bold**\n");
  await page.keyboard.press(`${mod}+z`);
  // 连续删除选区并输入属于同一轮键入，撤销恢复这轮输入之前的原选区。
  await expect.poll(content).toBe(source);
  await page.keyboard.press("Backspace");
  await expect.poll(content).toBe("\n");
  await page.keyboard.type("```");
  await expect.poll(content).toBe("```\n");
  await page.keyboard.press("Enter");
  await page.keyboard.type("x * y");
  await expect.poll(content).toBe("```\nx * y\n```\n");
  await product.manualSave();
  const saved = await content();
  await product.expectSaved(saved);
  await product.normalClose();
  page = await product.launch(saved);
  await openPairingSettings(page);
  await expect(page.locator("#settings-auto-pair-brackets")).not.toBeChecked();
  await expect(page.locator("#settings-auto-pair-markdown")).toBeChecked();
  await product.normalClose();
});
