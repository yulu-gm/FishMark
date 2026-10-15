import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./product-fixture.mjs";

const source = "0123456789";
const text = "plain 中文";
const mixture = { text, html: "<b>HTML-ONLY must not be inserted</b>", image: true };
const replaced = `012${text}789`;
const restoredProof = { formatsMatch: true, textMatch: true, imageMatch: true, htmlMatch: true, priorPayloadLogged: false };

async function setup(product) {
  await product.seed(source, 60_000);
  const page = await product.launch(source);
  const reading = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await reading.isVisible()) await reading.click();
  product.current.suppressScreenshots = true;
  product.current.visualEvidencePolicy = "Artificial clipboard fixtures only; prior payload remains in main RAM, no trace/screenshots after clipboard setup.";
  await product.current.app.context().tracing.stop({ path: product.testInfo.outputPath("before-clipboard.zip") });
  product.current.tracing = false;
  await select(product, page);
  return page;
}
async function select(product, page) {
  await product.focus(page); await page.keyboard.press("Control+Home");
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowLeft");
  expect(await page.evaluate(() => getSelection().toString())).toBe("3456");
}
async function restore(product, prepared) {
  const restored = await product.restoreImageClipboard();
  await product.testInfo.attach("clipboard-restoration", { body: JSON.stringify({ prepared, restored }), contentType: "application/json" });
  if (prepared) expect(restored).toEqual(restoredProof);
}
async function noAssets(product) {
  const files = await readdir(join(product.directory, "documents"));
  expect(files).not.toContain("assets");
}
async function chooseNativeMenu(product, page, point) {
  // Enable accessibility only in this owned product process so Windows UIA can
  // inspect and invoke the actual native popup, without changing OS settings.
  await product.current.app.evaluate(({ app }) => app.setAccessibilitySupportEnabled(true));
  const owner = await product.current.app.browserWindow(page);
  const hwnd = await owner.evaluate(w => w.getNativeWindowHandle().readBigUInt64LE().toString()); await owner.dispose();
  const path = product.testInfo.outputPath("native-plain-paste-menu.json");
  let child;
  const done = new Promise(resolve => {
    child = execFile("pwsh.exe", ["-NoProfile", "-File", fileURLToPath(new URL("./windows-plain-paste-menu.ps1", import.meta.url)), "-TelemetryPath", product.current.telemetryPath, "-OutputPath", path, "-WindowHandle", hwnd, "-OwnerPid", String(product.current.mainPid)],
      { windowsHide: true, timeout: 35_000 }, (error, stdout, stderr) => resolve({ error: error?.message, code: error?.code, signal: error?.signal, killed: error?.killed, stdout, stderr }));
  });
  try {
    await page.mouse.click(point.x, point.y, { button: "right" });
    const result = await done;
    expect(result, JSON.stringify(result)).not.toHaveProperty("error", expect.any(String));
    const proof = JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
    expect(proof.status).toBe("passed"); expect(proof.item.name).toBe("仅粘贴文本 Ctrl+Shift+V"); expect(proof.item.processId).toBe(product.current.mainPid);
    product.crossWindowProof = { nativePlainTextMenu: proof };
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); await done; }
}

test("plain text shortcut replaces reverse selection, ignores HTML and image, preserves undo redo save and reopen", async ({ product }) => {
  const page = await setup(product); let prepared;
  try {
    prepared = await product.preparePlainTextClipboard(mixture);
    await page.keyboard.press("Control+Shift+V");
    await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(replaced);
    await noAssets(product);
    await page.keyboard.press("Control+z"); await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
    expect(await page.evaluate(() => getSelection().toString())).toBe("3456");
    await page.keyboard.press("Control+y"); await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(replaced);
    await product.manualSave(); await product.expectSaved(replaced);
  } finally { await restore(product, prepared); }
  await product.normalClose(); await product.launch(replaced); await product.expectSaved(replaced); await product.normalClose();
});

