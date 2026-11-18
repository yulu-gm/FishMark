import { test, expect } from "./product-fixture.mjs";

// Same indentation and two whitespace-only rows as the reported case.
// The preceding outer list item makes the third, truly empty row structural.
const list = [
  "- Outer item",
  "   -  Tables",
  "       -  Talents",
  "           -  Unlock field",
  "             -   Unlock rule",
  "       -   Items",
  "           -   New item type",
  "       -   Weapons",
  "           -   Move this field to the other table",
  " ".repeat(11),
  " ".repeat(11),
  "",
  "- Next list",
  "  - Next item"
];
const filler = side => Array.from({ length: 180 }, (_, index) => `${side} row ${index}`).join("\n\n");
const prefix = filler("Before") + "\n\n";
const source = prefix + list.join("\n") + "\n\n" + filler("After");
const precedingLine = "Move this field to the other table";
const blankStarts = [9, 10].map(index => prefix.length + list.slice(0, index).join("\n").length + 1);

function gapRows(page) {
  return page.evaluate(label => {
    const scroller = document.querySelector(".cm-scroller");
    const viewport = scroller.getBoundingClientRect();
    const previous = [...scroller.querySelectorAll(".cm-line")].find(line => line.textContent.includes(label));
    const rows = [previous, previous?.nextElementSibling, previous?.nextElementSibling?.nextElementSibling];
    const selection = document.getSelection();
    const focusNode = selection?.focusNode;
    const selectedLine = (focusNode instanceof Element ? focusNode : focusNode?.parentElement)?.closest(".cm-line");
    const range = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    return {
      scrollTop: scroller.scrollTop,
      viewport: { top: viewport.top, bottom: viewport.bottom },
      focused: Boolean(document.activeElement?.closest(".cm-content")),
      selectedRow: rows.indexOf(selectedLine),
      caret: range && { x: range.x, y: range.y, height: range.height },
      rows: rows.map(line => {
        if (!line?.classList.contains("cm-line")) return null;
        const { x, y, width, height } = line.getBoundingClientRect();
        return { x, y, width, height, text: line.textContent, classes: line.className };
      })
    };
  }, precedingLine);
}

test("clicking editable rows in a nested-list gap keeps caret and viewport local", async ({ product }) => {
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const isMac = process.platform === "darwin";
  const proof = [];
  try {
    for (const { row, refocus } of [
      { row: 0, refocus: true },
      { row: 1, refocus: false },
      { row: 1, refocus: true },
      { row: 2, refocus: true }
    ]) {
      await product.focus(page);
      await page.keyboard.press(isMac ? "Meta+ArrowUp" : "Control+Home");
      if (refocus) await page.getByRole("button", { name: "Switch to source mode", exact: true }).focus();
      // Scroll the viewport without moving the old caret at document start.
      await page.locator(".cm-scroller").evaluate(scroller => {
        scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
      });
      let before;
      await expect.poll(async () => {
        before = await gapRows(page);
        return before.rows.every(entry => entry && entry.height > 0 &&
          entry.y >= before.viewport.top && entry.y + entry.height <= before.viewport.bottom);
      }).toBe(true);
      expect(before.focused).toBe(!refocus);
      const hit = before.rows[row];
      const attempt = { row, refocus, before, frames: [] };
      proof.push(attempt);
      await page.locator(".cm-scroller").evaluate(scroller => {
        const samples = [scroller.scrollTop];
        const onScroll = () => samples.push(scroller.scrollTop);
        scroller.addEventListener("scroll", onScroll);
        window.takeListGapScroll = () => {
          scroller.removeEventListener("scroll", onScroll);
          return samples;
        };
      });
      await page.mouse.click(hit.x + Math.min(110, hit.width / 2), hit.y + hit.height / 2);
      for (let frame = 0; frame < 4; frame++) {
        await page.evaluate(() => new Promise(done => requestAnimationFrame(done)));
        attempt.frames.push(await gapRows(page));
      }
      const after = attempt.frames.at(-1);
      attempt.scrollEvents = await page.evaluate(() => window.takeListGapScroll());
      expect(Math.min(...attempt.scrollEvents, ...attempt.frames.map(frame => frame.scrollTop))).toBeGreaterThan(1000);
      expect(after.focused).toBe(true);
      expect(after.selectedRow).toBe(row);
      expect(Math.abs(after.rows[0].y - before.rows[0].y)).toBeLessThanOrEqual(2);
      expect((await product.snapshot()).activeDocument.content).toBe(source);
      if (row === 0) continue;

      const canary = "BLANK-ROW-CARET";
      const from = blankStarts[row - 1];
      await product.nativeInsert(canary, page);
      await expect.poll(async () => (await product.snapshot()).activeDocument.content.includes(canary)).toBe(true);
      const changed = (await product.snapshot()).activeDocument.content;
      const offset = changed.indexOf(canary);
      attempt.insertionOffset = offset;
      expect(offset).toBeGreaterThanOrEqual(from);
      expect(offset).toBeLessThanOrEqual(from + 11);
      expect(changed).toBe(source.slice(0, offset) + canary + source.slice(offset));

      await page.keyboard.press(isMac ? "Meta+z" : "Control+z");
      await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
    }
    expect(await product.disk()).toBe(source);
    await product.normalClose();
  } finally {
    await product.testInfo.attach("list-gap-pointer-trace", { body: JSON.stringify(proof, null, 2), contentType: "application/json" });
  }
});
