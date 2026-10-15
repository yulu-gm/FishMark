import { test, expect } from "./product-fixture.mjs";
import { nativePointer } from "./native-pointer.mjs";

const content = "0123456789 alpha beta gamma";
const caret = 7;

test("real tab clicks and same-window reorder preserve both documents", async ({ product }) => {
  const before = await prepare(product);
  await product.current.app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu().items.find((entry) => entry.label === "File").submenu.items.find((entry) => entry.label === "New");
    item.click();
  });
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(2);
  const created = await product.snapshot();
  expect(created.activeTabId).not.toBe(before.snapshot.activeTabId);
  const originalTab = before.page.locator(`[data-fishmark-region="workspace-tab"][data-tab-id="${before.snapshot.activeTabId}"]`);
  const newTab = before.page.locator(`[data-fishmark-region="workspace-tab"][data-tab-id="${created.activeTabId}"]`);
  await originalTab.click();
  await expect.poll(async () => (await product.snapshot()).activeTabId).toBe(before.snapshot.activeTabId);
  expect((await product.snapshot()).activeDocument.content).toBe(content);
  const start = await originalTab.boundingBox(), end = await newTab.boundingBox();
  const started = Date.now();
  await before.page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await before.page.mouse.down();
  try { await before.page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 }); }
  finally { await before.page.mouse.up(); }
  await expect.poll(async () => (await product.snapshot()).tabs.map((tab) => tab.tabId)).toEqual([created.activeTabId, before.snapshot.activeTabId]);
  const events = (await product.rendererEvidence()).events.filter((entry) => entry.epochMs >= started && ["pointerdown", "pointerup", "gotpointercapture"].includes(entry.event));
  expect(events.map((entry) => entry.event)).toEqual(["pointerdown", "gotpointercapture", "pointerup"]);
  expect(events.every((entry) => entry.detail.trusted)).toBe(true);
  expect(product.current.app.windows()).toHaveLength(1);
  await newTab.click();
  await expect.poll(async () => (await product.snapshot()).activeTabId).toBe(created.activeTabId);
  expect((await product.snapshot()).activeDocument.content).toBe("");
  await originalTab.click();
  await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(content);
  product.crossWindowProof = { scope: "real tab click and reorder", before: before.snapshot, created, after: await product.snapshot(), trustedPointerEvents: events };
  await product.checkpoint("tabs-clicked-and-reordered");
  await product.normalClose();
});

async function selection(page) {
  return page.evaluate(() => {
    const editor = document.querySelector(".cm-content");
    const current = document.getSelection();
    const offset = (node, position) => {
      if (!editor || !node || !editor.contains(node)) return null;
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.setEnd(node, position);
      return range.toString().length;
    };
    return { anchor: offset(current?.anchorNode, current?.anchorOffset), head: offset(current?.focusNode, current?.focusOffset), collapsed: current?.isCollapsed ?? false };
  });
}