if (process.platform === "win32") test("native context menu plain text paste keeps the selected range and ignores rich payloads", async ({ product }) => {
  const page = await setup(product); let prepared;
  try {
    prepared = await product.preparePlainTextClipboard(mixture);
    const point = await page.evaluate(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await chooseNativeMenu(product, page, point);
    await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(replaced);
    const menu = (await product.mainEvidence()).find(e => e.event === "context-menu:show");
    expect(menu.detail.items.find(item => item.label === "仅粘贴文本")).toMatchObject({ accelerator: "Ctrl+Shift+V", enabled: true });
    await noAssets(product); await product.manualSave(); await product.expectSaved(replaced);
  } finally { await restore(product, prepared); }
  await product.normalClose();
});

test("late plain text clipboard response cannot write the document switched in through File New", async ({ product }) => {
  const page = await setup(product); let prepared, held = false;
  try {
    prepared = await product.preparePlainTextClipboard(mixture);
    const original = await product.snapshot();
    const owner = await product.current.app.browserWindow(page), webContentsId = await owner.evaluate(w => w.webContents.id); await owner.dispose();
    await product.current.app.evaluate((_electron, input) => globalThis.__rf902Control.arm(input), { kind: "plain-text-response", webContentsId, tabId: original.activeTabId });
    await page.keyboard.press("Control+Shift+V");
    await expect.poll(() => product.current.app.evaluate(() => globalThis.__rf902Control.read()?.phase)).toBe("held"); held = true;
    await product.current.app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(i => i.label === "File").submenu.items.find(i => i.label === "New").click());
    await expect.poll(async () => (await product.snapshot()).activeTabId).not.toBe(original.activeTabId);
    expect((await product.snapshot()).activeDocument.content).toBe("");
    await product.current.app.evaluate(() => globalThis.__rf902Control.release()); held = false;
    await expect.poll(async () => (await product.mainEvidence()).filter(e => e.event === "plain-text:end").length).toBe(1);
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    expect((await product.snapshot()).activeDocument.content).toBe("");
    await page.locator(`[data-fishmark-region="workspace-tab"][data-tab-id="${original.activeTabId}"]`).click();
    await expect.poll(async () => (await product.snapshot()).activeDocument.content).toBe(source);
    await product.manualSave(); await product.expectSaved(source); await noAssets(product);
  } finally {
    if (held) await product.current.app.evaluate(() => globalThis.__rf902Control.release());
    await restore(product, prepared);
  }
  await product.normalClose();
});

test("plain text paste ignores image-only clipboard while ordinary paste still imports its real PNG", async ({ product }) => {
  const page = await setup(product); let prepared;
  try {
    prepared = await product.preparePlainTextClipboard({ image: true });
    await page.keyboard.press("Control+Shift+V");
    await expect.poll(async () => (await product.mainEvidence()).filter(e => e.event === "plain-text:end").length).toBe(1);
    expect((await product.snapshot()).activeDocument.content).toBe(source);
    expect(await page.evaluate(() => getSelection().toString())).toBe("3456"); await noAssets(product);
    await page.keyboard.press("Control+V");
    await expect.poll(async () => (await product.snapshot()).activeDocument.content).toMatch(/^012!\[[^\]]*\]\(assets\/[^)]+\.png\)789$/);
    const names = await readdir(join(product.directory, "documents", "assets")); expect(names).toHaveLength(1);
    expect((await readFile(join(product.directory, "documents", "assets", names[0]))).equals(Buffer.from(prepared.fixturePng, "base64"))).toBe(true);
    await product.manualSave(); await product.expectSaved((await product.snapshot()).activeDocument.content);
  } finally { await restore(product, prepared); }
  await product.normalClose();
});

test("closing the owned window dismisses its pending native editor menu", async ({ product }) => {
  const page = await setup(product);
  await page.locator(".cm-content").click({ button: "right" });
  await expect.poll(async () => (await product.mainEvidence()).filter(e => e.event === "context-menu:show").length).toBe(1);
  await product.normalClose();
});
