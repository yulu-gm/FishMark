import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";
import { test, expect } from "./product-fixture.mjs";

const paragraph = (prefix, index) => `${prefix}-row-${String(index).padStart(4, "0")} ${"正文阅读位置 ".repeat(10)}`;
const documentText = prefix => Array.from({ length: 600 }, (_, i) => paragraph(prefix, i)).join("\n\n");
const tab = (page, id) => page.locator(`[data-fishmark-region="workspace-tab"][data-tab-id="${id}"]`);

async function start(product, source) {
  await product.seed(source, 60_000);
  const page = await product.launch(source);

  await product.focus(page);
  await page.keyboard.press("Control+Home");
  return { page, first: (await product.snapshot()).activeTabId };
}

async function newTab(product) {
  await product.current.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items
    .find(entry => entry.label === "File").submenu.items.find(entry => entry.label === "New").click());
  await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe("");
  return (await product.snapshot()).activeTabId;
}

async function openFile(product, page, path) {
  const before = (await product.snapshot()).tabs.length;
  // Native-backed File through the existing renderer drop path; this does not
  // claim Explorer drag or OS file-association coverage.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file"; input.dataset.viewportFixture = "true"; document.body.append(input);
  });
  await page.locator("input[data-viewport-fixture]").setInputFiles(path);
  await page.evaluate(() => {
    const input = document.querySelector("input[data-viewport-fixture]");
    const transfer = new DataTransfer(); transfer.items.add(input.files[0]);
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
    input.remove();
  });
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(before + 1);
  await expect.poll(async () => (await product.snapshot()).activeDocument.path).toBe(path);
  return (await product.snapshot()).activeTabId;
}

async function activate(product, page, id) {
  await tab(page, id).click();
  await expect.poll(async () => (await product.snapshot()).activeTabId).toBe(id);
}

async function wheel(page, amount) {
  const box = await page.locator(".cm-scroller").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await page.locator(".cm-scroller").evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, amount);
  await expect.poll(() => page.locator(".cm-scroller").evaluate(element => element.scrollTop)).not.toBe(before);
}

async function record(product, page, label, settle = true) {
  const samples = [];
  for (let index = 0; index < (settle ? 6 : 1); index++) samples.push(await page.evaluate(async settle => {
    if (settle) await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const scroller = document.querySelector(".cm-scroller"), bounds = scroller.getBoundingClientRect();
    const rows = [...document.querySelectorAll(".cm-line")].map(line => ({ text: line.textContent,
      y: line.getBoundingClientRect().top - bounds.top, height: line.getBoundingClientRect().height }));
    const images = [...document.querySelectorAll(".cm-markdown-image-preview img")].map(image => ({
      complete: image.complete, naturalHeight: image.naturalHeight, height: image.getBoundingClientRect().height,
      y: image.getBoundingClientRect().top - bounds.top, bottom: image.getBoundingClientRect().bottom - bounds.top
    }));
    const tables = [...document.querySelectorAll(".cm-table-widget-table")].map(table => ({
      width: table.getBoundingClientRect().width, height: table.getBoundingClientRect().height,
      y: table.getBoundingClientRect().top - bounds.top, bottom: table.getBoundingClientRect().bottom - bounds.top
    }));
    return { scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight,
      firstVisible: rows.find(row => row.height > 0 && row.y + row.height > 0 && row.y < bounds.height && /^[AB]-row-/.test(row.text)) ?? null,
      images, tables };
  }, settle));
  const snapshot = await product.snapshot();
  await writeFile(product.testInfo.outputPath(`${label}-viewport.json`), JSON.stringify({ samples,
    canonical: { activeTabId: snapshot.activeTabId, content: snapshot.activeDocument.content, isDirty: snapshot.activeDocument.isDirty } }, null, 2));
  return samples.at(-1);
}

function sameAnchor(actual, expected) {
  expect(actual.firstVisible?.text).toBe(expected.firstVisible?.text);
  expect(actual.firstVisible).not.toBeNull();
  expect(Math.abs(actual.firstVisible.y - expected.firstVisible.y)).toBeLessThanOrEqual(1);
}

async function unchanged(product, source, path = product.documentPath) {
  const snapshot = await product.snapshot();
  expect(snapshot.activeDocument.content).toBe(source);
  expect(snapshot.activeDocument.isDirty).toBe(false);
  expect(await readFile(path, "utf8")).toBe(source);
}

async function insertionCanary(product, page, source, offset, marker) {
  await product.focus(page);
  await product.nativeInsert(marker, page);
  await expect.poll(async () => (await product.snapshot()).activeDocument.content)
    .toBe(source.slice(0, offset) + marker + source.slice(offset));
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
  await expect.poll(async () => (await product.snapshot()).activeDocument.isDirty).toBe(false);
}

