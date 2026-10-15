import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./product-fixture.mjs";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="16"><rect width="20" height="16" fill="#228866"/></svg>';
const longText = "0123456789 transfer\n\n![Owned](./owned.svg)\n\n" + Array.from({ length: 600 }, (_, i) => `A-row-${String(i).padStart(4, "0")} ${"正文阅读位置 ".repeat(10)}`).join("\n\n");
const tab = (page, id) => page.locator(`[data-fishmark-region="workspace-tab"][data-tab-id="${id}"]`);
const assetUrl = path => `fishmark-asset://preview/${path.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/")}`;
const resource = (page, path) => page.evaluate(async url => { const response = await fetch(url); return response.status; }, assetUrl(path));
const fileMenu = (product, label) => product.current.app.evaluate(({ Menu }, label) => Menu.getApplicationMenu().items.find(i => i.label === "File").submenu.items.find(i => i.label === label).click(), label);

async function exitReading(page) {
  const button = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await button.isVisible()) await button.click();
}

async function openFile(page, path) {
  await page.evaluate(() => { const input = document.createElement("input"); input.type = "file"; input.dataset.mergeFixture = "true"; document.body.append(input); });
  await page.locator("input[data-merge-fixture]").setInputFiles(path);
  await page.evaluate(() => {
    const input = document.querySelector("input[data-merge-fixture]");
    const transfer = new DataTransfer(); transfer.items.add(input.files[0]);
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true })); input.remove();
  });
}

async function twoWindows(product, content = "0123456789 transfer", zoom = 1, layoutWidth) {
  await product.seed(content, 60_000);
  const imagePath = join(dirname(product.documentPath), "owned.svg");
  await writeFile(imagePath, svg);
  const source = await product.launch(content); await exitReading(source);
  const sourceId = (await product.snapshot(source)).activeTabId;
  await fileMenu(product, "New Window");
  await expect.poll(() => product.current.app.windows().length).toBe(2);
  const target = product.current.app.windows().find(page => page !== source);
  await expect(target.locator(".empty-copy")).toBeVisible();
  const targetPath = join(product.directory, "target-documents", "target.md");
  await mkdir(dirname(targetPath), { recursive: true }); await writeFile(targetPath, "target original");
  await openFile(target, targetPath);
  await product.observeNewWindow(target, "target original"); await exitReading(target);
  const targetId = (await product.snapshot(target)).activeTabId;
  const area = await product.current.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  expect(area.width).toBeGreaterThanOrEqual(960);
  if (layoutWidth !== undefined) { expect(layoutWidth).toBeLessThanOrEqual(area.width); area.width = layoutWidth; }
  const left = await product.current.app.browserWindow(source), right = await product.current.app.browserWindow(target);
  await left.evaluate((w, a) => w.setBounds({ x: a.x + (a.width < 1800 ? a.width - 900 : 0), y: a.y, width: 900, height: 700 }), area);
  await right.evaluate((w, { a, zoom }) => { w.setBounds({ x: a.x + (a.width < 1800 ? 0 : a.width - 900), y: a.y, width: 900, height: 700 }); w.webContents.setZoomFactor(zoom); w.show(); }, { a: area, zoom });
  await left.dispose(); await right.dispose();
  await expect.poll(() => target.evaluate(() => window.devicePixelRatio)).toBe(zoom);
  return { source, target, sourceId, targetId, targetPath, imagePath, area };
}

async function wheel(page, amount) {
  const box = await page.locator(".cm-scroller").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await page.locator(".cm-scroller").evaluate(e => e.scrollTop);
  await page.mouse.wheel(0, amount);
  await expect.poll(() => page.locator(".cm-scroller").evaluate(e => e.scrollTop)).not.toBe(before);
}

async function position(page) {
  return page.evaluate(async () => {
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    const scroller = document.querySelector(".cm-scroller"), bounds = scroller.getBoundingClientRect();
    const rows = [...document.querySelectorAll(".cm-line")].map(line => ({ text: line.textContent, y: line.getBoundingClientRect().top - bounds.top, height: line.getBoundingClientRect().height }));
    return { scrollTop: scroller.scrollTop, first: rows.find(row => row.height > 0 && row.y + row.height > 0 && row.y < bounds.height && /^A-row-/.test(row.text)) ?? null };
  });
}

