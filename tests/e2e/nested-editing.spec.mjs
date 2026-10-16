import { writeFile } from "node:fs/promises";
import { test, expect } from "./product-fixture.mjs";

// These short fixtures contain only source-preserving text/marker spans. Every
// selection observation first verifies all DOM lines against canonical source.
async function observe(product, page) {
  const snapshot = await product.snapshot(page);
  const dom = await page.evaluate(() => {
    const content = document.querySelector(".cm-content");
    const lines = [...content.querySelectorAll(".cm-line")];
    const current = getSelection();
    const offset = (node, position) => {
      const line = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest(".cm-line");
      if (!line || !lines.includes(line)) return null;
      const prefix = document.createRange(); prefix.selectNodeContents(line); prefix.setEnd(node, position);
      return lines.slice(0, lines.indexOf(line)).reduce((sum, line) => sum + line.textContent.length + 1, 0) + prefix.toString().length;
    };
    return { source: lines.map(line => line.textContent).join("\n"),
      selection: { anchor: offset(current?.anchorNode, current?.anchorOffset), head: offset(current?.focusNode, current?.focusOffset) },
      selectedText: current?.toString(), focused: !!document.activeElement?.closest(".cm-editor"),
      viewMode: document.querySelector("[data-fishmark-editor-view-mode]")?.dataset.fishmarkEditorViewMode,
      events: window.__nestedKeys.events };
  });
  return { snapshot, dom };
}
async function checkpoint(product, page, label, source, anchor, head = anchor) {
  product.nestedKeyboardStep = (product.nestedKeyboardStep ?? 0) + 1;
  const unique = `${String(product.nestedKeyboardStep).padStart(2, "0")}-${label}`;
  let proof;
  try {
    await expect.poll(async () => {
      proof = await observe(product, page);
      return { canonical: proof.snapshot.activeDocument?.content, source: proof.dom.source, selection: proof.dom.selection };
    }).toEqual({ canonical: source, source, selection: { anchor, head } });
  } finally {
    if (proof) await writeFile(product.testInfo.outputPath(`${unique}-keyboard-proof.json`), JSON.stringify(proof, null, 2));
  }
  await product.checkpoint(unique, page);
}
async function mode(page, source) {
  const button = page.getByRole("button", { name: source ? "Switch to source mode" : "Switch to WYSIWYM mode", exact: true });
  if (await button.count()) await button.click();
  await expect(page.locator("[data-fishmark-editor-view-mode]")).toHaveAttribute("data-fishmark-editor-view-mode", source ? "source" : "wysiwym");
}
async function selectSource(product, page, anchor, head = anchor) {
  await mode(page, true);
  await product.focus(page);
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < anchor; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < Math.abs(head - anchor); i++) await page.keyboard.press(head > anchor ? "Shift+ArrowRight" : "Shift+ArrowLeft");
  const source = (await product.snapshot()).activeDocument.content;
  await checkpoint(product, page, "source-positioned", source, anchor, head);
  await mode(page, false);
  await checkpoint(product, page, "rendered-positioned", source, anchor, head);
}
async function setup(product, source) {
  await product.seed(source, 60_000);
  const page = await product.launch(source);

  await page.evaluate(() => {
    window.__nestedKeys = { events: [] };
    for (const type of ["keydown", "keyup", "beforeinput", "input"]) document.addEventListener(type, e => {
      if (e.target.closest?.(".cm-content")) window.__nestedKeys.events.push({ epochMs: Date.now(), type, key: e.key, code: e.code,
        trusted: e.isTrusted, composing: e.isComposing, inputType: e.inputType, data: e.data, ctrl: e.ctrlKey, shift: e.shiftKey });
    }, true);
  });
  return page;
}
async function press(product, page, key, label, source, anchor, head = anchor) {
  await product.focus(page);
  const start = await page.evaluate(() => window.__nestedKeys.events.length);
  await page.keyboard.press(key);
  const events = await page.evaluate(start => window.__nestedKeys.events.slice(start), start);
  expect(events.filter(e => e.type === "keydown").length).toBeGreaterThan(0);
  expect(events.every(e => e.trusted)).toBe(true);
  await checkpoint(product, page, label, source, anchor, head);
}
async function saveAndReopen(product, page, source) {
  await product.manualSave(page);
  await product.expectSaved(source, page);
  await product.checkpoint("keyboard-final-saved", page);
  await product.normalClose();
  await product.launch(source);
  await product.expectSaved(source);
  await product.normalClose();
}