test("long A to empty B restores reading position without revealing its offscreen caret", async ({ product }) => {
  const source = documentText("A"), { page, first } = await start(product, source);
  await wheel(page, 8000);
  const before = await record(product, page, "A-before-empty");
  expect(before.scrollTop).toBeGreaterThan(5000);
  await product.checkpoint("A-before-empty");
  const second = await newTab(product);
  expect(second).not.toBe(first);
  await activate(product, page, first);
  sameAnchor(await record(product, page, "A-after-empty"), before);
  await unchanged(product, source);
  await product.checkpoint("A-returned-with-caret-offscreen");
  // Canonical insertion proves the exact source caret; virtualized DOM text is
  // deliberately not used as a global offset oracle.
  await insertionCanary(product, page, source, 0, "CARET-A");
  await unchanged(product, source);
  await product.normalClose();
});

test("two long tabs keep independent positions through rapid switches source mode and close", async ({ product }) => {
  const sourceA = documentText("A"), sourceB = documentText("B");
  const { page, first } = await start(product, sourceA);
  await wheel(page, 8000);
  const a = await record(product, page, "A-independent");
  const otherPath = join(product.directory, "documents", "long-b.md");
  await writeFile(otherPath, sourceB, "utf8");
  const second = await openFile(product, page, otherPath);
  await product.focus(page); await page.keyboard.press("Control+Home");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await wheel(page, 4000);
  const b = await record(product, page, "B-independent");
  expect(b.firstVisible?.text).not.toBe(a.firstVisible?.text);
  for (let i = 0; i < 8; i++) {
    // No geometry wait between switches. A separate controller regression
    // covers an immediate recapture before any animation frame.
    await activate(product, page, first);
    await record(product, page, `rapid-${i}-A`, false);
    await activate(product, page, second);
    await record(product, page, `rapid-${i}-B`, false);
  }
  sameAnchor(await record(product, page, "B-after-rapid"), b);
  await unchanged(product, sourceB, otherPath);
  await activate(product, page, first);
  sameAnchor(await record(product, page, "A-after-rapid"), a);
  await unchanged(product, sourceA);
  await page.getByRole("button", { name: "Switch to source mode", exact: true }).click();
  const aSource = await record(product, page, "A-source-mode");
  await activate(product, page, second);
  const bSource = await record(product, page, "B-source-mode");
  await activate(product, page, first);
  sameAnchor(await record(product, page, "A-source-return"), aSource);
  await unchanged(product, sourceA);
  await insertionCanary(product, page, sourceA, 0, "SOURCE-A");
  await activate(product, page, second);
  sameAnchor(await record(product, page, "B-source-return"), bSource);
  await unchanged(product, sourceB, otherPath);
  await page.getByRole("button", { name: "Switch to WYSIWYM mode", exact: true }).click();
  await insertionCanary(product, page, sourceB, 5, "CARET-B");
  await unchanged(product, sourceB, otherPath);
  await tab(page, second).locator("..").locator('[data-fishmark-region="workspace-tab-close"]').click();
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(1);
  const reopened = await openFile(product, page, otherPath);
  expect(reopened).not.toBe(second);
  const fresh = await record(product, page, "B-reopened-fresh");
  expect(fresh.firstVisible?.text).toBe(paragraph("B", 0));
  await unchanged(product, sourceB, otherPath);
  await product.checkpoint("independent-source-close-reopen");
  await product.normalClose();
});

