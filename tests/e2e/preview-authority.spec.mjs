import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { test, expect } from "./product-fixture.mjs";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="16"><rect width="20" height="16" fill="#228866"/></svg>';
const assetUrl = (path) => `fishmark-asset://preview/${path.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/")}`;

async function request(page, path) {
  return page.evaluate(async (url) => {
    const response = await fetch(url);
    return { status: response.status, body: await response.text() };
  }, assetUrl(path));
}

async function sessions(product) {
  return product.current.app.evaluate(({ app, BrowserWindow }) => ({
    appData: app.getPath("appData"), userData: app.getPath("userData"),
    windows: BrowserWindow.getAllWindows().map((window) => ({ id: window.id,
      persistent: window.webContents.session.isPersistent(), storagePath: window.webContents.session.storagePath })),
    distinct: new Set(BrowserWindow.getAllWindows().map((window) => window.webContents.session)).size
  }));
}

test("preview authority loads relative CSS fonts and dependencies and revokes selected theme resources", async ({ product }) => {
  const content = "Preview font resource document\n";
  await product.seed(content, 60_000);
  const theme = join(product.profile, "themes", "rf903-font");
  await mkdir(theme, { recursive: true });
  const font = (await readdir(resolve("dist/assets"))).find((name) => /^KaTeX_Main-Regular.*\.woff2$/.test(name));
  expect(font).toBeTruthy();
  await copyFile(resolve("dist/assets", font), join(theme, "fixture.woff2"));
  await writeFile(join(theme, "texture.svg"), svg);
  await writeFile(join(theme, "nested.css"), ':root { --rf903-relative-import: loaded; }');
  await writeFile(join(theme, "theme.css"), [
    '@import url("./nested.css");',
    '@font-face { font-family: RF903Fixture; src: url("./fixture.woff2") format("woff2"); }',
    '.rf903-font-proof { font-family: RF903Fixture; background-image: url("./texture.svg"); }',
    ':root { --rf903-font-theme: loaded; }'
  ].join("\n"));
  await writeFile(join(theme, "manifest.json"), JSON.stringify({ id: "rf903-font", contractVersion: 2,
    name: "RF903 font fixture", supports: { light: true, dark: true }, tokens: { light: "./theme.css", dark: "./theme.css" } }));
  await writeFile(join(product.profile, "preferences.json"), JSON.stringify({ version: 3, autosave: { idleDelayMs: 60_000 },
    theme: { selectedId: "rf903-font", mode: "light", effectsMode: "off" } }));
  const page = await product.launch(content);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--rf903-relative-import").trim())).toBe("loaded");
  const fontProof = await page.evaluate(async () => {
    const element = document.createElement("div");
    element.className = "rf903-font-proof";
    element.textContent = "Font resource 123";
    document.body.append(element);
    let failure = null;
    try { await document.fonts.load("18px RF903Fixture", "Font resource 123"); } catch (error) { failure = error.message; }
    await document.fonts.ready;
    return { failure, fonts: [...document.fonts].filter((font) => font.family === "RF903Fixture").map((font) => ({ family: font.family, status: font.status })),
      check: document.fonts.check("18px RF903Fixture", "Font resource 123"), background: getComputedStyle(element).backgroundImage };
  });
  await product.testInfo.attach("real-css-font-proof", { body: JSON.stringify(fontProof, null, 2), contentType: "application/json" });
  expect(fontProof.failure).toBeNull();
  expect(fontProof.fonts).toEqual([{ family: "RF903Fixture", status: "loaded" }]);
  expect(fontProof.check).toBe(true);
  expect(fontProof.background).toContain("fishmark-asset://preview/");
  expect(await request(page, join(theme, "texture.svg"))).toEqual({ status: 200, body: svg });
  await page.evaluate(() => window.fishmark.updatePreferences({ theme: { selectedId: "default", mode: "light", effectsMode: "off" } }));
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--rf903-font-theme").trim())).toBe("");
  expect((await request(page, join(theme, "texture.svg"))).status).toBe(403);
  expect((await request(page, join(theme, "fixture.woff2"))).status).toBe(403);
  await product.checkpoint("relative-font-loaded-and-theme-revoked");
  await product.normalClose();
});

test("preview authority binds real sessions to owned tabs and revokes closed document roots", async ({ product }) => {
  const content = "![Owned preview](./resource.svg)\n\nWindow resource fixture\n";
  await product.seed(content, 60_000);
  const ownImage = join(dirname(product.documentPath), "resource.svg");
  await writeFile(ownImage, svg);
  const forbidden = join(product.directory, "unselected", "secret.svg");
  await mkdir(dirname(forbidden));
  await writeFile(forbidden, svg);
  const page = await product.launch(content);
  await expect.poll(() => page.locator('img[alt="Owned preview"]').evaluate((image) => image.naturalWidth)).toBe(20);
  expect(await request(page, ownImage)).toEqual({ status: 200, body: svg });
  expect((await request(page, forbidden)).status).toBe(403);
  const nextWindow = product.current.app.waitForEvent("window");
  await product.current.app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu().items.find((item) => item.label === "File").submenu.items.find((item) => item.label === "New Window");
    if (!item?.click) throw new Error("Missing product New Window command");
    item.click();
  });
  const second = await nextWindow;
  await expect.poll(() => second.evaluate(() => typeof window.fishmark?.getWorkspaceSnapshot)).toBe("function");
  await product.observeSandbox(second);
  expect((await request(second, ownImage)).status).toBe(403);
  const proof = await sessions(product);
  expect(proof.appData).toBe(product.directory);
  expect(proof.userData).toBe(product.profile);
  expect(proof.windows).toHaveLength(2);
  expect(proof.distinct).toBe(2);
  expect(proof.windows.every((window) => !window.persistent && window.storagePath === null)).toBe(true);
  await product.testInfo.attach("real-session-authority", { body: JSON.stringify(proof, null, 2), contentType: "application/json" });
  expect(await request(page, ownImage)).toEqual({ status: 200, body: svg });
  await product.focus(page);
  const exitReading = page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
  if (await exitReading.isVisible()) await exitReading.click();
  await page.getByRole("button", { name: "Close roundtrip.md", exact: true }).click();
  await expect.poll(async () => (await product.snapshot()).tabs.length).toBe(0);
  await expect(page.locator(".cm-content[contenteditable=true]")).toHaveCount(0);
  expect((await request(page, ownImage)).status).toBe(403);
  await product.normalClose();
});
