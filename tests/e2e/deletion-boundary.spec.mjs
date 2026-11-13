import { expect, test } from "./product-fixture.mjs";

const undo = process.platform === "darwin" ? "Meta+z" : "Control+z";
const redo = process.platform === "darwin" ? "Meta+Shift+z" : "Control+y";
const documentStart = process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home";
const documentEnd = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";

async function open(product, source) {
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  await product.focus(page);
  return page;
}

function expectSource(product, source) {
  return expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(source);
}

async function expectCaret(page, text, column) {
  // 读真实 DOM 选区；列偏移相对于可见文字，忽略 DOM 中可能隐藏的标记，不用测试事务设置光标。
  await expect.poll(() => page.evaluate(({ text }) => {
    const selection = document.getSelection();
    const node = selection?.focusNode;
    const line = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest(".cm-line");
    if (!node || !line || !selection.isCollapsed || !line.textContent.includes(text)) return null;
    const prefix = document.createRange();
    prefix.selectNodeContents(line);
    prefix.setEnd(node, selection.focusOffset);
    return prefix.toString().length - line.textContent.indexOf(text);
  }, { text })).toBe(column);
}

test("正文与代码围栏两侧用 Delete / Backspace 跨界，保留围栏和语言", async ({ product }) => {
  const source = "Alpha\n```python\ncode\n```\nOmega";
  const page = await open(product, source);
  await page.keyboard.press(documentStart);
  for (let i = 0; i < "Alpha".length; i++) await page.keyboard.press("ArrowRight");
  await expectCaret(page, "Alpha", 5);

  await page.keyboard.press("Delete");
  await expectCaret(page, "code", 0);
  await expectSource(product, source);

  await page.keyboard.press("Backspace");
  await expectCaret(page, "Alpha", 5);
  await expectSource(product, source);

  await page.keyboard.press(documentEnd);
  for (let i = 0; i < "Omega".length; i++) await page.keyboard.press("ArrowLeft");
  await expectCaret(page, "Omega", 0);
  await page.keyboard.press("Backspace");
  await expectCaret(page, "code", 4);
  await expectSource(product, source);

  await page.keyboard.press("Delete");
  await expectCaret(page, "Omega", 0);
  await expectSource(product, source);
  await product.normalClose();
});

test("标题与正文合并后保留闭合标记，可撤销、重做并保存重开", async ({ product }) => {
  const source = "## Head ##\n\nAlpha";
  const merged = "## HeadAlpha ##";
  const page = await open(product, source);
  await page.keyboard.press(documentEnd);
  for (let i = 0; i < "Alpha".length; i++) await page.keyboard.press("ArrowLeft");
  await expectCaret(page, "Alpha", 0);

  await page.keyboard.press("Backspace");
  await expectSource(product, merged);
  await expectCaret(page, "HeadAlpha", "Head".length);
  await page.keyboard.press(undo);
  await expectSource(product, source);
  await expectCaret(page, "Alpha", 0);

  await page.keyboard.press(redo);
  await expectSource(product, merged);
  await product.manualSave(page);
  await product.expectSaved(merged, page);
  await product.normalClose();

  const reopened = await product.launch(merged);
  await product.expectSaved(merged, reopened);
  await product.normalClose();
});

test("任务父项末尾 Delete 不吞掉嵌套子项，正文开头 Backspace 不并入子项", async ({ product }) => {
  const source = "- [x] Task\n  - child\n\nOmega";
  const page = await open(product, source);
  await page.keyboard.press(documentStart);
  const endOfLine = process.platform === "darwin" ? "Meta+ArrowRight" : "End";
  await page.keyboard.press(endOfLine);
  await expectCaret(page, "Task", "Task".length);
  await page.keyboard.press("Delete");
  await expectCaret(page, "child", 0);
  await expectSource(product, source);

  await page.keyboard.press(documentEnd);
  for (let i = 0; i < "Omega".length; i++) await page.keyboard.press("ArrowLeft");
  await expectCaret(page, "Omega", 0);
  await page.keyboard.press("Backspace");
  await expectCaret(page, "child", "child".length);
  await expectSource(product, source);
  await product.normalClose();
});

test("表格外正文 Delete / Backspace 分别进入表格首格和末格，保留源码", async ({ product }) => {
  const source = "Alpha\n\n| Head | Key |\n| --- | --- |\n| val | End |\n\nOmega";
  const page = await open(product, source);
  await page.keyboard.press(documentStart);
  for (let i = 0; i < "Alpha".length; i++) await page.keyboard.press("ArrowRight");
  await expectCaret(page, "Alpha", 5);

  await page.keyboard.press("Delete");
  const first = page.locator('[data-table-cell="0:0"]');
  await expect(first).toBeFocused();
  await expect.poll(() => first.evaluate(cell => cell.selectionStart)).toBe(0);
  await expectSource(product, source);

  await product.focus(page);
  await page.keyboard.press(documentEnd);
  for (let i = 0; i < "Omega".length; i++) await page.keyboard.press("ArrowLeft");
  await expectCaret(page, "Omega", 0);
  await page.keyboard.press("Backspace");
  const last = page.locator('[data-table-cell="1:1"]');
  await expect(last).toBeFocused();
  await expect.poll(() => last.evaluate(cell => cell.selectionStart)).toBe("End".length);
  await expectSource(product, source);
  await product.normalClose();
});
