import { writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "./product-fixture.mjs";

async function expectDenied(product, channel, operation, tabId) {
  const outcome = await operation();
  expect(outcome).toContain("Path authority denied.");
  const owner = await product.current.app.browserWindow(product.current.page);
  let webContentsId;
  try { webContentsId = await owner.evaluate((window) => window.webContents.id); }
  finally { await owner.dispose(); }
  product.expectedIpcFailures ??= [];
  product.expectedIpcFailures.push({ event: "authority:error", channel, webContentsId, tabId, message: "Error: Path authority denied." });
}

test("path authority rejects a renderer string without a main-issued source", async ({ product }) => {
  const content = "Authorized startup document\n";
  await product.seed(content, 60_000);
  const forbidden = join(product.directory, "documents", "not-selected.md");
  await writeFile(forbidden, "Unselected fixture must remain unread\n", "utf8");
  const page = await product.launch(content);
  const before = await product.snapshot();
  const outcome = await page.evaluate(async (path) => {
    try { return { returned: await window.fishmark.openWorkspaceFileFromPath(path) }; }
    catch (error) { return { rejected: error.message }; }
  }, forbidden);
  await product.testInfo.attach("unselected-open-result", { body: JSON.stringify(outcome), contentType: "application/json" });
  await expectDenied(product, "fishmark:open-workspace-file-from-path", async () => outcome.rejected);
  await expectDenied(product, "fishmark:handle-dropped-markdown-file", () => page.evaluate(async (path) => {
    try { await window.fishmark.handleDroppedMarkdownFile({ targetPaths: [path], hasOpenDocument: true }); return "accepted"; }
    catch (error) { return error.message; }
  }, forbidden));
  expect(await page.evaluate(() => window.fishmark.getPathForDroppedFile(new File(["forged"], "forged.md")))).toBe("");
  await expectDenied(product, "fishmark:import-clipboard-image", () => page.evaluate(async () => {
    try { await window.fishmark.importClipboardImage({ tabId: "not-an-owned-tab" }); return "accepted"; }
    catch (error) { return error.message; }
  }), "not-an-owned-tab");
  const oldPreferences = await page.evaluate(() => window.fishmark.getPreferences());
  await expectDenied(product, "fishmark:update-preferences", () => page.evaluate(async (path) => {
    try { await window.fishmark.updatePreferences({ images: { temporaryDirectory: path } }); return "accepted"; }
    catch (error) { return error.message; }
  }, join(product.directory, "renderer-selected-directory")));
  expect(await page.evaluate(() => window.fishmark.getPreferences())).toEqual(oldPreferences);
  expect((await product.snapshot()).tabs).toEqual(before.tabs);
  expect((await product.snapshot()).activeDocument.content).toBe(content);
  expect(await readFile(forbidden, "utf8")).toBe("Unselected fixture must remain unread\n");
  await product.normalClose();
});

test("path authority accepts native-backed File multi-drop in order and preserves recent reopen", async ({ product }) => {
  const content = "Startup document\n";
  await product.seed(content, 60_000);
  const paths = [join(product.directory, "documents", "first.md"), join(product.directory, "documents", "second.md")];
  for (let index = 0; index < paths.length; index++) await writeFile(paths[index], `Native file ${index + 1}\n`, "utf8");
  const page = await product.launch(content);
  const clipboardFormats = await product.current.app.evaluate(({ clipboard }) => clipboard.availableFormats());
  await product.testInfo.attach("clipboard-format-only-observation", { body: JSON.stringify({ formats: clipboardFormats, payloadRead: false }), contentType: "application/json" });
  const exitReading = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await exitReading.isVisible()) await exitReading.click();
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file"; input.multiple = true; input.dataset.rf903NativeFiles = "true";
    document.body.append(input);
  });
  await page.locator("input[data-rf903-native-files]").setInputFiles(paths);
  const nativePaths = await page.evaluate(async () => {
    const files = [...document.querySelector("input[data-rf903-native-files]").files];
    return Promise.all(files.map((file) => window.fishmark.getPathForDroppedFile(file)));
  });
  expect(nativePaths).toEqual(paths);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    for (const file of document.querySelector("input[data-rf903-native-files]").files) transfer.items.add(file);
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(3);
  const dropped = await product.snapshot();
  expect(dropped.tabs.map((tab) => tab.path)).toEqual([product.documentPath, ...paths]);
  expect(dropped.activeDocument.content).toBe("Native file 2\n");
  // The drop event is synthetic, but its File objects come from the real native
  // Chromium file-input backend. This verifies the native File capability path,
  // rather than claiming an operating-system drag gesture.
  await product.testInfo.attach("native-file-drop-authority", { body: JSON.stringify({ paths: nativePaths, snapshot: dropped, dropGesture: "synthetic event carrying native-backed Files" }), contentType: "application/json" });
  await product.append("saved by the real File menu");
  await product.manualSave();
  const savedContent = "Native file 2\nsaved by the real File menu";
  await expect.poll(() => readFile(paths[1], "utf8")).toBe(savedContent);
  await expect.poll(async () => (await product.snapshot()).activeDocument.isDirty).toBe(false);
  for (const name of ["second.md", "first.md", "roundtrip.md"]) {
    await page.getByRole("button", { name: `Close ${name}`, exact: true }).click();
  }
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(0);
  await page.locator('[data-fishmark-recent-action="open"]').filter({ has: page.locator(".recent-file-name", { hasText: "second.md" }) }).click();
  await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(savedContent);
  expect((await product.snapshot()).activeDocument.content).toBe(savedContent);
  await product.normalClose();
});

