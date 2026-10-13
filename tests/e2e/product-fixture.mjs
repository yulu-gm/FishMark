import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test as base, expect, _electron as electron } from "@playwright/test";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const exists = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
};

async function killOwnedLauncherTree(state) {
  if (state.child.exitCode !== null || state.child.signalCode !== null) return;
  if (process.platform === "win32") {
    state.forceCleanup = await new Promise((done, reject) => {
      execFile("taskkill.exe", ["/PID", String(state.child.pid), "/T", "/F"], { windowsHide: true, timeout: 5000 }, (error, stdout, stderr) => {
        state.forceCleanup = { launcherPid: state.child.pid, stdout, stderr, error: error?.message };
        if (error && state.child.exitCode === null && state.child.signalCode === null) reject(error);
        else done(state.forceCleanup);
      });
    });
  } else {
    // Playwright launches Electron as a new owned process-group leader on POSIX.
    process.kill(-state.child.pid, "SIGKILL");
    state.forceCleanup = { processGroup: state.child.pid };
  }
}

async function bounded(label, action, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([action(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

// Retain all stderr verbatim; warnings remain evidence and real errors fail.
function stderrFailures(stderr) {
  return stderr.split(/\r?\n/).filter((line) => /Uncaught|UnhandledPromiseRejection|unhandled rejection|FATAL|\bERROR\b|\bError:|\[fishmark\].*(failed|timed out|corrupt)/i.test(line));
}

function observeRenderer({ idleDelayMs }) {
  const evidence = { events: [] };
  window.__rf902Evidence = evidence; // DOM diagnostics only; no Node/IPC capability.
  const record = (event, detail) => evidence.events.push({ epochMs: Date.now(), event, detail });
  window.addEventListener("error", (event) => record("error", { message: event.message, stack: event.error?.stack }));
  window.addEventListener("unhandledrejection", (event) => record("unhandledrejection", { reason: String(event.reason), stack: event.reason?.stack }));
  window.addEventListener("blur", () => record("window:blur"));
  window.addEventListener("focus", () => record("window:focus"));
  document.addEventListener("focusout", (event) => {
    if (event.target.closest?.(".cm-editor")) record("editor:focusout");
  }, true);
  document.addEventListener("input", (event) => record("input", { inputType: event.inputType, data: event.data, trusted: event.isTrusted }), true);
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") record("manual-save-key", { trusted: event.isTrusted });
    if (event.key === "Escape") record("escape-key", { trusted: event.isTrusted });
  }, true);
  for (const type of ["dragstart", "dragover", "drop", "dragend", "pointerdown", "pointermove", "pointerup", "pointercancel", "gotpointercapture", "lostpointercapture"]) {
    document.addEventListener(type, (event) => record(type, {
      trusted: event.isTrusted, x: event.clientX, y: event.clientY, button: event.button, buttons: event.buttons,
      pointerId: event.pointerId, captured: event.target.hasPointerCapture?.(event.pointerId), dragging: event.target.dataset?.dragging,
      target: event.target.closest?.("[data-fishmark-region]")?.getAttribute("data-fishmark-region"),
      dropEffect: event.dataTransfer?.dropEffect, effectAllowed: event.dataTransfer?.effectAllowed
    }), true);
  }
  document.addEventListener("visibilitychange", () => record("visibility", { state: document.visibilityState }));
  // Observe configured-delay callbacks without calling, advancing, cancelling,
  // or replacing any application save action. Preserve native timer semantics.
  const schedule = window.setTimeout;
  const cancel = window.clearTimeout;
  const observed = new Set();
  window.setTimeout = function (callback, timeout, ...args) {
    if (timeout !== idleDelayMs || typeof callback !== "function") return Reflect.apply(schedule, this, [callback, timeout, ...args]);
    let timer;
    timer = Reflect.apply(schedule, this, [function (...callbackArgs) {
      observed.delete(timer);
      record("idle-timer:fired", { timer, timeout });
      return Reflect.apply(callback, this, callbackArgs);
    }, timeout, ...args]);
    observed.add(timer);
    record("idle-timer:scheduled", { timer, timeout, stack: new Error().stack });
    return timer;
  };
  window.clearTimeout = function (timer) {
    if (observed.delete(timer)) record("idle-timer:cancelled", { timer });
    return Reflect.apply(cancel, this, [timer]);
  };
  record("observation:armed", { idleDelayMs, focused: document.hasFocus() });
}

class ProductSession {
  constructor(testInfo, directory, temporaryRoot) {
    this.testInfo = testInfo;
    this.directory = directory;
    this.temporaryRoot = temporaryRoot;
    this.profile = join(directory, "user-data");
    this.documentPath = join(directory, "documents", "roundtrip.md");
    this.launches = [];
    this.checkpoints = [];
    this.cleanupErrors = [];
  }

  async seed(content, idleDelayMs) {
    this.idleDelayMs = idleDelayMs;
    await mkdir(this.profile, { recursive: true });
    await mkdir(dirname(this.documentPath), { recursive: true });
    await writeFile(this.documentPath, content, "utf8");
    // Only this freshly-created fixture profile is changed.
    await writeFile(join(this.profile, "preferences.json"), JSON.stringify({ version: 3, autosave: { idleDelayMs }, theme: { effectsMode: "off" } }), "utf8");
    this.provenance = {};
    for (const name of ["dist-electron/main/main.js", "dist-electron/preload/preload.js", "dist/index.html", "package-lock.json"]) {
      this.provenance[name] = digest(await readFile(resolve(root, name)));
    }
    this.initialContent = content;
  }

  async launch(expectedContent, { openDocument = true, recoveryDialog = false, selectTabId } = {}) {
    const index = this.launches.length + 1;
    const state = { index, openDocument, telemetryPath: this.testInfo.outputPath(`launch-${index}-main.jsonl`), stdout: "", stderr: "", pageErrors: [], renderer: null, windowPages: [] };
    this.launches.push(state);
    const env = { ...process.env, FISHMARK_E2E_PROFILE: this.profile, FISHMARK_E2E_TELEMETRY: state.telemetryPath, FISHMARK_E2E_DOCUMENT: this.documentPath, FISHMARK_E2E_OPEN_DOCUMENT: openDocument ? "1" : "0" };
    delete env.VITE_DEV_SERVER_URL;
    delete env.FISHMARK_START_MODE;
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NO_COLOR;
    delete env.FORCE_COLOR;
    let dialogHelper;
    if (recoveryDialog) {
      if (process.platform !== "win32") throw new Error("Native recovery dialog observation requires Windows.");
      state.dialogEvidencePath = this.testInfo.outputPath(`launch-${index}-native-dialog.json`);
      dialogHelper = {};
      dialogHelper.done = new Promise((done) => {
        dialogHelper.child = execFile("pwsh.exe", ["-NoProfile", "-File", resolve(root, "tests/e2e/windows-recovery-dialog.ps1"), "-TelemetryPath", state.telemetryPath, "-OutputPath", state.dialogEvidencePath, "-ExpectedCount", "1"], { windowsHide: true, timeout: 35_000 }, (error, stdout, stderr) => done({ error: error?.message, stdout, stderr }));
      });
    }
    try {
      state.app = await electron.launch({ executablePath: require("electron"), args: [resolve(root, "tests/e2e/product-main.cjs")], cwd: root, env, chromiumSandbox: true, timeout: 20_000 });
      state.child = state.app.process();
      state.pid = state.child.pid;
      state.child.stdout?.on("data", (chunk) => { state.stdout += String(chunk); });
      state.child.stderr?.on("data", (chunk) => { state.stderr += String(chunk); });
      const attachPage = (page) => {
        if (state.windowPages.includes(page)) return;
        state.windowPages.push(page);
        page.on("pageerror", (error) => state.pageErrors.push(error.stack ?? error.message));
      };
      state.app.on("window", attachPage);
      for (const page of state.app.windows()) attachPage(page);
      state.page = await state.app.firstWindow({ timeout: 15_000 });
      await state.app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
      state.tracing = true;
      await expect(state.page.locator(".cm-content[contenteditable=true]")).toBeVisible();
      if (selectTabId) {
        const exitReading = state.page.getByRole("button", { name: "退出阅读模式 (F11)", exact: true });
        if (await exitReading.isVisible()) await exitReading.click();
        await state.page.locator(`[data-tab-id="${selectTabId}"]`).click();
      }
      await expect.poll(async () => (await this.snapshot()).activeDocument?.content).toBe(expectedContent);
      expect(await state.page.evaluate(() => typeof window.fishmarkTest)).toBe("undefined");
      state.identity = await state.app.evaluate(({ app, BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        return { pid: process.pid, argv: process.argv, userData: app.getPath("userData"), url: window.webContents.getURL(), preferences: window.webContents.getLastWebPreferences(), versions: process.versions };
      });
      await this.captureOwnedProcesses(state);
      expect(resolve(state.identity.userData)).toBe(resolve(this.profile));
      expect(state.identity.url).toBe(pathToFileURL(resolve(root, "dist/index.html")).href);
      // Electron41 omits preload from getLastWebPreferences. CDP replays
      // executed scripts from the renderer's isolated worlds on Debugger.enable.
      const cdp = await state.app.context().newCDPSession(state.page);
      state.preloadObservation = { parsedScripts: [] };
      cdp.on("Debugger.scriptParsed", (script) => state.preloadObservation.parsedScripts.push({ scriptId: script.scriptId, url: script.url }));
      try {
        await cdp.send("Debugger.enable");
        const expectedPath = resolve(root, "dist-electron/preload/preload.js");
        const isPreload = (script) => {
          try { return resolve(script.url.startsWith("file:") ? fileURLToPath(script.url) : script.url) === expectedPath; }
          catch { return false; }
        };
        await expect.poll(() => state.preloadObservation.parsedScripts.some(isPreload)).toBe(true);
        const parsed = state.preloadObservation.parsedScripts.find(isPreload);
        const { scriptSource } = await cdp.send("Debugger.getScriptSource", { scriptId: parsed.scriptId });
        const expectedSource = await readFile(expectedPath, "utf8");
        state.preloadObservation.loaded = { ...parsed, scriptSha256: digest(scriptSource), builtSha256: digest(expectedSource), includesExactBuiltSource: scriptSource.includes(expectedSource) };
        expect(state.preloadObservation.loaded.includesExactBuiltSource).toBe(true);
      } finally { await cdp.detach(); }
      expect(state.identity.preferences.contextIsolation).toBe(true);
      expect(state.identity.preferences.nodeIntegration).toBe(false);
      await state.page.evaluate(observeRenderer, { idleDelayMs: this.idleDelayMs });
      await this.checkpoint("ready");
      if (dialogHelper) {
        const calls = (await this.mainEvidence(state)).filter((entry) => entry.event === "dialog:error-box");
        if (calls.length === 0) dialogHelper.child.kill();
        state.dialogHelper = await dialogHelper.done;
        if (calls.length > 0) expect(state.dialogHelper.error).toBeUndefined();
      }
      return state.page;
    } catch (error) {
      state.launchError = error.stack ?? String(error);
      throw error;
    } finally {
      if (dialogHelper && !state.dialogHelper) {
        dialogHelper.child.kill();
        state.dialogHelper = await dialogHelper.done;
      }
    }
  }

  get current() { return this.launches.at(-1); }
  snapshot(page = this.current.page) { return page.evaluate(() => window.fishmark.getWorkspaceSnapshot()); }
  disk() { return readFile(this.documentPath, "utf8"); }
  rendererEvidence(page = this.current.page) { return page.evaluate(() => window.__rf902Evidence); }

  async focus(page = this.current.page) {
    const owner = await this.current.app.browserWindow(page);
    try { await owner.evaluate((window) => window.focus()); }
    finally { await owner.dispose(); }
    await page.locator(".cm-content[contenteditable=true]").focus();
  }

  async nativeInsert(text, page = this.current.page) {
    const owner = await this.current.app.browserWindow(page);
    try { await owner.evaluate(async (window, value) => { await window.webContents.insertText(value); }, text); }
    finally { await owner.dispose(); }
  }

  async observeNewWindow(page, expectedContent) {
    await expect(page.locator(".cm-content[contenteditable=true]")).toBeVisible();
    await expect.poll(async () => (await this.snapshot(page)).activeDocument?.content).toBe(expectedContent);
    expect(page.url()).toBe(pathToFileURL(resolve(root, "dist/index.html")).href);
    expect(await page.evaluate(() => typeof window.fishmarkTest)).toBe("undefined");
    await page.evaluate(observeRenderer, { idleDelayMs: this.idleDelayMs });
    const owner = await this.current.app.browserWindow(page);
    try {
      const identity = await owner.evaluate((window) => ({ windowId: String(window.id), webContentsId: window.webContents.id, preferences: window.webContents.getLastWebPreferences() }));
      expect(identity.preferences.contextIsolation).toBe(true);
      expect(identity.preferences.nodeIntegration).toBe(false);
      this.current.additionalWindows ??= [];
      this.current.additionalWindows.push(identity);
      return identity;
    } finally { await owner.dispose(); }
  }

  async captureOwnedProcesses(state) {
    const identity = await state.app.evaluate(({ app }) => ({ mainPid: process.pid, members: app.getAppMetrics().map(({ pid, creationTime, type }) => ({ pid, creationTime, type })) }));
    state.mainPid = identity.mainPid;
    const members = new Map((state.ownedProcesses ?? []).map((entry) => [`${entry.pid}:${entry.creationTime}`, entry]));
    for (const member of identity.members) members.set(`${member.pid}:${member.creationTime}`, member);
    state.ownedProcesses = [...members.values()];
    expect(state.ownedProcesses.some((member) => member.pid === state.mainPid)).toBe(true);
  }

  async verifyOwnedProcessesGone(state) {
    await bounded("owned Electron main/child processes exit", async () => {
      while ((state.ownedProcesses ?? []).some((member) => exists(member.pid)) || (state.mainPid && exists(state.mainPid))) await delay(25);
    }, 10_000);
    state.processesVerifiedGone = { epochMs: Date.now(), launcherPid: state.child?.pid, mainPid: state.mainPid, members: state.ownedProcesses ?? [] };
  }

  async mainEvidence(state = this.current) {
    const raw = await readFile(state.telemetryPath, "utf8").catch(() => "");
    return raw.trim() ? raw.trim().split("\n").map((line) => JSON.parse(line)) : [];
  }

  async append(text, page = this.current.page) {
    await this.focus(page);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
    await expect.poll(() => page.evaluate(() => {
      const selection = document.getSelection();
      const lastLine = document.querySelector(".cm-content .cm-line:last-child");
      return !!selection && !!lastLine && selection.isCollapsed && lastLine.contains(selection.anchorNode) && selection.anchorOffset === selection.anchorNode.textContent.length;
    })).toBe(true);
    await this.nativeInsert(text, page);
  }

  async manualSave(page) {
    // Invoke the real application's existing File > Save menu item.
    // This exercises its callback/channel and the product save scheduler.
    if (page) await this.focus(page);
    await this.current.app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu()?.items.find((entry) => entry.label === "File")?.submenu?.items.find((entry) => entry.label === "Save");
      if (!item?.click) throw new Error("The product File > Save menu is missing.");
      item.click();
    });
  }

  async expectSaved(content, page = this.current.page) {
    await expect.poll(async () => digest(await readFile(this.documentPath))).toBe(digest(Buffer.from(content, "utf8")));
    await expect.poll(async () => {
      const document = (await this.snapshot(page)).activeDocument;
      return { content: document?.content, dirty: document?.isDirty };
    }).toEqual({ content, dirty: false });
  }

  async checkpoint(label, page = this.current.page) {
    const state = this.current;
    const snapshot = await this.snapshot(page);
    const content = await this.disk();
    this.checkpoints.push({ label, launch: state.index, epochMs: Date.now(), snapshot, diskContent: content, diskSha256: digest(content) });
    await page.screenshot({ path: this.testInfo.outputPath(`launch-${state.index}-${label}.png`) });
  }

  async capture(state) {
    if (state.page && !state.page.isClosed()) state.renderer = await state.page.evaluate(() => window.__rf902Evidence).catch(() => null);
    state.rendererByWindow = await Promise.all(state.windowPages.map(async (page, index) => ({ windowIndex: index + 1, url: page.url(), closed: page.isClosed(), renderer: page.isClosed() ? null : await page.evaluate(() => window.__rf902Evidence).catch(() => null) })));
    if (state.tracing) {
      await bounded("trace capture", () => state.app.context().tracing.stop({ path: this.testInfo.outputPath(`launch-${state.index}-trace.zip`) }));
      state.tracing = false;
    }
  }

  async preserveRecovery(label) {
    const files = [];
    for (const name of ["recovery-snapshot.json", "recovery-journal.jsonl"]) {
      const bytes = await readFile(join(this.profile, name));
      const evidencePath = this.testInfo.outputPath(`launch-${this.current.index}-${label}-${name}`);
      await writeFile(evidencePath, bytes);
      files.push({ name, bytes: bytes.length, sha256: digest(bytes), evidencePath, content: bytes.toString("utf8") });
    }
    const evidence = { label, launch: this.current.index, epochMs: Date.now(), files };
    this.recoveryFiles ??= [];
    this.recoveryFiles.push(evidence);
    return evidence;
  }

  async forceTerminate({ expectedMenuCommands = [] } = {}) {
    const state = this.current;
    await this.captureOwnedProcesses(state);
    expect(exists(state.mainPid)).toBe(true);
    expect(state.child.exitCode).toBe(null);
    expect(state.child.signalCode).toBe(null);
    await this.capture(state);
    await this.assertHealthy(state);
    // No close/quit/app.exit request: the runner externally kills only its
    // still-live owned launcher tree (actual main/metrics members captured above).
    state.forcedExit = { requestedEpochMs: Date.now(), mainPid: state.mainPid, launcherPid: state.child.pid, method: process.platform === "win32" ? "external taskkill /PID /T /F" : "external owned process-group SIGKILL" };
    await killOwnedLauncherTree(state);
    await bounded("externally terminated product process exit", async () => {
      while (state.child.exitCode === null && state.child.signalCode === null) await delay(25);
    });
    state.exit = { code: state.child.exitCode, signal: state.child.signalCode, normalClose: false, externallyTerminated: true };
    expect(state.exit.code !== 0 || state.exit.signal !== null).toBe(true);
    await this.verifyOwnedProcessesGone(state);
    const events = await this.mainEvidence(state);
    expect(events.filter((entry) => ["app:before-quit", "app:will-quit", "app:quit", "window:close", "window:closed"].includes(entry.event))).toEqual([]);
    expect(events.filter((entry) => entry.event === "save:start")).toEqual([]);
    expect(events.filter((entry) => entry.event === "menu:command").map((entry) => entry.detail)).toEqual(expectedMenuCommands);
    state.forcedExit.completedEpochMs = Date.now();
  }

  async normalClose() {
    const state = this.current;
    await this.captureOwnedProcesses(state);
    await this.capture(state);
    await state.app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.close(); });
    await expect.poll(() => state.app.windows().filter((page) => !page.isClosed()).length).toBe(0);
    // macOS keeps its process alive after the final window closes; request the
    // regular application Quit lifecycle there, without forcing an exit.
    if (process.platform === "darwin") await state.app.evaluate(({ app }) => app.quit());
    await bounded("normal product process exit", async () => {
      while (state.child.exitCode === null && state.child.signalCode === null) await delay(25);
    }, 15_000);
    state.exit = { code: state.child.exitCode, signal: state.child.signalCode, normalClose: true };
    expect(state.exit).toEqual({ code: 0, signal: null, normalClose: true });
    await this.verifyOwnedProcessesGone(state);
    await this.assertHealthy(state);
  }

  async assertHealthy(state = this.current) {
    const events = await this.mainEvidence(state);
    const expectedEvents = new Set();
    let checkedStderr = state.stderr;
    for (const warning of state.expectedRecoveryWarnings ?? []) {
      const observed = events.filter((entry) => entry.event === "console:warn" && entry.detail.messages?.length === 1 && entry.detail.messages[0] === warning);
      expect(observed).toHaveLength(1);
      expect(checkedStderr.split(/\r?\n/).filter((line) => line === warning)).toHaveLength(1);
      // Only this case's exact observed handled diagnostic is accounted for.
      // Keep raw telemetry/stderr intact, and fail every other error as before.
      checkedStderr = checkedStderr.replace(warning, "");
    }
    for (const expected of this.expectedIpcFailures ?? []) {
      const failures = events.filter((entry) => entry.event === expected.event && entry.detail.channel === expected.channel && entry.detail.webContentsId === expected.webContentsId && entry.detail.tabId === expected.tabId);
      expect(failures).toHaveLength(1);
      expect(failures[0].detail.error.split("\n")[0]).toBe(expected.message);
      expectedEvents.add(failures[0]);
      const label = `Error occurred in handler for '${expected.channel}':`;
      const logs = events.filter((entry) => entry.event === "main:error" && entry.detail.messages?.[0] === label && entry.detail.messages?.[1] === failures[0].detail.error);
      expect(logs).toHaveLength(1);
      expectedEvents.add(logs[0]);
      const exactLine = `${label} ${expected.message}`;
      expect(checkedStderr.split(/\r?\n/).filter((line) => line === exactLine)).toHaveLength(1);
      checkedStderr = checkedStderr.replace(exactLine, "");
    }
    const mainErrors = events.filter((entry) => !expectedEvents.has(entry) && (entry.event.startsWith("main:") || ["save:error", "edit:error", "flush:error", "detach:error", "watch:error", "snapshot:error"].includes(entry.event) || ["renderer:preload-error", "renderer:process-gone", "renderer:load-failed"].includes(entry.event) || (entry.event === "renderer:console" && ["error", 3].includes(entry.detail.level))));
    const renderer = state.renderer ?? await this.rendererEvidence();
    const rendererErrors = state.rendererByWindow ? state.rendererByWindow.flatMap((entry) => entry.renderer?.events.filter((event) => ["error", "unhandledrejection"].includes(event.event)) ?? []) : renderer?.events.filter((entry) => ["error", "unhandledrejection"].includes(entry.event)) ?? [];
    expect({ mainErrors, pageErrors: state.pageErrors, rendererErrors, stderrErrors: stderrFailures(checkedStderr) }).toEqual({ mainErrors: [], pageErrors: [], rendererErrors: [], stderrErrors: [] });
  }

  async finish() {
    for (const state of this.launches) {
      const recordCleanupError = (label, error) => this.cleanupErrors.push({ launch: state.index, label, error: error.stack ?? String(error) });
      // Launch can reject before Playwright returns an application/child handle.
      // Its internal kill-on-launch-error owns tree cleanup; the bootstrap log
      // independently proves whether the actual product process has exited.
      const bootstrap = (await this.mainEvidence(state)).find((entry) => entry.event === "launch")?.detail;
      if (bootstrap && Number.isSafeInteger(bootstrap.pid) && bootstrap.pid > 0) {
        state.bootstrapIdentity = { pid: bootstrap.pid, profile: bootstrap.profile, documentPath: bootstrap.documentPath };
        state.mainPid ??= bootstrap.pid;
        if (state.mainPid !== bootstrap.pid || bootstrap.profile !== this.profile || bootstrap.documentPath !== this.documentPath) {
          recordCleanupError("bootstrap ownership", new Error("Bootstrap process identity does not match this fixture."));
        }
      }
      if (state.app && state.child.exitCode === null && state.child.signalCode === null) {
        await bounded("owned process capture", () => this.captureOwnedProcesses(state), 5000).catch((error) => recordCleanupError("owned capture", error));
        if (state.page && !state.page.isClosed()) {
          await bounded("failure screenshot", () => state.page.screenshot({ path: this.testInfo.outputPath(`launch-${state.index}-final.png`) })).catch((error) => recordCleanupError("screenshot", error));
        }
        await this.capture(state).catch((error) => recordCleanupError("capture", error));
        // Failure cleanup exits only this fixture-owned instance. It does not
        // answer dirty-document dialogs or touch any other running app.
        await bounded("owned application cleanup", () => state.app.evaluate(({ app }) => { setTimeout(() => app.exit(0), 25); }), 5000).catch((error) => recordCleanupError("app.exit", error));
        await bounded("owned process exit", async () => {
          while (state.child.exitCode === null && state.child.signalCode === null) await delay(25);
        }, 5000).catch((error) => recordCleanupError("exit", error));
        if (state.child.exitCode === null && state.child.signalCode === null) {
          await killOwnedLauncherTree(state).catch((error) => recordCleanupError("owned tree termination", error));
          await bounded("owned process termination", async () => {
            while (state.child.exitCode === null && state.child.signalCode === null) await delay(25);
          }, 5000).catch((error) => recordCleanupError("terminate", error));
        }
      }
      if ((state.app || state.mainPid) && !state.processesVerifiedGone) await this.verifyOwnedProcessesGone(state).catch((error) => recordCleanupError("owned members exit", error));
      state.exit ??= state.child ? { code: state.child.exitCode, signal: state.child.signalCode, normalClose: false } : null;
      state.events = await this.mainEvidence(state);
      await writeFile(this.testInfo.outputPath(`launch-${state.index}-stdout.log`), state.stdout, "utf8");
      await writeFile(this.testInfo.outputPath(`launch-${state.index}-stderr.log`), state.stderr, "utf8");
    }
    const report = {
      runId: process.env.FISHMARK_E2E_RUN_ID, title: this.testInfo.title, platform: process.platform,
      status: this.testInfo.status, errors: this.testInfo.errors, chromiumSandbox: true,
      diagnosticOverhead: "passive main IPC/console logging and renderer configured-delay timer/event observation; no save actions or timer advancement",
      documentPath: this.documentPath, profile: this.profile, idleDelayMs: this.idleDelayMs,
      initialContent: this.initialContent, finalDiskContent: await this.disk().catch(() => null),
      provenance: this.provenance, checkpoints: this.checkpoints, idleProof: this.idleProof,
      recoveryFiles: this.recoveryFiles, recoveryProof: this.recoveryProof, crossWindowProof: this.crossWindowProof,
      expectedIpcFailures: this.expectedIpcFailures,
      launches: this.launches.map(({ app: _app, page: _page, child: _child, windowPages: _windowPages, ...state }) => state),
      cleanupErrors: this.cleanupErrors
    };
    await writeFile(this.testInfo.outputPath("product-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await this.testInfo.attach("product-report", { path: this.testInfo.outputPath("product-report.json"), contentType: "application/json" });
    const alive = this.launches.some((state) => (state.child && state.child.exitCode === null && state.child.signalCode === null) || (state.ownedProcesses ?? []).some((member) => exists(member.pid)) || (state.mainPid && exists(state.mainPid)));
    if (alive) throw new Error("Owned Electron process is still alive; preserving its isolated profile for diagnosis.");
    // Verify the final resolved target is an owned immediate child of the
    // captured temporary root before any recursive filesystem deletion.
    const target = await realpath(this.directory);
    if (dirname(target) !== this.temporaryRoot || !basename(target).startsWith("fishmark-rf902-") || target !== resolve(this.directory)) {
      throw new Error(`Refusing cleanup outside the owned temporary directory: ${target}`);
    }
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    if (this.cleanupErrors.length) throw new Error(`RF902 cleanup failed: ${JSON.stringify(this.cleanupErrors)}`);
  }
}

export const test = base.extend({
  product: async ({}, use, testInfo) => {
    await mkdir(testInfo.outputDir, { recursive: true });
    const temporaryRoot = await realpath(tmpdir());
    const directory = await mkdtemp(join(temporaryRoot, "fishmark-rf902-"));
    const session = new ProductSession(testInfo, directory, temporaryRoot);
    try { await use(session); }
    finally { await session.finish(); }
  }
});
export { expect };