test("detach drains held real edit ACK and queued native input before transferring selection", async ({ product }) => {
  const before = await prepare(product);
  const owner = await product.current.app.browserWindow(before.page);
  const webContentsId = await owner.evaluate((window) => window.webContents.id);
  await owner.dispose();
  await product.current.app.evaluate((_electron, input) => globalThis.__rf902Control.arm(input), { kind: "edit-ack", webContentsId, tabId: before.snapshot.activeTabId, clientSequence: 1 });
  product.crossWindowProof = { scope: "controlled delay after original edit handler completed; real UI detach and native text insertion", before: before.snapshot };
  let held = false;
  try {
    await product.nativeInsert("A");
    await expect.poll(() => product.current.app.evaluate(() => globalThis.__rf902Control.read()?.phase)).toBe("held");
    held = true;
    await product.nativeInsert("B");
    const expectedContent = content.slice(0, caret) + "AB" + content.slice(caret);
    await expect.poll(() => selection(before.page)).toEqual({ anchor: caret + 2, head: caret + 2, collapsed: true });
    await dragTab(product, before.page, false);
    await expect(before.page.locator('.cm-content')).toHaveAttribute("contenteditable", "false");
    const deadline = Date.now() + 300;
    while (Date.now() < deadline) {
      expect(product.current.app.windows()).toHaveLength(1);
      const events = await product.mainEvidence();
      expect(events.filter((entry) => entry.event === "detach:start")).toEqual([]);
      expect(events.filter((entry) => entry.event === "edit:start")).toHaveLength(1);
      await before.page.waitForTimeout(25);
    }
    product.crossWindowProof.held = { barrier: await product.current.app.evaluate(() => globalThis.__rf902Control.read()), canonical: await product.snapshot(), rendererSelection: await selection(before.page), events: await product.mainEvidence() };
    expect(product.crossWindowProof.held.canonical.activeDocument.content).toBe(content.slice(0, caret) + "A" + content.slice(caret));
    await product.current.app.evaluate(() => globalThis.__rf902Control.release());
    held = false;
    await expect.poll(() => product.current.app.windows().length).toBe(2);
    const target = product.current.app.windows().find((page) => page !== before.page);
    await product.observeNewWindow(target, expectedContent);
    await product.focus(target);
    expect(await selection(target)).toEqual({ anchor: caret + 2, head: caret + 2, collapsed: true });
    expect((await product.snapshot(before.page)).tabs.some((tab) => tab.tabId === before.snapshot.activeTabId)).toBe(false);
    const events = await product.mainEvidence();
    const order = events.filter((entry) => ["barrier:released", "edit:end", "flush:end", "detach:start"].includes(entry.event)).map((entry) => ({ event: entry.event, sequence: entry.detail.clientSequence }));
    const detachIndex = events.findIndex((entry) => entry.event === "detach:start");
    const releaseIndex = events.findIndex((entry) => entry.event === "barrier:released" && entry.detail.kind === "edit-ack");
    const finalEditIndex = events.findIndex((entry) => entry.event === "edit:end" && entry.detail.clientSequence === 2);
    const flushIndex = events.findIndex((entry) => entry.event === "flush:end" && entry.detail.acknowledgedSequence === 2);
    expect(releaseIndex).toBeGreaterThan(0); expect(finalEditIndex).toBeGreaterThan(releaseIndex); expect(flushIndex).toBeGreaterThan(finalEditIndex); expect(detachIndex).toBeGreaterThan(flushIndex);
    await product.nativeInsert("X", target);
    const canary = content.slice(0, caret) + "ABX" + content.slice(caret);
    await expect.poll(async () => (await product.snapshot(target)).activeDocument?.content).toBe(canary);
    product.crossWindowProof.after = { snapshot: await product.snapshot(target), selection: await selection(target), order };
    await product.checkpoint("pending-ack-detached-canary", target);
    await product.manualSave(target); await product.expectSaved(canary, target);
    await product.normalClose();
  } finally {
    if (held) await product.current.app.evaluate(() => globalThis.__rf902Control.release());
  }
});