test("path authority preserves a real image paste into the active saved document", async ({ product }) => {
  const content = "Image paste fixture\n\n";
  await product.seed(content, 60_000);
  const page = await product.launch(content);
  // Keep existing clipboard payloads exclusively in main-process RAM. Only
  // supported text/pixel formats or sole native HTML with exact byte restoration are accepted.
  // Refuse unfamiliar formats before writing anything to the OS clipboard.
  product.current.suppressScreenshots = true;
  product.current.visualEvidencePolicy = "Clipboard case: no trace or screenshots after clipboard setup; disk bytes must match fixture.";
  await product.current.app.context().tracing.stop({ path: product.testInfo.outputPath("launch-1-before-clipboard-trace.zip") });
  product.current.tracing = false;
  let prepared, restored;
  try {
    prepared = await product.prepareImageClipboard();
    await page.locator(".cm-content[contenteditable=true]").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Control+V");
    await expect.poll(async () => (await product.snapshot()).activeDocument.content).toMatch(/!\[[^\]]*\]\(assets\/[^)]+\.png\)/);
    const files = await readdir(join(product.directory, "documents", "assets"));
    expect(files).toHaveLength(1);
    const png = await readFile(join(product.directory, "documents", "assets", files[0]));
    expect(png.equals(Buffer.from(prepared.fixturePng, "base64"))).toBe(true);
    await product.manualSave();
    await product.expectSaved((await product.snapshot()).activeDocument.content);
    await product.checkpoint("real-image-paste-saved");
    const saved = await product.snapshot();
    const window = await product.current.app.browserWindow(page);
    let webContentsId;
    try { webContentsId = await window.evaluate((owner) => owner.webContents.id); }
    finally { await window.dispose(); }
    let held = false;
    try {
      await product.current.app.evaluate((_electron, input) => globalThis.__rf902Control.arm(input),
        { kind: "clipboard-response", webContentsId, tabId: saved.activeTabId });
      await page.locator(".cm-content[contenteditable=true]").click();
      await page.keyboard.press("Control+End");
      await page.keyboard.press("Control+V");
      await expect.poll(() => product.current.app.evaluate(() => globalThis.__rf902Control.read()?.phase)).toBe("held");
      held = true;
      await product.current.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find((item) => item.label === "File").submenu.items.find((item) => item.label === "New").click());
      await expect.poll(async () => (await product.snapshot()).activeTabId).not.toBe(saved.activeTabId);
      const next = await product.snapshot();
      expect(next.activeDocument.content).toBe("");
      await product.current.app.evaluate(() => globalThis.__rf902Control.release());
      held = false;
      await expect.poll(async () => (await product.mainEvidence()).filter((event) => event.event === "authority:end" && event.detail.channel === "fishmark:import-clipboard-image").length).toBe(2);
      await page.evaluate(() => new Promise((done) => setTimeout(done, 300)));
      expect((await product.snapshot()).activeDocument.content).toBe("");
      const exitReading = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
      if (await exitReading.isVisible()) await exitReading.click();
      await page.getByRole("button", { name: `Close ${next.activeDocument.name}`, exact: true }).click();
      await expect.poll(async () => (await product.snapshot()).activeDocument?.content).toBe(saved.activeDocument.content);
      await product.testInfo.attach("deferred-image-paste-document-switch", { body: JSON.stringify({ originalTabId: saved.activeTabId, switchedTabId: next.activeTabId, newTabRemainedEmpty: true,
        originalContentUnchanged: true, boundary: "original main clipboard import completed; held its real response before switching through File New" }), contentType: "application/json" });
    } finally {
      if (held) await product.current.app.evaluate(() => globalThis.__rf902Control.release());
    }
  } finally {
    restored = await product.restoreImageClipboard();
    await product.testInfo.attach("clipboard-restoration-proof", { body: JSON.stringify({ prepared, restored }), contentType: "application/json" });
    if (prepared) expect(restored).toEqual({ formatsMatch: true, textMatch: true, imageMatch: true, htmlMatch: true, priorPayloadLogged: false });
  }
  await product.normalClose();
});
