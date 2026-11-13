import { test, expect } from "./product-fixture.mjs";

const source = body => `| Above | Other |\n| --- | --- |\n| ${body} | Tall neighbour |\n| Below | End |\n`;
const cell = (page, row) => page.locator(`[data-table-cell="${row}:0"]`);
const content = async product => (await product.snapshot()).activeDocument.content;

async function setCaret(editor, offset) {
  await editor.evaluate((element, offset) => element.setSelectionRange(offset, offset), offset);
}

async function caret(editor) {
  return editor.evaluate(element => {
    const selection = document.getSelection();
    const rect = selection.rangeCount ? selection.getRangeAt(0).getClientRects()[0] : undefined;
    return {
      offset: element.selectionStart, end: element.selectionEnd,
      top: rect?.top ?? null, left: rect?.left ?? null,
      selected: selection.toString()
    };
  });
}

test("表格显式换行、空白行与行边界", async ({ product }) => {
  const initial = source("abcdefUVWXYZ");
  const afterBreak = source("abcdef<br>UVWXYZ");
  const afterEmptyLine = source("abcdef<br><br>UVWXYZ");
  await product.seed(initial, 60_000);
  const page = await product.launch(initial);
  const editor = cell(page, 1);
  await editor.click();
  await setCaret(editor, 6);
  await page.keyboard.press("Shift+Enter");
  await expect.poll(() => content(product)).toBe(afterBreak);
  await expect.poll(async () => (await caret(editor)).offset).toBe(10);
  await page.keyboard.press("Shift+Enter");
  await expect.poll(() => content(product)).toBe(afterEmptyLine);

  await setCaret(editor, 2);
  const first = await caret(editor);
  expect(first.top).not.toBeNull();
  await page.keyboard.press("ArrowDown");
  await expect(editor).toBeFocused();
  await expect.poll(async () => (await caret(editor)).offset).toBe(10);
  await page.keyboard.press("ArrowDown");
  await expect(editor).toBeFocused();
  const last = await caret(editor);
  expect(last.offset).toBeGreaterThan(14);
  expect(last.top).toBeGreaterThan(first.top);
  expect(Math.abs(last.left - first.left)).toBeLessThan(12);

  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await caret(editor)).offset).toBe(10);
  await page.keyboard.press("ArrowUp");
  expect((await caret(editor)).offset).toBe(2);
  await page.keyboard.press("ArrowUp");
  await expect(cell(page, 0)).toBeFocused();

  await editor.click();
  await setCaret(editor, 16);
  await page.keyboard.press("ArrowDown");
  await expect(cell(page, 2)).toBeFocused();
  expect(await content(product)).toBe(afterEmptyLine);

  await editor.click();
  await setCaret(editor, 10);
  await page.keyboard.press("Backspace");
  await expect.poll(() => content(product)).toBe(afterBreak);
  await product.manualSave();
  await product.expectSaved(afterBreak);
  await product.normalClose();
});
test("表格按实际折行移动，保留 Shift 扩选、非空选区与 IME 按键", async ({ product }) => {
  const initial = source("abcdefghijklmnopqrstuvwxyz".repeat(5));
  await product.seed(initial, 60_000);
  const page = await product.launch(initial);
  const editor = cell(page, 1);
  await editor.click();
  await editor.evaluate(element => { element.style.maxWidth = "125px"; });
  await setCaret(editor, 2);
  const first = await caret(editor);
  expect(first.top).not.toBeNull();
  await page.keyboard.press("ArrowDown");
  await expect(editor).toBeFocused();
  const second = await caret(editor);
  expect(second.top).toBeGreaterThan(first.top);
  expect(second.offset).toBeGreaterThan(first.offset);
  await page.keyboard.press("ArrowUp");
  expect((await caret(editor)).offset).toBe(first.offset);

  await page.keyboard.press("Shift+ArrowDown");
  const extended = await caret(editor);
  expect(extended.end).toBeGreaterThan(extended.offset);
  expect(extended.selected.length).toBeGreaterThan(0);
  await expect(editor).toBeFocused();

  await editor.evaluate(element => element.setSelectionRange(0, 2));
  await page.keyboard.press("ArrowUp");
  await expect(editor).toBeFocused();
  const collapsed = await caret(editor);
  expect(collapsed.offset).toBe(collapsed.end);

  await setCaret(editor, 0);
  const intercepted = await editor.evaluate(element => {
    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp", bubbles: true, cancelable: true, isComposing: true
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(intercepted).toBe(false);
  await expect(editor).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(cell(page, 0)).toBeFocused();
  expect(await content(product)).toBe(initial);
  await product.normalClose();
});


test("表格换行能整段删除并撤销，中文输入保留行边界", async ({ product }) => {
  const initial = source("abcdef<br><br>UVWXYZ");
  const joined = source("abcdef<br>UVWXYZ");
  await product.seed(initial, 60_000);
  const page = await product.launch(initial);
  const editor = cell(page, 1);
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await editor.click();

  for (const [offset, key] of [[10, "Backspace"], [6, "Delete"]]) {
    await setCaret(editor, offset);
    await page.keyboard.press(key);
    await expect.poll(() => content(product)).toBe(joined);
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(() => content(product)).toBe(initial);
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect.poll(() => content(product)).toBe(joined);
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(() => content(product)).toBe(initial);
  }

  await setCaret(editor, 10);
  await page.keyboard.insertText("X");
  await expect.poll(() => content(product)).toBe(source("abcdef<br>X<br>UVWXYZ"));
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => content(product)).toBe(initial);

  expect(await editor.innerText()).toBe("abcdef\n\nUVWXYZ");
  expect(await content(product)).toBe(initial);

  await setCaret(editor, 14);
  const cdp = await product.current.app.context().newCDPSession(page);
  try {
    await cdp.send("Input.imeSetComposition", { text: "中", selectionStart: 1, selectionEnd: 1 });
    await cdp.send("Input.insertText", { text: "中文" });
    await expect.poll(() => content(product)).toBe(source("abcdef<br><br>中文UVWXYZ"));
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(() => content(product)).toBe(initial);
  } finally {
    await cdp.detach();
  }
  await product.normalClose();
});