async function boundedInput(label, action) {
  let timer;
  try {
    return await Promise.race([action(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Browser input timed out: ${label}; native drag may require parent OS Escape cleanup.`)), 5000); })]);
  } finally { clearTimeout(timer); }
}

for (const failure of ["target-close", "readiness-timeout"]) test(`${failure} retains source document caret and editability after real detach`, async ({ product }) => {
  const before = await prepare(product);
  const source = await product.current.app.browserWindow(before.page);
  const sourceWebContentsId = await source.evaluate((window) => window.webContents.id);
  await source.dispose();
  await product.current.app.evaluate((_electron, input) => globalThis.__rf902Control.arm(input), { kind: "target-ready", sourceWebContentsId });
  product.crossWindowProof = { scope: "controlled hold before new target first original snapshot handler; real detach; unchanged readiness timeout", failure, before: before.snapshot };
  let held = false;
  try {
    await dragTab(product, before.page, false);
    await expect.poll(() => product.current.app.evaluate(() => globalThis.__rf902Control.read()?.phase)).toBe("held");
    held = true;
    const target = product.current.app.windows().find((page) => page !== before.page);
    expect(target).toBeDefined();
    const targetOwner = await product.current.app.browserWindow(target);
    const targetIdentity = await targetOwner.evaluate((window) => ({ windowId: String(window.id), webContentsId: window.webContents.id }));
    await targetOwner.dispose();
    product.expectedIpcFailures = [
      { event: "detach:error", channel: "fishmark:detach-workspace-tab-to-new-window", webContentsId: sourceWebContentsId, tabId: before.snapshot.activeTabId, message: `Error: Detached workspace window '${targetIdentity.windowId}' ${failure === "target-close" ? "closed before it became ready." : "did not become ready before the timeout."}` },
      ...[{ event: "watch:error", channel: "fishmark:sync-watched-markdown-file" }, { event: "snapshot:error", channel: "fishmark:get-workspace-snapshot" }].map((entry) => ({ ...entry, webContentsId: targetIdentity.webContentsId, message: "TypeError: Object has been destroyed" }))
    ];
    product.crossWindowProof.held = { barrier: await product.current.app.evaluate(() => globalThis.__rf902Control.read()), source: await product.snapshot(), selection: await selection(before.page) };
    expect(product.crossWindowProof.held.barrier.detail.webContentsId).toBe(targetIdentity.webContentsId);
    const heldEvents = (await product.mainEvidence()).filter((entry) => ["barrier:held", "barrier:joined"].includes(entry.event));
    expect(heldEvents.map((entry) => entry.detail.channel).sort()).toEqual(["fishmark:get-workspace-snapshot", "fishmark:sync-watched-markdown-file"]);
    expect(heldEvents.every((entry) => entry.detail.webContentsId === targetIdentity.webContentsId)).toBe(true);
    expect(product.crossWindowProof.held.source.activeDocument).toEqual(before.snapshot.activeDocument);
    await expect(before.page.locator('.cm-content')).toHaveAttribute("contenteditable", "false");
    if (failure === "target-close") {
      const window = await product.current.app.browserWindow(target);
      await window.evaluate((owned) => owned.close());
      await window.dispose();
    }
    await expect.poll(async () => (await product.mainEvidence()).filter((entry) => entry.event === "detach:error").length, { timeout: 20_000 }).toBe(1);
    if (failure === "readiness-timeout") {
      const events = await product.mainEvidence();
      expect(events.find((entry) => entry.event === "detach:error").epochMs - events.find((entry) => entry.event === "detach:start").epochMs).toBeGreaterThanOrEqual(15_000);
    }
    await expect.poll(() => product.current.app.windows().length).toBe(1);
    await expect(before.page.locator('.cm-content')).toHaveAttribute("contenteditable", "true");
    await product.current.app.evaluate(() => globalThis.__rf902Control.release());
    held = false;
    await product.focus(before.page);
    expect((await product.snapshot()).activeDocument).toEqual(before.snapshot.activeDocument);
    expect(await selection(before.page)).toEqual(before.selection);
    await product.nativeInsert("X");
    const canary = content.slice(0, caret) + "X" + content.slice(caret);
    await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(canary);
    product.crossWindowProof.after = { snapshot: await product.snapshot(), selection: await selection(before.page), events: await product.mainEvidence() };
    await product.checkpoint(`${failure}-source-canary`);
    await product.manualSave(); await product.expectSaved(canary);
    await product.normalClose();
  } finally {
    if (held) await product.current.app.evaluate(() => globalThis.__rf902Control.release());
  }
});

async function prepare(product) {
  await product.seed(content, 60_000);
  const page = await product.launch(content);
  await page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true }).click();
  await expect(page.locator('[data-fishmark-region="workspace-tab-strip"]')).toBeVisible();
  await product.focus(page);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
  for (let index = 0; index < caret; index++) await page.keyboard.press("ArrowRight");
  await expect.poll(() => selection(page)).toEqual({ anchor: caret, head: caret, collapsed: true });
  return { page, snapshot: await product.snapshot(page), selection: await selection(page) };
}

async function dragTab(product, page, cancel) {
  const tab = page.locator('button[data-fishmark-region="workspace-tab"][data-active="true"]');
  await expect(tab).toBeVisible();
  expect(await tab.getAttribute("title")).toBe(product.documentPath);
  const bounds = await tab.boundingBox();
  const strip = await page.locator('[data-fishmark-region="workspace-tab-strip"]').boundingBox();
  if (!bounds || !strip) throw new Error("The real product tab drag surface is missing.");
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const end = { x: strip.x + strip.width - 35, y: strip.y + strip.height / 2 };
  const endpointSurface = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { region: element?.closest("[data-fishmark-region]")?.getAttribute("data-fishmark-region"), interactive: !!element?.closest("button,input,a,[role=button]"), editor: !!element?.closest(".cm-editor") };
  }, end);
  const action = { origin: "Playwright Chromium browser input; not an OS SendInput claim", cancel, start, end, endpointSurface, startedEpochMs: Date.now() };
  product.crossWindowProof = { ...product.crossWindowProof, inputAction: action };
  expect(endpointSurface).toEqual({ region: "workspace-tab-strip", interactive: false, editor: false });
  try {
    await boundedInput("mouse move to tab", () => page.mouse.move(start.x, start.y));
    await boundedInput("tab mouse down", () => page.mouse.down());
    action.mouseDownEpochMs = Date.now();
    await boundedInput("tab drag to unused strip interior", () => page.mouse.move(end.x, end.y, { steps: 20 }));
    if (cancel) {
      const beforeEscape = await boundedInput("observe active drag before Escape", () => product.rendererEvidence(page));
      action.beforeEscapeLifecycle = beforeEscape.events.filter((entry) => entry.epochMs >= action.startedEpochMs && ["pointerdown", "gotpointercapture", "pointerup", "lostpointercapture", "dragstart"].includes(entry.event));
      expect(action.beforeEscapeLifecycle.filter((entry) => entry.event === "gotpointercapture" && entry.detail.trusted)).toHaveLength(1);
      expect(action.beforeEscapeLifecycle.filter((entry) => ["pointerup", "lostpointercapture", "dragstart"].includes(entry.event))).toEqual([]);
      action.pointerId = action.beforeEscapeLifecycle.find((entry) => entry.event === "gotpointercapture").detail.pointerId;
      action.escapeRequestedEpochMs = Date.now();
      if (cancel === "capture-loss") {
        await page.evaluate((pointerId) => document.querySelector('[data-fishmark-region="workspace-tab"][data-active="true"]').releasePointerCapture(pointerId), action.pointerId);
        // A real browser capture release takes effect at the next pointer event.
        await page.mouse.move(end.x + 1, end.y);
      } else await boundedInput("Escape during drag", () => page.keyboard.press("Escape"));
      action.escapeCompletedEpochMs = Date.now();
      action.cancelledBeforeMouseUp = await page.evaluate((pointerId) => {
        const tab = document.querySelector('[data-fishmark-region="workspace-tab"][data-active="true"]');
        return { dragging: tab?.dataset.dragging ?? null, captured: tab?.hasPointerCapture(pointerId) ?? false };
      }, action.pointerId);
      expect(action.cancelledBeforeMouseUp).toEqual({ dragging: null, captured: false });
    }
  } finally {
    action.mouseUpRequestedEpochMs = Date.now();
    await boundedInput("drag mouse up", () => page.mouse.up());
    action.completedEpochMs = Date.now();
  }
  const events = (await product.rendererEvidence(page)).events;
  const lifecycle = events.filter((entry) => ["pointerdown", "gotpointercapture", "pointerup", "lostpointercapture", "dragstart", "dragend", "escape-key"].includes(entry.event) && entry.epochMs >= action.startedEpochMs);
  product.crossWindowProof.dragLifecycle = lifecycle;
  expect(lifecycle.filter((entry) => ["dragstart", "dragend"].includes(entry.event))).toEqual([]);
  expect(lifecycle.filter((entry) => entry.event === "gotpointercapture")).toHaveLength(1);
  expect(lifecycle.filter((entry) => entry.event === "pointerup")).toHaveLength(1);
  expect(lifecycle.every((entry) => entry.detail.trusted)).toBe(true);
}

for (const input of ["browser", ...(process.platform === "win32" ? ["Windows outside-window", "Windows over-existing-window"] : [])]) test(`${input} tab detach preserves exact document and nonterminal caret`, async ({ product }) => {
  const before = await prepare(product);
  let existing = null, existingIdentity = null;
  const workArea = input === "browser" ? null : await product.current.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  if (workArea) { expect(workArea.width).toBeGreaterThanOrEqual(960); expect(workArea.height).toBeGreaterThanOrEqual(600); }
  if (input === "Windows over-existing-window") {
    await product.current.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((entry) => entry.label === "File").submenu.items.find((entry) => entry.label === "New Window").click());
    await expect.poll(() => product.current.app.windows().length).toBe(2);
    existing = product.current.app.windows().find((page) => page !== before.page);
    await expect.poll(async () => existing.evaluate(() => !!window.fishmark)).toBe(true);
    const owner = await product.current.app.browserWindow(existing);
    existingIdentity = await owner.evaluate((window, area) => {
      window.setBounds({ x: area.x + area.width - 900, y: area.y, width: 900, height: 600 }); window.show();
      return { windowId: String(window.id), hwnd: window.getNativeWindowHandle().readBigUInt64LE().toString() };
    }, workArea);
    await owner.dispose();
    expect((await product.snapshot(existing)).tabs).toEqual([]);
  }
  product.crossWindowProof = { scope: "native browser-input UI detach baseline; no response barriers", sourceSnapshot: before.snapshot, sourceSelection: before.selection };
  if (input === "browser") await dragTab(product, before.page, false);
  else {
    const owner = await product.current.app.browserWindow(before.page);
    const identity = await owner.evaluate((window, area) => {
      window.setBounds({ x: area.x, y: area.y, width: 900, height: 600 });
      window.setAlwaysOnTop(true);
      window.show();
      window.focus();
      return { hwnd: window.getNativeWindowHandle().readBigUInt64LE().toString(), bounds: window.getBounds(), contentBounds: window.getContentBounds(), visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused() };
    }, workArea);
    await owner.dispose();
    expect(await before.page.evaluate(() => devicePixelRatio)).toBe(1);
    const tab = await before.page.locator('[data-fishmark-region="workspace-tab"][data-active="true"]').boundingBox();
    const start = { x: Math.round(identity.contentBounds.x + tab.x + tab.width / 2), y: Math.round(identity.contentBounds.y + tab.y + tab.height / 2) };
    const end = { x: identity.bounds.x + identity.bounds.width + 30, y: start.y };
    if (existing) {
      const strip = await existing.locator('[data-fishmark-region="workspace-tab-strip"]').boundingBox();
      expect(strip).not.toBeNull();
      const receiver = await product.current.app.browserWindow(existing);
      const bounds = await receiver.evaluate(w => w.getContentBounds()); await receiver.dispose();
      end.x = Math.round(bounds.x + strip.x + strip.width - 30);
      end.y = Math.round(bounds.y + strip.y + strip.height / 2);
      product.crossWindowProof.targetStrip = { strip, bounds };
    }
    product.crossWindowProof.nativePreparation = { workArea, identity, start, end };
    const args = ["-WindowHandle", identity.hwnd, "-OwnerPid", String(product.current.mainPid), "-StartX", String(start.x), "-StartY", String(start.y), "-EndX", String(end.x), "-EndY", String(end.y)];
    if (existingIdentity) args.push("-EndWindowHandle", existingIdentity.hwnd, "-ReleaseDelayMs", "200");
    const native = await nativePointer(product, args);
    product.crossWindowProof.nativePointer = { identity, ...native };
    const events = (await product.rendererEvidence(before.page)).events;
    expect(events.filter((entry) => entry.event === "pointerup" && entry.detail.trusted && entry.detail.x > identity.contentBounds.width)).toHaveLength(1);
    expect(events.filter((entry) => entry.event === "dragstart")).toEqual([]);
  }
  await expect.poll(() => product.current.app.windows().length).toBe(2);
  const target = existing ?? product.current.app.windows().find((page) => page !== before.page);
  if (existing) {
    await expect.poll(async () => (await product.snapshot(existing)).activeDocument?.content).toBe(content);
    product.crossWindowProof.existingWindow = { identity: existingIdentity, snapshot: await product.snapshot(existing), behavior: "A real native hit on the existing empty tab strip receives the document without a third window." };
  }
  const targetIdentity = await product.observeNewWindow(target, content);
  await product.focus(target);
  const observed = { sourceSnapshot: await product.snapshot(before.page), targetSnapshot: await product.snapshot(target), targetSelection: await selection(target), targetIdentity, mainEvents: await product.mainEvidence() };
  product.crossWindowProof.observed = observed;
  await product.checkpoint("detached-target-before-canary", target);
  await product.nativeInsert("X", target);
  await expect.poll(async () => (await product.snapshot(target)).activeDocument?.content.length).toBe(content.length + 1);
  product.crossWindowProof.afterCanary = { snapshot: await product.snapshot(target), selection: await selection(target), expectedContent: content.slice(0, caret) + "X" + content.slice(caret) };
  await product.checkpoint("detached-target-after-canary", target);
  expect(observed.sourceSnapshot.tabs.some((tab) => tab.tabId === before.snapshot.activeTabId)).toBe(false);
  expect(observed.targetSnapshot.activeDocument).toEqual(before.snapshot.activeDocument);
  expect(observed.targetSnapshot.windowId).not.toBe(before.snapshot.windowId);
  expect(observed.targetSelection).toEqual(before.selection);
  expect(product.crossWindowProof.afterCanary.snapshot.activeDocument.content).toBe(product.crossWindowProof.afterCanary.expectedContent);
  await product.manualSave(target);
  await product.expectSaved(product.crossWindowProof.afterCanary.expectedContent, target);
  await product.normalClose();
});

for (const cancel of ["Escape", "capture-loss"]) test(`${cancel} during trusted browser-input tab drag preserves source ownership and caret`, async ({ product }) => {
  const before = await prepare(product);
  product.crossWindowProof = { scope: "native browser-input Escape cancellation baseline; no response barriers", sourceSnapshot: before.snapshot, sourceSelection: before.selection };
  await dragTab(product, before.page, cancel);
  const renderer = await product.rendererEvidence(before.page);
  const main = await product.mainEvidence();
  const escapeEvidence = {
    renderer: renderer.events.filter((entry) => entry.event === "escape-key" && entry.detail.trusted && entry.epochMs >= product.crossWindowProof.inputAction.escapeRequestedEpochMs),
    main: main.filter((entry) => entry.event === "input:before" && entry.detail.key === "Escape")
  };
  product.crossWindowProof.observed = { sourceSnapshot: await product.snapshot(before.page), sourceSelection: await selection(before.page), windowCount: product.current.app.windows().length, escapeEvidence, mainEvents: main };
  if (cancel === "Escape") expect(escapeEvidence.renderer).toHaveLength(1);
  else {
    const loss = renderer.events.filter((entry) => entry.event === "lostpointercapture" && entry.epochMs >= product.crossWindowProof.inputAction.escapeRequestedEpochMs);
    expect(loss).toHaveLength(1); expect(loss[0].detail.trusted).toBe(true);
    product.crossWindowProof.scope = "real browser pointer capture loss triggered by releasePointerCapture; no synthetic event; real eventual mouseup";
  }
  expect(product.crossWindowProof.inputAction.cancelledBeforeMouseUp).toEqual({ dragging: null, captured: false });  // Observe a bounded quiet interval; a single immediate count could pass
  // before the renderer's asynchronous detach workflow reaches main.
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    expect(product.current.app.windows()).toHaveLength(1);
    expect((await product.mainEvidence()).filter((entry) => entry.event === "detach:start")).toEqual([]);
    await before.page.waitForTimeout(25);
  }
  await product.focus(before.page);
  const after = { snapshot: await product.snapshot(before.page), selection: await selection(before.page) };
  product.crossWindowProof.afterCancel = after;
  await product.checkpoint("cancelled-source-before-canary", before.page);
  await product.nativeInsert("X", before.page);
  await expect.poll(async () => (await product.snapshot(before.page)).activeDocument?.content.length).toBe(content.length + 1);
  product.crossWindowProof.afterCanary = { snapshot: await product.snapshot(before.page), selection: await selection(before.page), expectedContent: content.slice(0, caret) + "X" + content.slice(caret) };
  await product.checkpoint("cancelled-source-after-canary", before.page);
  expect(after.snapshot).toEqual(before.snapshot);
  expect(after.selection).toEqual(before.selection);
  expect(product.crossWindowProof.afterCanary.snapshot.activeDocument.content).toBe(product.crossWindowProof.afterCanary.expectedContent);
  await product.manualSave(before.page);
  await product.expectSaved(product.crossWindowProof.afterCanary.expectedContent, before.page);
  await product.normalClose();
});

