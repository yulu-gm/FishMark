import { test, expect } from "./product-fixture.mjs";

const documentStart = process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home";
const documentEnd = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";

async function openEditor(product, source) {
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  await product.focus(page);
  return page;
}

async function caret(page) {
  return page.locator(".cm-content").evaluate(content => {
    const selection = getSelection();
    const node = selection.focusNode;
    const line = (node?.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest(".cm-line");
    if (!line || !content.contains(line) || !selection.isCollapsed) return null;

    const prefix = document.createRange();
    prefix.selectNodeContents(line);
    prefix.setEnd(node, selection.focusOffset);
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    return { text: line.textContent, offset: prefix.toString().length, x: rect.x, y: rect.y };
  });
}

async function expectCaret(page, text, offset) {
  await expect.poll(() => caret(page)).toMatchObject({ text, offset });
}

async function press(page, key, count) {
  for (let index = 0; index < count; index++) await page.keyboard.press(key);
}

async function narrowWindow(product, page) {
  const owner = await product.current.app.browserWindow(page);
  try {
    const width = await owner.evaluate(window => {
      window.setSize(window.getMinimumSize()[0], 800);
      return window.getContentSize()[0];
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
  } finally {
    await owner.dispose();
  }
}

test("vertical arrows restore the original column after a short line in both directions", async ({ product }) => {
  // 分别走普通文本和折叠分隔行；短行末尾不能成为下一次移动的目标列。
  const first = "abcdefghijklm";
  const last = "nopqrstuvwxyz";
  const source = [first, "x", last, "", first, "", "x", "", last].join("\n");
  const page = await openEditor(product, source);
  await page.keyboard.press(documentStart);
  await press(page, "ArrowRight", 8);
  await page.keyboard.press("ArrowDown");
  await expectCaret(page, "x", 1);
  await page.keyboard.press("ArrowDown");
  await expectCaret(page, last, 8);
  await page.keyboard.press("ArrowUp");
  await expectCaret(page, "x", 1);
  await page.keyboard.press("ArrowUp");
  await expectCaret(page, first, 8);

  await page.keyboard.press(documentEnd);
  await press(page, "ArrowLeft", 5);
  await page.keyboard.press("ArrowUp");
  await expectCaret(page, "x", 1);
  await page.keyboard.press("ArrowUp");
  await expectCaret(page, first, 8);
  await page.keyboard.press("ArrowDown");
  await expectCaret(page, "x", 1);
  await page.keyboard.press("ArrowDown");
  await expectCaret(page, last, 8);

  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowDown");
  await expectCaret(page, last, 7);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(false);
  await product.normalClose();
});

const wrappedText = "中文🙂 abc def ghi ".repeat(23).trimEnd();

test("wrapped paragraph moves one visual row at a time before entering a table", async ({ product }) => {
  const source = [wrappedText, "", "| name | qty |", "| --- | --- |", "| pen | 2 |"].join("\n");
  const page = await openEditor(product, source);
  await narrowWindow(product, page);
  await page.keyboard.press(documentStart);
  await press(page, "ArrowRight", 3);
  const first = await caret(page);
  expect(first?.text).toBe(wrappedText);
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await caret(page))?.y).toBeGreaterThan(first.y);
  const second = await caret(page);
  expect(second.text).toBe(wrappedText);
  expect(Math.abs(second.x - first.x)).toBeLessThan(20);
  expect(wrappedText.charCodeAt(second.offset)).not.toBe(0xde42);

  await page.keyboard.press("ArrowUp");
  await expectCaret(page, wrappedText, first.offset);
  // 每一次仍在段落里的 Down 都应推进一行，最后才把焦点交给表格。
  let reachedTable = false;
  for (let index = 0; index < 20; index++) {
    const previous = await caret(page);
    await page.keyboard.press("ArrowDown");
    if (await page.locator('[data-table-cell="0:0"]').evaluateAll(cells => cells.includes(document.activeElement))) {
      reachedTable = true;
      break;
    }
    await expect.poll(async () => (await caret(page))?.offset).toBeGreaterThan(previous.offset);
    expect((await caret(page)).text).toBe(wrappedText);
  }
  expect(reachedTable).toBe(true);
  await expect(page.locator('[data-table-cell="0:0"]')).toBeFocused();
  expect((await product.snapshot()).activeDocument.content).toBe(source);
  await product.normalClose();
});

test("wrapped code content reaches the fences only at its visual edges", async ({ product }) => {
  const source = ["Before", "", "```txt", wrappedText, "```", "", "After"].join("\n");
  const page = await openEditor(product, source);
  await narrowWindow(product, page);
  const code = page.locator(".cm-line").filter({ hasText: wrappedText });
  await code.click({ position: { x: 65, y: 12 } });
  const first = await caret(page);
  expect(first?.text).toBe(wrappedText);
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await caret(page))?.offset).toBeGreaterThan(first.offset);
  expect((await caret(page)).text).toBe(wrappedText);
  await page.keyboard.press("ArrowUp");
  await expectCaret(page, wrappedText, first.offset);
  await page.keyboard.press("ArrowUp");
  await expectCaret(page, "```txt", 0);

  await code.click({ position: { x: 65, y: 12 } });
  // 命中末尾文字，不把行盒底部的 padding 当作最后一个视觉行。
  const end = await code.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) if (walker.currentNode.textContent.length) last = walker.currentNode;
    const range = document.createRange();
    range.setStart(last, last.textContent.length - 1);
    range.setEnd(last, last.textContent.length);
    const rect = range.getBoundingClientRect();
    return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
  });
  await page.mouse.click(end.x, end.y);
  expect((await caret(page))?.text).toBe(wrappedText);
  await page.keyboard.press("ArrowDown");
  await expectCaret(page, "```", 0);
  expect((await product.snapshot()).activeDocument.content).toBe(source);
  await product.normalClose();
});