test("product nested quoted subtree Tab Shift-Tab undo redo preserve source caret and saved history", async ({ product }) => {
  test.skip(process.platform !== "win32", "This batch verifies Windows product keyboard mappings.");
  const source = "> - parent\n>   - first\n>   - child\n>     - leaf";
  const indented = "> - parent\n>   - first\n>     - child\n>       - leaf";
  const caret = source.indexOf("child") + 2;
  const page = await setup(product, source);
  await selectSource(product, page, caret);
  await press(product, page, "Tab", "subtree-indented", indented, caret + 2);
  await press(product, page, "Control+z", "indent-undone", source, caret);
  await press(product, page, "Control+y", "indent-redone", indented, caret + 2);
  await press(product, page, "Shift+Tab", "subtree-outdented", source, caret);
  await press(product, page, "Control+z", "outdent-undone", indented, caret + 2);
  await press(product, page, "Control+y", "outdent-redone", source, caret);
  await press(product, page, "Tab", "saved-indent", indented, caret + 2);
  await product.manualSave(page);
  await product.expectSaved(indented);
  await press(product, page, "Control+z", "undo-after-save", source, caret);
  expect(await product.disk()).toBe(indented);
  await press(product, page, "Control+y", "redo-after-save", indented, caret + 2);
  await saveAndReopen(product, page, indented);
});

test("product nested Enter Backspace undo redo retain exact empty-item source caret and save", async ({ product }) => {
  test.skip(process.platform !== "win32", "This batch verifies Windows product keyboard mappings.");
  const source = "- parent\n  - child\n    - grandchild";
  const marker = source + "\n    - ";
  const blank = source + "\n    ";
  const page = await setup(product, source);
  await product.focus(page);
  await page.keyboard.press("Control+End");
  await checkpoint(product, page, "nested-end", source, source.length);
  await press(product, page, "Enter", "nested-empty-marker", marker, marker.length);
  await press(product, page, "Backspace", "nested-marker-removed", blank, blank.length);
  await press(product, page, "Control+z", "backspace-undone", marker, marker.length);
  await press(product, page, "Control+z", "enter-undone", source, source.length);
  await press(product, page, "Control+y", "enter-redone", marker, marker.length);
  await press(product, page, "Control+y", "backspace-redone", blank, blank.length);
  await saveAndReopen(product, page, blank);
});

test("product inline marker boundaries reverse selection history and source roundtrips and inert F11 preserve exact text", async ({ product }) => {
  test.skip(process.platform !== "win32", "This batch verifies Windows product keyboard mappings.");
  const source = "- parent\n  - **alpha** and *beta*";
  const body = source.indexOf("alpha");
  const page = await setup(product, source);
  // Real accepted input establishes progressive editing presentation. Undo
  // leaves no applied history before the source-marker navigation checks.
  await product.append("x");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source + "x");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  await selectSource(product, page, body + 1);
  await press(product, page, "ArrowLeft", "inline-body-opening", source, body);
  await press(product, page, "ArrowLeft", "inline-opening-source-character", source, body - 1);
  await press(product, page, "ArrowRight", "inline-return-body-opening", source, body);
  await selectSource(product, page, body + 4, body + 1);
  await checkpoint(product, page, "reverse-bold-range", source, body + 4, body + 1);
  await mode(page, true);
  await checkpoint(product, page, "source-mode-reverse-range", source, body + 4, body + 1);
  await mode(page, false);
  await checkpoint(product, page, "rendered-mode-reverse-range", source, body + 4, body + 1);
  const changed = source.slice(0, body + 1) + source.slice(body + 4);
  await press(product, page, "Backspace", "inline-range-deleted", changed, body + 1);
  await mode(page, true);
  await checkpoint(product, page, "source-mode-history-preserved", changed, body + 1);
  await mode(page, false);
  await checkpoint(product, page, "rendered-mode-history-preserved", changed, body + 1);
  await page.keyboard.press("F11");
  await expect(page.locator('[data-fishmark-region="app-status-bar"]')).toHaveAttribute("data-visibility", "visible");
  await checkpoint(product, page, "f11-keeps-chrome-visible", changed, body + 1);
  await page.keyboard.press("F11");
  await expect(page.locator('[data-fishmark-region="app-status-bar"]')).toHaveAttribute("data-visibility", "visible");
  await press(product, page, "Control+z", "undo-after-view-roundtrips", source, body + 4, body + 1);
  await press(product, page, "Control+y", "redo-after-view-roundtrips", changed, body + 1);
  // Native history maps the caret when inverting the redo event; this repeat
  // restores a collapsed caret, unlike the original reverse selection above.
  await press(product, page, "Control+z", "repeated-native-undo", source, body + 4);
  await press(product, page, "Control+y", "repeated-native-redo", changed, body + 1);
  await saveAndReopen(product, page, changed);
});