test("late image decoding after tab restoration respects the reader's new scroll position", async ({ product }) => {
  const pending = new Set();
  let released = false, requests = 0;
  const png = new PNG({ width: 320, height: 900 }); png.data.fill(190);
  const image = PNG.sync.write(png);
  const server = createServer((_request, response) => {
    requests++;
    const send = () => { response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" }); response.end(image); };
    if (released) send(); else { pending.add(send); response.on("close", () => pending.delete(send)); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  try {
    const table = ["| First | Second |", "| --- | --- |", ...Array.from({ length: 3 }, (_, i) => `| cell ${i} | 中文内容 ${"wrapped prose ".repeat(5)} |`)].join("\n");
    const source = [...Array.from({ length: 20 }, (_, i) => paragraph("A", i)),
      table, `![deferred](http://127.0.0.1:${server.address().port}/pending.png)`,
      ...Array.from({ length: 580 }, (_, i) => paragraph("A", i + 20))].join("\n\n");
    const { page, first } = await start(product, source);
    await wheel(page, 1400);
    await record(product, page, "layout-image-request-start");
    await expect.poll(() => requests).toBeGreaterThan(0);
    const before = await record(product, page, "layout-before-switch");
    expect(before.firstVisible).not.toBeNull();
    expect(Number(before.firstVisible.text.slice(6, 10))).toBeGreaterThanOrEqual(20);
    expect(before.images.some(image => !image.complete && image.bottom <= before.firstVisible.y)).toBe(true);
    expect(before.tables.some(table => table.height > 0 && table.bottom <= before.firstVisible.y)).toBe(true);
    await newTab(product);
    await activate(product, page, first);
    const returned = await record(product, page, "layout-return-before-image");
    sameAnchor(returned, before);
    expect(returned.images.some(image => !image.complete && image.bottom <= returned.firstVisible.y)).toBe(true);
    expect(returned.tables.some(table => table.height > 0 && Math.abs(table.height - before.tables[0].height) <= 1)).toBe(true);
    // A fresh reader action must win over any delayed restoration. Move the
    // pending image fully above the viewport while it remains mounted.
    await wheel(page, 80);
    const intended = await record(product, page, "layout-new-reader-position");
    expect(intended.images.some(image => !image.complete && image.bottom < 0)).toBe(true);
    released = true; for (const send of pending) send(); pending.clear();
    await expect.poll(() => page.locator('.cm-markdown-image-preview img').evaluateAll(images => images.some(image => image.complete && image.naturalHeight === 900))).toBe(true);
    const after = await record(product, page, "layout-after-image");
    sameAnchor(after, intended);
    expect(after.images.some(image => image.naturalHeight === 900 && image.height > 0)).toBe(true);
    expect(Math.max(...after.images.map(image => image.height))).toBeGreaterThan(Math.max(...returned.images.map(image => image.height)) + 100);
    await unchanged(product, source);
    await newTab(product); await activate(product, page, first);
    sameAnchor(await record(product, page, "layout-return-decoded"), after);
    await unchanged(product, source);
    await product.checkpoint("late-image-and-table-return");
    await product.normalClose();
  } finally {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
  }
});

test("a minimum-width window remounts a wrapping table without losing its reading position", async ({ product }) => {
  const tableSource = ["| First | Second |", "| --- | --- |", ...Array.from({ length: 3 }, (_, i) =>
    `| cell ${i} | 中文长单元格 ${"wrapped prose ".repeat(8)} |`)].join("\n");
  const source = [...Array.from({ length: 20 }, (_, i) => paragraph("A", i)), tableSource,
    ...Array.from({ length: 580 }, (_, i) => paragraph("A", i + 20))].join("\n\n");
  const { page, first } = await start(product, source);
  const owner = await product.current.app.browserWindow(page);
  const native = await owner.evaluate(window => {
    const minimumSize = window.getMinimumSize();
    window.setSize(minimumSize[0], 800);
    return { minimumSize, bounds: window.getBounds(), contentSize: window.getContentSize() };
  });
  await owner.dispose();
  await writeFile(product.testInfo.outputPath("narrow-native-window.json"), JSON.stringify(native, null, 2));
  expect(native.bounds.width).toBe(native.minimumSize[0]);
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(native.contentSize[0]);
  await record(product, page, "narrow-window-ready");
  const table = page.locator(".cm-table-widget-table");
  // A single large wheel can skip a virtualized widget while the new window
  // width is being measured. Walk to its actual mount before positioning it.
  for (let step = 0; step < 24 && !(await table.isVisible()); step++) await wheel(page, 250);
  await expect(table).toBeVisible();
  const tableBox = await table.boundingBox(), scroller = await page.locator(".cm-scroller").boundingBox();
  await wheel(page, tableBox.y + tableBox.height - scroller.y - 100);
  const before = await record(product, page, "narrow-table-before");
  expect(before.firstVisible?.text).toBe(paragraph("A", 20));
  expect(before.tables[0].width).toBeLessThan(700);
  expect(before.tables[0].height).toBeGreaterThan(300);
  expect(before.tables[0].bottom).toBeGreaterThan(0);
  expect(before.tables[0].bottom).toBeLessThan(before.firstVisible.y);
  await newTab(product); await activate(product, page, first);
  const after = await record(product, page, "narrow-table-returned");
  sameAnchor(after, before);
  expect(after.tables).toHaveLength(1);
  expect(Math.abs(after.tables[0].width - before.tables[0].width)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.tables[0].height - before.tables[0].height)).toBeLessThanOrEqual(1);
  await unchanged(product, source);
  await product.checkpoint("narrow-table-remounted");
  await product.normalClose();
});
