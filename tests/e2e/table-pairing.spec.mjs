import { test, expect } from "./product-fixture.mjs";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const table = text => `| name | qty |\n| --- | --- |\n| ${text} | 2 |\n`;
const content = async product => (await product.snapshot()).activeDocument.content;
const bodyCell = (page, column = 0) => page.locator(`[data-table-cell="1:${column}"]`);

async function configurePairing(page, brackets, markdown) {
  await page.getByRole("button", { name: "打开偏好设置" }).click();
  await page.locator("#settings-navigation-editing-children button").click();
  if (await page.locator("#settings-auto-pair-brackets").isChecked() !== brackets) await page.locator("#settings-auto-pair-brackets").click();
  await expect(page.locator("#settings-auto-pair-brackets")).toBeChecked({ checked: brackets });
  if (await page.locator("#settings-auto-pair-markdown").isChecked() !== markdown) await page.locator("#settings-auto-pair-markdown").click();
  await expect(page.locator("#settings-auto-pair-markdown")).toBeChecked({ checked: markdown });
  await page.getByRole("button", { name: "关闭设置" }).click();
}

async function clearCell(page) {
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press("Backspace");
}

for (const cleared of [false, true]) {
  test(`表格空单元格 IME 回归：${cleared ? "输入后清空" : "初始空格直接输入"}`, async ({ product }) => {
    const initial = table("");
    await product.seed(initial, 60_000);
    const page = await product.launch(initial);
    await bodyCell(page).click();
    if (cleared) {
      await page.keyboard.insertText("([plain]");
      await expect.poll(() => content(product)).toBe(table("([plain]"));
      await clearCell(page);
      await expect.poll(() => content(product)).toBe(initial);
    }
    const cdp = await product.current.app.context().newCDPSession(page);
    try {
      // 保留同值合成提交，验证空单元格光标不会导致合成区丢失、重复插入或源码漏提交。
      await cdp.send("Input.imeSetComposition", { text: "[", selectionStart: 1, selectionEnd: 1 });
      await cdp.send("Input.insertText", { text: "[" });
      await expect(bodyCell(page)).not.toHaveAttribute("data-table-cell-composing", "true");
      await expect(bodyCell(page)).toHaveText("[");
      await expect.poll(() => content(product)).toBe(table("["));
    } finally {
      await cdp.detach();
    }
    const saved = table("[");
    await product.manualSave();
    await product.expectSaved(saved);
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(() => content(product)).toBe(initial);
    await expect(bodyCell(page)).toHaveText("");
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect.poll(() => content(product)).toBe(saved);
    await expect(bodyCell(page)).toHaveText("[");
    await product.manualSave();
    await product.expectSaved(saved);
    await product.normalClose();
  });
}

test("表格原生配对、反向选区、空配对退格及保存重开", async ({ product }) => {
  const initial = table("中文");
  await product.seed(initial, 60_000);
  let page = await product.launch(initial);
  await bodyCell(page).click();
  // 只用真实键盘建立反向选区，不通过源码 dispatch 或 DOM setter 代替输入。
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.type('"');
  await expect.poll(() => content(product)).toBe(table('"中文"'));
  const selected = await bodyCell(page).evaluate(element => {
    const selection = document.getSelection();
    const range = selection.getRangeAt(0);
    return { text: selection.toString(), owned: element.contains(selection.anchorNode),
      backward: selection.anchorNode === range.endContainer && selection.anchorOffset === range.endOffset };
  });
  expect(selected).toEqual({ text: "中文", owned: true, backward: true });
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => content(product)).toBe(initial);
  await clearCell(page);
  await expect.poll(() => content(product)).toBe(table(""));
  await page.keyboard.type("(");
  await expect.poll(() => content(product)).toBe(table("()"));
  await page.keyboard.press("Backspace");
  await expect.poll(() => content(product)).toBe(table(""));
  await page.keyboard.type("(x)");
  await expect.poll(() => content(product)).toBe(table("(x)"));
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => content(product)).toBe(table(""));
  await page.keyboard.press(`${mod}+Shift+z`);
  const saved = table("(x)");
  await expect.poll(() => content(product)).toBe(saved);
  await product.manualSave();
  await product.expectSaved(saved);
  await product.normalClose();
  page = await product.launch(saved);
  await expect(bodyCell(page)).toHaveText("(x)");
  await product.normalClose();
});

test("表格配对设置即时生效，Markdown 配对与粘贴、IME 分离", async ({ product }) => {
  const initial = table("");
  await product.seed(initial, 60_000);
  const page = await product.launch(initial);
  await configurePairing(page, true, true);
  await bodyCell(page).click();
  await page.keyboard.type("**bold**");
  await expect.poll(() => content(product)).toBe(table("**bold**"));
  await clearCell(page);
  await expect.poll(() => content(product)).toBe(initial);

  // 使用实际编辑区的批量文本输入验证不会按逐键配对；不改写用户系统剪贴板。
  await page.keyboard.insertText("([plain]");
  await expect.poll(() => content(product)).toBe(table("([plain]"));
  await clearCell(page);
  await expect.poll(() => content(product)).toBe(initial);
  const cdp = await product.current.app.context().newCDPSession(page);
  try {
    await cdp.send("Input.imeSetComposition", { text: "[", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.insertText", { text: "[" });
    await expect(bodyCell(page)).not.toHaveAttribute("data-table-cell-composing", "true");
    await expect.poll(() => content(product)).toBe(table("["));
  } finally {
    await cdp.detach();
  }
  await configurePairing(page, false, false);
  await bodyCell(page).click();
  await clearCell(page);
  await page.keyboard.type("(");
  await expect.poll(() => content(product)).toBe(table("("));
  await product.manualSave();
  await product.expectSaved(table("("));
  await product.normalClose();
});

test("缺失表格单元格配对保留结构历史，br 后配对可独立退格", async ({ product }) => {
  const initial = "| a | b | c |\n| --- | --- | --- |\n| x | y |\n";
  const withCell = initial.replace("| x | y |", "| x | y | [x] |");
  await product.seed(initial, 60_000);
  const page = await product.launch(initial);
  await bodyCell(page, 2).click();
  await page.keyboard.type("[x]");
  await expect.poll(() => content(product)).toBe(withCell);
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => content(product)).toBe(initial);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect.poll(() => content(product)).toBe(withCell);
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+Enter");
  const withBreak = withCell.replace("[x]", "[x]<br>");
  await expect.poll(() => content(product)).toBe(withBreak);
  await page.keyboard.type("(");
  await expect.poll(() => content(product)).toBe(withCell.replace("[x]", "[x]<br>()"));
  await page.keyboard.press("Backspace");
  await expect.poll(() => content(product)).toBe(withBreak);
  await page.keyboard.press("Backspace");
  await expect.poll(() => content(product)).toBe(withCell);
  await product.manualSave();
  await product.expectSaved(withCell);
  await product.normalClose();
});
