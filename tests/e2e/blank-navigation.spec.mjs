import { writeFile } from "node:fs/promises";
import { test, expect } from "./product-fixture.mjs";

const source = "1\n\n\n\n2\n\n\n\n3";
test.beforeEach(() => { test.skip(process.platform !== "win32", "This batch verifies Windows product keyboard navigation."); });
async function start(product, content, canonical = content) {
  await product.seed(content, 60_000);
  const page = await product.launch(canonical);
  const exit = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await exit.isVisible()) await exit.click();
  await product.focus(page);
  await page.evaluate(() => {
    window.__blankKeys = [];
    document.addEventListener("keydown", event => {
      if (event.target.closest?.(".cm-content")) window.__blankKeys.push({ key: event.key, trusted: event.isTrusted, shift: event.shiftKey });
    }, true);
  });
  return page;
}

async function observe(product, page, label, expectedSource, selection) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const snapshot = await product.snapshot(page);
  const dom = await page.evaluate(canonical => {
    const content = document.querySelector(".cm-content"), lines = [...content.querySelectorAll(".cm-line")];
    const sourceLines = canonical.split(/\r?\n/), starts = [0];
    for (const match of canonical.matchAll(/\r?\n/g)) starts.push(match.index + match[0].length);
    const current = getSelection();
    function offset(node, position) {
      const line = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest(".cm-line");
      if (!line || !lines.includes(line)) return null;
      const prefix = document.createRange(); prefix.selectNodeContents(line); prefix.setEnd(node, position);
      return starts[lines.indexOf(line)] + prefix.toString().length;
    }
    const top = content.getBoundingClientRect().top;
    return { sourceLines, renderedLines: lines.map(line => line.textContent), anchor: offset(current?.anchorNode, current?.anchorOffset),
      head: offset(current?.focusNode, current?.focusOffset), selectedText: current?.toString(), scrollTop: document.querySelector(".cm-scroller").scrollTop,
      rows: lines.map(line => ({ text: line.textContent, y: line.getBoundingClientRect().top - top, height: line.getBoundingClientRect().height, classes: line.className })),
      keys: window.__blankKeys };
  }, snapshot.activeDocument.content);
  await writeFile(product.testInfo.outputPath(`${label}-blank-proof.json`), JSON.stringify({ snapshot, dom }, null, 2));
  expect(snapshot.activeDocument.content).toBe(expectedSource);
  // This global DOM offset oracle is used only for short, fully rendered fixtures.
  expect(dom.renderedLines).toEqual(dom.sourceLines);
  expect(dom.selectedText).toBe(snapshot.activeDocument.content.slice(Math.min(dom.anchor, dom.head), Math.max(dom.anchor, dom.head)));
  expect(dom.keys.every(key => key.trusted)).toBe(true);
  if (selection) expect({ anchor: dom.anchor, head: dom.head }).toEqual(selection);
  return dom;
}
const geometry = dom => dom.rows.map(({ y, height }) => ({ y, height }));

test("blank navigation keeps extra rows stable through arrows selection editing undo and source mode", async ({ product }) => {
  const page = await start(product, source);
  await page.keyboard.press("Control+End");
  const initial = await observe(product, page, "01-initial", source, { anchor: 11, head: 11 });
  expect(initial.rows.filter(row => row.height === 0)).toHaveLength(4);
  let step = 1;
  async function stable(key, selection) {
    await page.keyboard.press(key);
    const dom = await observe(product, page, `${String(++step).padStart(2, "0")}-${key.replaceAll("+", "-")}`, source, selection);
    expect(geometry(dom)).toEqual(geometry(initial));
    return dom;
  }
  for (let round = 0; round < 2; round++) {
    await page.keyboard.press("Control+End");
    for (const head of [8, 6, 3, 1]) await stable("ArrowUp", { anchor: head, head });
    for (const head of [3, 5, 8, 10]) await stable("ArrowDown", { anchor: head, head });
  }
  await stable("End", { anchor: 11, head: 11 });
  await stable("Home", { anchor: 10, head: 10 });
  await stable("End", { anchor: 11, head: 11 });
  for (const head of [8, 6, 3, 1]) await stable("Shift+ArrowUp", { anchor: 11, head });
  await stable("ArrowRight");
  await page.keyboard.press("Control+End");
  await stable("Shift+ArrowUp");
  const range = await observe(product, page, "range-before-delete", source);
  const changed = source.slice(0, Math.min(range.anchor, range.head)) + source.slice(Math.max(range.anchor, range.head));
  await page.keyboard.press("Backspace");
  await observe(product, page, "range-deleted", changed);
  await page.keyboard.press("Control+z");
  await observe(product, page, "range-delete-undone", source);

  const blank = page.locator(".cm-line").nth(6);
  const box = await blank.boundingBox();
  await page.mouse.click(box.x + 8, box.y + box.height / 2);
  expect(geometry(await observe(product, page, "mouse-extra-blank", source, { anchor: 8, head: 8 }))).toEqual(geometry(initial));
  await page.keyboard.press("Backspace");
  // Keep the existing semantic empty-paragraph deletion contract.
  await observe(product, page, "legacy-extra-blank-deleted", source.slice(0, 6) + source.slice(8));
  await page.keyboard.press("Control+z");
  await observe(product, page, "extra-blank-delete-undone", source, { anchor: 8, head: 8 });
  await page.keyboard.type("x");
  const typed = source.slice(0, 8) + "x" + source.slice(8);
  await observe(product, page, "blank-typed", typed, { anchor: 9, head: 9 });
  await page.keyboard.press("Control+z"); await observe(product, page, "typing-undone", source);
  await page.keyboard.press("Control+y"); await observe(product, page, "typing-redone", typed);
  await page.keyboard.press("Backspace"); await observe(product, page, "typed-backspace", source);
  await page.keyboard.press("Control+z"); await observe(product, page, "backspace-undone", typed);
  await page.keyboard.press("Control+y"); await observe(product, page, "backspace-redone", source);
  await page.keyboard.press("Enter");
  // Preserve the existing paragraphBreak empty-line contract (two source LFs).
  const entered = source.slice(0, 8) + "\n\n" + source.slice(8);
  await observe(product, page, "intentional-blank-enter", entered);
  await page.keyboard.press("Control+z"); await observe(product, page, "enter-undone", source);

  await page.getByRole("button", { name: "Switch to source mode", exact: true }).click();
  const raw = await observe(product, page, "source-mode-all-rows", source);
  expect(raw.rows.every(row => row.height > 0)).toBe(true);
  await product.focus(page);
  await page.keyboard.press("Control+Home");
  for (const head of [2, 3, 4, 5, 7, 8, 9, 10]) {
    await page.keyboard.press("ArrowDown");
    await observe(product, page, `source-down-${head}`, source, { anchor: head, head });
  }
  for (const head of [9, 8, 7, 5, 4, 3, 2, 0]) {
    await page.keyboard.press("ArrowUp");
    await observe(product, page, `source-up-${head}`, source, { anchor: head, head });
  }
  await page.getByRole("button", { name: "Switch to WYSIWYM mode", exact: true }).click();
  await product.manualSave(); await product.expectSaved(source);
  await product.checkpoint("blank-navigation-final-saved");
  await product.normalClose(); await product.launch(source); await product.expectSaved(source); await product.normalClose();
});