async function samePosition(page, expected) {
  for (let i = 0; i < 6; i++) {
    const actual = await position(page);
    expect(actual.first).not.toBeNull(); expect(actual.first.text).toBe(expected.first.text);
    expect(Math.abs(actual.first.y - expected.first.y)).toBeLessThanOrEqual(1);
  }
}

async function caret(product, page, offset = 7) {
  await product.focus(page); await page.keyboard.press("Control+Home");
  for (let i = 0; i < offset; i++) await page.keyboard.press("ArrowRight");
}

async function drag(product, source, target, tabId, options = {}) {
  const from = await product.current.app.browserWindow(source), to = await product.current.app.browserWindow(target);
  // A narrow desktop leaves the receiver's left edge exposed. On a return
  // drag swap only the two owned window positions so the native release still
  // leaves the source rectangle, as required by the input helper.
  const sourceBounds = await from.evaluate(w => w.getBounds()), targetBounds = await to.evaluate(w => w.getBounds());
  if (sourceBounds.x < targetBounds.x && sourceBounds.x + sourceBounds.width > targetBounds.x) {
    await from.evaluate((w, x) => w.setBounds({ x }), targetBounds.x);
    await to.evaluate((w, x) => w.setBounds({ x }), sourceBounds.x);
  }
  const a = await from.evaluate(w => { w.setAlwaysOnTop(true); w.show(); w.focus(); return { hwnd: w.getNativeWindowHandle().readBigUInt64LE().toString(), content: w.getContentBounds(), zoom: w.webContents.getZoomFactor() }; });
  const b = await to.evaluate(w => { w.setAlwaysOnTop(true); w.show(); w.moveTop(); return { hwnd: w.getNativeWindowHandle().readBigUInt64LE().toString(), content: w.getContentBounds(), zoom: w.webContents.getZoomFactor() }; });
  if (options.coverId) await product.current.app.evaluate(({ BrowserWindow }, id) => { const cover = BrowserWindow.fromId(id); cover.setAlwaysOnTop(true); cover.show(); cover.moveTop(); }, options.coverId);
  await from.evaluate(w => { w.moveTop(); w.focus(); });
  await from.dispose(); await to.dispose();
  const startBox = await tab(source, tabId).boundingBox();
  const endBox = await target.locator('[data-fishmark-region="workspace-tab-strip"]').boundingBox();
  expect(startBox).not.toBeNull(); expect(endBox).not.toBeNull();
  const start = { x: Math.round(a.content.x + (startBox.x + startBox.width / 2) * a.zoom), y: Math.round(a.content.y + (startBox.y + startBox.height / 2) * a.zoom) };
  const end = { x: Math.round(b.content.x + (b.content.x < a.content.x ? endBox.x + 12 : endBox.x + endBox.width - 30) * b.zoom), y: Math.round(b.content.y + (options.body ? 200 : endBox.y + endBox.height / 2) * b.zoom) };
  const proof = await new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", fileURLToPath(new URL("./windows-pointer-drag.ps1", import.meta.url)), "-WindowHandle", a.hwnd, "-OwnerPid", String(product.current.mainPid), "-StartX", String(start.x), "-StartY", String(start.y), "-EndX", String(end.x), "-EndY", String(end.y), "-EndWindowHandle", options.endHwnd ?? b.hwnd, "-ReleaseDelayMs", "200"], { windowsHide: true, timeout: 15_000 }, (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stdout}\n${stderr}`)) : resolve(JSON.parse(stdout))));
  product.crossWindowProof ??= { scope: "real owned Windows pointer drag; production IPC/preload and isolated profiles" };
  (product.crossWindowProof.gestures ??= []).push({ a, b, start, end, proof, options });
}

