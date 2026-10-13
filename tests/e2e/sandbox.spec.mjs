import { test, expect } from "./product-fixture.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

test("product renderer runs in an OS sandbox with the isolated product bridge", async ({ product }) => {
  const content = "Sandbox document 正文\n";
  await product.seed(content, 60_000);
  const page = await product.launch(content);
  const proof = await product.current.app.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const rendererPid = window.webContents.getOSProcessId();
    return { rendererPid, preferences: window.webContents.getLastWebPreferences(),
      metric: app.getAppMetrics().find((entry) => entry.pid === rendererPid), argv: process.argv };
  });
  proof.page = await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process,
    ipcRenderer: typeof window.ipcRenderer, testBridge: typeof window.fishmarkTest,
    productBridge: typeof window.fishmark.getWorkspaceSnapshot }));
  await product.testInfo.attach("sandbox-runtime", { body: JSON.stringify(proof, null, 2), contentType: "application/json" });
  expect(proof.preferences.sandbox).toBe(true);
  expect(proof.preferences.contextIsolation).toBe(true);
  expect(proof.preferences.nodeIntegration).toBe(false);
  expect(proof.argv.some((arg) => arg === "--no-sandbox")).toBe(false);
  if (process.platform === "win32") expect(proof.metric?.sandboxed).toBe(true);
  expect(proof.page).toEqual({ require: "undefined", process: "undefined", ipcRenderer: "undefined", testBridge: "undefined", productBridge: "function" });
  await product.append("continued");
  await product.manualSave();
  await product.expectSaved(content + "continued");
  await product.normalClose();
});

test("sandbox keeps local document images and community theme CSS shader textures working", async ({ product }) => {
  const content = "![RF903 local image](./resource.svg)\n\nImage and theme document\n";
  await product.seed(content, 60_000);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="16"><rect width="20" height="16" fill="#228866"/></svg>';
  await writeFile(join(dirname(product.documentPath), "resource.svg"), svg);
  const theme = join(product.profile, "themes", "rf903-test");
  await mkdir(theme, { recursive: true });
  await writeFile(join(theme, "texture.svg"), svg);
  await writeFile(join(theme, "theme.css"), ':root { --rf903-theme-proof: loaded; }');
  const shader = "void mainImage(out vec4 color, in vec2 coord) { color = texture2D(iChannel0, coord.xy / iResolution.xy); }";
  await writeFile(join(theme, "surface.glsl"), shader);
  await writeFile(join(theme, "manifest.json"), JSON.stringify({
    id: "rf903-test", contractVersion: 2, name: "RF903 isolated fixture", version: "1.0.0",
    supports: { light: true, dark: true }, tokens: { light: "./theme.css", dark: "./theme.css" },
    styles: {}, layout: { titlebar: null }, scene: { id: "rf903-scene", sharedUniforms: {} },
    surfaces: { workbenchBackground: { kind: "fragment", scene: "rf903-scene", shader: "./surface.glsl",
      channels: { "0": { type: "image", src: "./texture.svg" } } } }, parameters: []
  }));
  await writeFile(join(product.profile, "preferences.json"), JSON.stringify({ version: 3,
    autosave: { idleDelayMs: 60_000 }, theme: { selectedId: "rf903-test", mode: "light", effectsMode: "full" } }));
  const page = await product.launch(content);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--rf903-theme-proof").trim())).toBe("loaded");
  const image = page.locator('img[alt="RF903 local image"]');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => ({ complete: element.complete, width: element.naturalWidth, height: element.naturalHeight }))).toEqual({ complete: true, width: 20, height: 16 });
  const surface = page.locator('[data-fishmark-theme-surface="workbenchBackground"]');
  await expect(surface).toHaveAttribute("data-fishmark-theme-surface-mode", "full");
  const proof = await page.evaluate(() => ({ css: getComputedStyle(document.documentElement).getPropertyValue("--rf903-theme-proof").trim(),
    image: document.querySelector('img[alt="RF903 local image"]').currentSrc,
    themeLinks: [...document.querySelectorAll('link[data-fishmark-theme-runtime="active"]')].map((link) => link.href),
    surfaceMode: document.querySelector('[data-fishmark-theme-surface="workbenchBackground"]').dataset.fishmarkThemeSurfaceMode,
    resources: performance.getEntriesByType("resource").map((entry) => entry.name) }));
  // Resource Timing does not consistently expose custom-protocol requests.
  // Check exact bytes through the real protocol as well as the applied CSS,
  // decoded document image and non-fallback texture-backed surface above.
  proof.assets = await page.evaluate(async (paths) => Promise.all(paths.map(async (path) => {
    const url = `fishmark-asset://preview?path=${encodeURIComponent(path.replace(/\\/g, "/"))}`;
    const response = await fetch(url);
    return { url, status: response.status, body: await response.text() };
  })), [join(theme, "surface.glsl"), join(theme, "texture.svg")]);
  await product.testInfo.attach("sandbox-resource-compatibility", { body: JSON.stringify(proof, null, 2), contentType: "application/json" });
  expect(proof.image).toContain("fishmark-asset:");
  expect(proof.themeLinks.some((url) => decodeURIComponent(url).endsWith("theme.css"))).toBe(true);
  expect(proof.assets.map(({ status, body }) => ({ status, body }))).toEqual([{ status: 200, body: shader }, { status: 200, body: svg }]);
  await product.checkpoint("sandbox-images-theme-ready");
  await product.append("continued");
  await product.manualSave();
  await product.expectSaved(content + "continued");
  await product.normalClose();
  await product.launch(content + "continued");
  await expect.poll(() => product.current.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--rf903-theme-proof").trim())).toBe("loaded");
  await product.normalClose();
});