test("CRLF and whitespace gaps keep existing source and layout during vertical navigation", async ({ product }) => {
  const content = "1\r\n\r\n\r\n\r\n2\r\n  \r\n\r\n3";
  // Existing open-markdown-file.decodeUtf8 normalizes source EOLs in memory.
  // Navigation must leave the original CRLF file bytes untouched.
  const canonical = content.replaceAll("\r\n", "\n");
  const page = await start(product, content, canonical);
  await page.keyboard.press("Control+Home");
  const initial = await observe(product, page, "crlf-initial", canonical);
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press("ArrowDown");
    const current = await observe(product, page, `crlf-down-${index}`, canonical);
    expect(geometry(current)).toEqual(geometry(initial));
  }
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press("ArrowUp");
    const current = await observe(product, page, `crlf-up-${index}`, canonical);
    expect(geometry(current)).toEqual(geometry(initial));
  }
  expect(await product.disk()).toBe(content);
  expect((await product.snapshot()).activeDocument.isDirty).toBe(false);
  await product.normalClose();
});

test("trailing blank editing retains the existing paragraph Backspace and undo contract", async ({ product }) => {
  const content = "tail\n\n\n";
  const page = await start(product, content);
  await page.keyboard.press("Control+End");
  for (const [index, [before, after]] of [["tail\n\n\n", "tail\n\n"], ["tail\n\n", "tail"]].entries()) {
    await page.keyboard.press("Backspace"); await observe(product, page, `tail-${index}-backspace`, after);
    await page.keyboard.press("Control+z"); await observe(product, page, `tail-${index}-undo`, before);
    await page.keyboard.press("Control+y"); await observe(product, page, `tail-${index}-redo`, after);
  }
  await product.manualSave(); await product.expectSaved("tail"); await product.normalClose();
});

test("long document blank navigation preserves row positions and scroll while traversing bottom gaps", async ({ product }) => {
  const content = Array.from({ length: 300 }, (_, index) => `row-${String(index).padStart(3, "0")}`).join("\n\n\n\n");
  const page = await start(product, content);
  await page.keyboard.press("Control+End");
  const records = [];
  async function record(label) {
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    expect((await product.snapshot()).activeDocument.content).toBe(content);
    const dom = await page.evaluate(() => {
      const scroller = document.querySelector(".cm-scroller"), root = document.querySelector(".cm-content").getBoundingClientRect();
      const row = [...document.querySelectorAll(".cm-line")].find(line => line.textContent === "row-299");
      const selection = getSelection(), line = selection.focusNode?.parentElement?.closest(".cm-line");
      return { y: row.getBoundingClientRect().top - root.top, height: row.getBoundingClientRect().height,
        scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight, caretLine: line?.textContent };
    });
    records.push({ label, dom }); await writeFile(product.testInfo.outputPath("long-blank-proof.json"), JSON.stringify(records, null, 2));
    return dom;
  }
  const initial = await record("initial");
  expect(initial.scrollTop).toBeGreaterThan(5000);
  for (let round = 0; round < 3; round++) {
    for (const key of ["ArrowUp", "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowDown"]) {
      await page.keyboard.press(key);
      const dom = await record(`${round}-${key}`);
      expect(dom.y).toBe(initial.y); expect(dom.height).toBe(initial.height); expect(dom.scrollHeight).toBe(initial.scrollHeight);
      expect(Math.abs(dom.scrollTop - initial.scrollTop)).toBeLessThan(100);
    }
  }
  await product.checkpoint("long-blank-scroll-stable"); await product.normalClose();
});