if (process.platform === "win32") {
  for (const inactive of [false, true]) test(`native join preserves dirty documents reading anchor caret and resource authority (inactive=${inactive})`, async ({ product }) => {
    const f = await twoWindows(product, longText);
    await expect.poll(() => f.source.locator('img[alt="Owned"]').evaluate(image => image.naturalWidth)).toBe(20);
    expect(await resource(f.source, f.imagePath)).toBe(200); expect(await resource(f.target, f.imagePath)).toBe(403);
    await caret(product, f.source); await product.nativeInsert("DIRTY-A", f.source);
    const dirty = longText.slice(0, 7) + "DIRTY-A" + longText.slice(7);
    await expect.poll(async () => (await product.snapshot(f.source)).activeDocument?.content).toBe(dirty);
    // Opening the same native-backed file in the target activates its one
    // canonical owner; it cannot create a duplicate or overwrite either draft.
    await openFile(f.target, product.documentPath);
    await expect.poll(async () => (await product.snapshot(f.source)).activeDocument?.content).toBe(dirty);
    expect((await product.snapshot(f.target)).tabs.map(tab => tab.tabId)).toEqual([f.targetId]);
    await caret(product, f.source); await wheel(f.source, 5000);
    const before = await position(f.source); expect(before.first).not.toBeNull(); expect(before.scrollTop).toBeGreaterThan(4000);
    await product.focus(f.target); await product.nativeInsert("DIRTY-B", f.target);
    const bDirty = "DIRTY-Btarget original";
    await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe(bDirty);
    let extraId = null;
    if (inactive) {
      const owner = await product.current.app.browserWindow(f.source); await owner.evaluate(w => w.focus()); await owner.dispose();
      await expect.poll(() => product.current.app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id)).toBe(Number((await product.snapshot(f.source)).windowId));
      await fileMenu(product, "New"); await expect.poll(async () => (await product.snapshot(f.source)).tabs.length).toBe(2);
      extraId = (await product.snapshot(f.source)).activeTabId; expect(extraId).not.toBe(f.sourceId);
    }
    await drag(product, f.source, f.target, f.sourceId);
    await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe(dirty);
    await expect(f.target.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
    expect(product.current.app.windows()).toHaveLength(2);
    expect((await product.snapshot(f.source)).tabs.map(tab => tab.tabId)).toEqual(inactive ? [extraId] : []);
    await samePosition(f.target, before);
    const handoff = (await product.snapshot(f.target)).editorViewHandoff;
    expect(handoff.selection).toEqual({ anchor: 7, head: 7 }); expect(handoff.readingPosition).toBeDefined();
    expect(await resource(f.target, f.imagePath)).toBe(200); expect(await resource(f.source, f.imagePath)).toBe(403);
    await wheel(f.target, 80); const fresh = await position(f.target); await samePosition(f.target, fresh);
    await product.focus(f.target); await product.nativeInsert("X", f.target);
    await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe(dirty.slice(0, 7) + "X" + dirty.slice(7));
    await f.target.keyboard.press("Control+z"); await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe(dirty);
    if (!inactive) {
      await caret(product, f.target); await wheel(f.target, 5000); const back = await position(f.target);
      await drag(product, f.target, f.source, f.sourceId);
      await expect.poll(async () => (await product.snapshot(f.source)).activeDocument?.content).toBe(dirty);
      await expect(f.source.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
      await samePosition(f.source, back);
      expect(await resource(f.source, f.imagePath)).toBe(200); expect(await resource(f.target, f.imagePath)).toBe(403);
      await product.manualSave(f.source); await product.expectSaved(dirty, f.source);
    } else { await product.manualSave(f.target); await product.expectSaved(dirty, f.target); }
    await tab(f.target, f.targetId).click();
    await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe(bDirty);
    await product.manualSave(f.target); await expect.poll(() => readFile(f.targetPath, "utf8")).toBe(bDirty);
    product.crossWindowProof.beforeReading = before;
    product.crossWindowProof.final = { source: await product.snapshot(f.source), target: await product.snapshot(f.target) };
    await product.checkpoint(`merge-${inactive ? "inactive" : "roundtrip"}`, f.target);
    await product.normalClose();
  });

  for (const failure of ["target-close", "receipt-timeout", "target-body"]) test(`native ${failure} cancels without third window and source stays editable`, async ({ product }) => {
    const content = "0123456789 transfer", f = await twoWindows(product, content);
    await caret(product, f.source);
    const owner = await product.current.app.browserWindow(f.target), sourceOwner = await product.current.app.browserWindow(f.source);
    const targetContents = await owner.evaluate(w => w.webContents.id), sourceContents = await sourceOwner.evaluate(w => w.webContents.id);
    await owner.dispose(); await sourceOwner.dispose();
    let held = false;
    if (failure !== "target-body") await product.current.app.evaluate((_electron, input) => globalThis.__rf902Control.arm(input), { kind: "tab-receipt", webContentsId: targetContents });
    try {
      await drag(product, f.source, f.target, f.sourceId, { body: failure === "target-body" });
      if (failure !== "target-body") {
        await expect.poll(() => product.current.app.evaluate(() => globalThis.__rf902Control.read()?.phase)).toBe("held"); held = true;
        await expect(f.source.locator(".cm-content")).toHaveAttribute("contenteditable", "false");
        expect((await product.snapshot(f.source)).activeDocument.content).toBe(content);
        expect((await product.snapshot(f.target)).tabs.map(tab => tab.tabId)).toEqual([f.targetId]);
        if (failure === "target-close") {
          const window = await product.current.app.browserWindow(f.target); await window.evaluate(w => w.close()); await window.dispose();
          await expect.poll(() => product.current.app.windows().length).toBe(1);
        }
      }
      const message = failure === "target-body" ? "Error: The target declined the tab transfer." : "Error: The target did not receive the tab before the transfer was cancelled.";
      product.expectedIpcFailures = [{ event: "move:error", channel: "fishmark:move-workspace-tab-to-window", webContentsId: sourceContents, tabId: f.sourceId, message }];
      await expect.poll(async () => (await product.mainEvidence()).filter(event => event.event === "move:error").length, { timeout: 20_000 }).toBe(1);
      await expect(f.source.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
      expect((await product.snapshot(f.source)).activeDocument.content).toBe(content);
      expect(product.current.app.windows()).toHaveLength(failure === "target-close" ? 1 : 2);
      if (held && failure !== "target-close") { await product.current.app.evaluate(() => globalThis.__rf902Control.release()); held = false; }
      await product.focus(f.source); await product.nativeInsert("X", f.source);
      const canary = content.slice(0, 7) + "X" + content.slice(7);
      await expect.poll(async () => (await product.snapshot(f.source)).activeDocument?.content).toBe(canary);
      await product.manualSave(f.source); await product.expectSaved(canary, f.source);
      if (failure !== "target-close") {
        await expect(f.target.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
        await drag(product, f.source, f.target, f.sourceId);
        await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe(canary);
        await expect(f.target.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
        expect((await product.snapshot(f.target)).tabs.filter(tab => tab.tabId === f.sourceId)).toHaveLength(1);
        expect(product.current.app.windows()).toHaveLength(2);
      }
      product.crossWindowProof.failure = failure;
      await product.checkpoint(`${failure}-recovered`, failure === "target-close" ? f.source : f.target);
      await product.normalClose(); held = false; // Closed receiver cannot deliver its intentionally held ACK.
    } finally { if (held && product.current.child.exitCode === null) await product.current.app.evaluate(() => globalThis.__rf902Control.release()); }
  });

  test("native join hit-testing respects receiver zoom", async ({ product }) => {
    const f = await twoWindows(product, "0123456789 zoom", 1.25, 960);
    await caret(product, f.source); await drag(product, f.source, f.target, f.sourceId);
    await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe("0123456789 zoom");
    await expect(f.target.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
    expect(product.current.app.windows()).toHaveLength(2);
    await product.focus(f.target); await product.nativeInsert("X", f.target);
    await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe("0123456X789 zoom");
    await product.manualSave(f.target); await product.expectSaved("0123456X789 zoom", f.target);
    await product.normalClose();
  });

  test("native join drains pending source edit acknowledgments before ownership moves", async ({ product }) => {
    const content = "0123456789 transfer", f = await twoWindows(product, content);
    await caret(product, f.source);
    const owner = await product.current.app.browserWindow(f.source);
    const webContentsId = await owner.evaluate(w => w.webContents.id); await owner.dispose();
    await product.current.app.evaluate((_electron, input) => globalThis.__rf902Control.arm(input), { kind: "edit-ack", webContentsId, tabId: f.sourceId, clientSequence: 1 });
    let held = false;
    try {
      await product.nativeInsert("A", f.source);
      await expect.poll(() => product.current.app.evaluate(() => globalThis.__rf902Control.read()?.phase)).toBe("held"); held = true;
      await product.nativeInsert("B", f.source);
      await drag(product, f.source, f.target, f.sourceId);
      await expect(f.source.locator(".cm-content")).toHaveAttribute("contenteditable", "false");
      expect((await product.mainEvidence()).filter(event => event.event === "move:start")).toEqual([]);
      expect((await product.snapshot(f.target)).tabs.map(tab => tab.tabId)).toEqual([f.targetId]);
      await product.current.app.evaluate(() => globalThis.__rf902Control.release()); held = false;
      const moved = "0123456AB789 transfer";
      await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe(moved);
      await expect(f.target.locator(".cm-content")).toHaveAttribute("contenteditable", "true");
      await product.focus(f.target); await product.nativeInsert("X", f.target);
      const canary = "0123456ABX789 transfer";
      await expect.poll(async () => (await product.snapshot(f.target)).activeDocument?.content).toBe(canary);
      const events = await product.mainEvidence();
      const ack = events.findIndex(event => event.event === "edit:end" && event.detail.clientSequence === 2);
      const move = events.findIndex(event => event.event === "move:start");
      expect(ack).toBeGreaterThan(0); expect(move).toBeGreaterThan(ack);
      product.crossWindowProof.pendingAckEvents = events.filter(event => /^(edit|flush|move|receipt|barrier):/.test(event.event));
      await product.manualSave(f.target); await product.expectSaved(canary, f.target);
      await product.normalClose();
    } finally { if (held && product.current.child.exitCode === null) await product.current.app.evaluate(() => globalThis.__rf902Control.release()); }
  });

  test("native release over an owned occluding titlebar cannot join the covered strip or create a fourth window", async ({ product }) => {
    const content = "0123456789 transfer", f = await twoWindows(product, content);
    await fileMenu(product, "New Window");
    await expect.poll(() => product.current.app.windows().length).toBe(3);
    const coverPage = product.current.app.windows().find(page => page !== f.source && page !== f.target);
    await expect(coverPage.locator(".empty-copy")).toBeVisible();
    const coverWindow = await product.current.app.browserWindow(coverPage);
    const targetWindow = await product.current.app.browserWindow(f.target);
    const targetBounds = await targetWindow.evaluate(w => w.getBounds()); await targetWindow.dispose();
    const cover = await coverWindow.evaluate((w, area) => {
      w.setBounds({ x: area.x, y: area.y + 50, width: 900, height: 600 });
      return { id: w.id, hwnd: w.getNativeWindowHandle().readBigUInt64LE().toString(), content: w.getContentBounds() };
    }, targetBounds);
    await coverWindow.dispose();
    await caret(product, f.source);
    await drag(product, f.source, f.target, f.sourceId, { coverId: cover.id, endHwnd: cover.hwnd });
    expect(product.crossWindowProof.gestures[0].end.y).toBeLessThan(cover.content.y);
    for (let i = 0; i < 6; i++) {
      expect(product.current.app.windows()).toHaveLength(3);
      expect((await product.snapshot(f.source)).activeDocument?.content).toBe(content);
      expect((await product.snapshot(f.target)).tabs.map(tab => tab.tabId)).toEqual([f.targetId]);
      await f.source.waitForTimeout(50);
    }
    expect((await product.mainEvidence()).filter(event => event.event === "move:start" || event.event === "detach:start")).toEqual([]);
    await product.focus(f.source); await product.nativeInsert("X", f.source);
    await expect.poll(async () => (await product.snapshot(f.source)).activeDocument?.content).toBe("0123456X789 transfer");
    await product.manualSave(f.source); await product.expectSaved("0123456X789 transfer", f.source);
    await product.normalClose();
  });
}
