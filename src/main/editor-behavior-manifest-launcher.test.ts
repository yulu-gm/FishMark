import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("editor behavior Electron launcher", () => {
  it.each([
    ["linux", "true", "1", true],
    ["linux", "true", undefined, false],
    ["linux", "true", "0", false],
    ["linux", undefined, "1", false],
    ["linux", "false", "1", false],
    ["darwin", "true", "1", false],
    ["win32", "true", "1", false]
  ])("gates the test-only sandbox opt-in on platform=%s CI=%s optIn=%s", async (platform, ci, optIn, enabled) => {
    const { createEditorBehaviorArguments } = await import(pathToFileURL(
      path.join(process.cwd(), "scripts/editor-behavior-process-launcher.mjs")
    ).href) as {
      createEditorBehaviorArguments: (entryPath: string, input: {
        platform: string;
        env: Record<string, string | undefined>;
      }) => string[];
    };
    const entry = "/test/electron-editor-behavior-main.cjs";
    expect(createEditorBehaviorArguments(entry, {
      platform,
      env: { CI: ci, FISHMARK_EDITOR_BEHAVIOR_CI_NO_SANDBOX: optIn }
    })).toEqual(enabled ? ["--no-sandbox", entry] : [entry]);
  });

  it("applies the argument policy only through the explicitly opted-in CI behavior step", () => {
    const launcher = read("scripts/probe-editor-behavior.mjs");
    const workflow = read(".github/workflows/ci.yml");
    expect(launcher).toContain("args: createEditorBehaviorArguments(");
    expect(launcher).toContain("{ platform: process.platform, env: process.env }");
    expect(workflow).toMatch(/name: Formal Electron editing behavior manifest[\s\S]*?env:\s+FISHMARK_EDITOR_BEHAVIOR_CI_NO_SANDBOX: "1"\s+run: xvfb-run -a npm run test:editor-behavior -- --report \.artifacts\/ci\/editor-behavior.json/u);
    expect(workflow.match(/FISHMARK_EDITOR_BEHAVIOR_CI_NO_SANDBOX:/gu)).toHaveLength(1);
    expect(read("src/main/main.ts")).not.toContain("FISHMARK_EDITOR_BEHAVIOR_CI_NO_SANDBOX");
  });

  it("creates exactly one BrowserWindow and writes the report atomically", () => {
    const source = read("scripts/electron-editor-behavior-main.cjs");
    const testWindow = read("scripts/electron-test-window.cjs");

    expect(source.match(/createPaintableOffscreenTestWindow\(BrowserWindow\)/gu)).toHaveLength(1);
    expect(testWindow.match(/new BrowserWindow\(/gu)).toHaveLength(1);
    expect(source).toContain("BrowserWindow.getAllWindows().length");
    expect(source).toContain('setWindowOpenHandler(() => ({ action: "deny" }))');
    expect(source).toMatch(/writeFileSync/u);
    expect(source).toMatch(/renameSync/u);
    expect(source).toMatch(/FISHMARK_EDITOR_BEHAVIOR_REPORT_PATH/u);
  });

  it("enforces a 180 second hard limit and exposes exact public filters", () => {
    const launcher = read("scripts/probe-editor-behavior.mjs");
    const electronMain = read("scripts/electron-editor-behavior-main.cjs");

    expect(launcher).toContain("180_000");
    expect(electronMain).toContain("180_000");
    expect(launcher).toContain('"--case"');
    expect(launcher).toContain('"--command"');
    expect(launcher).toContain('"--container-path"');
    expect(launcher).toMatch(/Unknown argument/u);
  });

  it("keeps requestAnimationFrame active in every test-only Electron window", () => {
    const testWindow = read("scripts/electron-test-window.cjs");
    expect(testWindow).toContain("backgroundThrottling: false");
    expect(testWindow).toContain('"disable-background-timer-throttling"');
    expect(testWindow).toContain('"disable-renderer-backgrounding"');
    expect(testWindow).toContain('"disable-backgrounding-occluded-windows"');
  });

  it("shares one sandboxed paintable offscreen configuration with the legacy probe", () => {
    const testWindow = read("scripts/electron-test-window.cjs");
    const manifestMain = read("scripts/electron-editor-behavior-main.cjs");
    const legacyMain = read("scripts/electron-markdown-editing-experience-main.cjs");
    expect(testWindow).toContain("show: true");
    expect(testWindow).toContain("skipTaskbar: true");
    expect(testWindow).toContain("x: -10000");
    expect(testWindow).toContain("y: -10000");
    expect(testWindow).toContain("contextIsolation: true");
    expect(testWindow).toContain("nodeIntegration: false");
    expect(testWindow).toContain("sandbox: true");
    expect(manifestMain).toContain("configurePaintableOffscreenTestApp(app)");
    expect(legacyMain).toContain("configurePaintableOffscreenTestApp(app)");
    expect(legacyMain.match(/createPaintableOffscreenTestWindow\(BrowserWindow\)/gu)).toHaveLength(1);
  });
});
