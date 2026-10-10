const { app, BrowserWindow, screen } = require("electron");
const { resolve, join } = require("node:path");
const { mkdirSync, writeFileSync } = require("node:fs");
const { cpus, totalmem, release } = require("node:os");
const route = process.argv[2], out = resolve(process.argv[3]), userData = join(out, "userData");
if (!["native-cell", "document-history"].includes(route)) throw new Error("Invalid history route");
mkdirSync(join(userData, "session"), { recursive: true });
app.setPath("appData", userData); app.setPath("userData", userData); app.setPath("sessionData", join(userData, "session")); app.setAppLogsPath(join(userData, "logs"));
let win;
const result = { schemaVersion: 1, route, fixture: null, protocol: "one fresh process/editor per route; one native cell edit; 3 undo/redo cycles then 2 focus roundtrips; explicit document focus before every document-history key", checks: [], snapshots: [], eventsAndTransactions: [], complete: false };
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const js = (code) => win.webContents.executeJavaScript(code, true);
const action = (label) => js(`window.__tableHistory.setAction(${JSON.stringify(label)})`);
async function snapshot(label) { const value = await js(`window.__tableHistory.snapshot(${JSON.stringify(label)})`); result.snapshots.push(value); return value; }
function check(name, pass, evidence) { result.checks.push({ name, pass: Boolean(pass), evidence }); }
async function key(keyCode, label) {
  await action(label);
  win.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers: ["control"] });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers: ["control"] });
  await delay(180);
}
async function click(cell, label) {
  await action(label); const point = await js(`window.__tableHistory.cellPoint(${JSON.stringify(cell)})`);
  for (const type of ["mouseDown", "mouseUp"]) win.webContents.sendInputEvent({ type, ...point, button: "left", clickCount: 1 });
  await delay(180);
}
async function documentFocus(label) {
  await action(label); const evidence = await js("window.__tableHistory.focusDocument()"); await delay(180);
  const after = await snapshot(label);
  check(label + " source/history unchanged", evidence.before.source === after.source && JSON.stringify(evidence.before.history) === JSON.stringify(after.history), { before: evidence.before, after });
  check(label + " owns CM focus", after.focus.className.includes("cm-content") && after.focus.cell === null, after.focus);
}
async function historyStep(kind, label) {
  if (route === "document-history") await documentFocus(label + " focus");
  else { const before = await snapshot(label + " owner"); check(label + " owns native cell focus", before.focus.cell === "1:0", before.focus); }
  await key(kind === "undo" ? "z" : "y", label);
  const after = await snapshot(label);
  const expected = kind === "redo" ? result.fixture.edited : route === "native-cell" ? result.fixture.canonicalOriginal : result.fixture.initial;
  check(label + " complete source", after.source === expected, { expected, actual: after.source, history: after.history });
  check(label + " cell text", after.cellTexts.find((cell) => cell.cell === "1:0")?.text === (kind === "redo" ? "Delta" : "Alpha"), after.cellTexts);
}
async function finish(error) {
  if (error) result.error = String(error.stack ?? error);
  if (win && !win.isDestroyed()) {
    result.eventsAndTransactions = await js("window.__tableHistory?.records() ?? []").catch(() => []);
    result.presentation = await js("window.__tableHistory?.presentation() ?? null").catch(() => null);
    try { writeFileSync(join(out, error ? "failed.png" : "final.png"), (await win.webContents.capturePage()).toPNG()); } catch { /* Preserve JSON even if capture fails. */ }
  }
  result.complete = !error;
  writeFileSync(join(out, "report.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(JSON.stringify({ route, complete: result.complete, checks: result.checks.length, failed: result.checks.filter((check) => !check.pass).map((check) => check.name), error: result.error }));
  if (win && !win.isDestroyed()) win.close();
  app.exit(error ? 1 : result.checks.every((check) => check.pass) ? 0 : 2);
}
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1200, height: 900, x: 80, y: 80, show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.focus(); await win.loadURL(process.env.FISHMARK_TABLE_HISTORY_URL); win.focus();
  for (let attempt = 0; attempt < 100 && !await js("Boolean(window.__tableHistory)"); attempt++) await delay(50);
  result.environment = { measuredAt: new Date().toISOString(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), release: release(), electron: process.versions.electron,
    chrome: process.versions.chrome, userData, pid: process.pid, display: screen.getPrimaryDisplay(), gpu: app.getGPUFeatureStatus() };
  result.fixture = await js("({initial:window.__tableHistory.initial,edited:window.__tableHistory.edited,canonicalOriginal:window.__tableHistory.canonicalOriginal})");
  const initial = await snapshot("initial"); check("original fixture / fresh history", initial.source === result.fixture.initial && initial.history.undo === 0 && initial.history.redo === 0, initial);
  await click("1:0", "initial native cell click");
  const prepared = await js("window.__tableHistory.selectAlpha()"); check("DOM selection preparation", prepared.text === "Alpha" && prepared.focus.cell === "1:0", prepared);
  await action("initial native insert Delta"); await win.webContents.insertText("Delta"); await delay(200);
  const edited = await snapshot("initial edited"); check("TC-042 first edit canonical source", edited.source === result.fixture.edited && edited.history.undo === 1 && edited.history.redo === 0, edited);
  writeFileSync(join(out, "edited.png"), (await win.webContents.capturePage()).toPNG());
  for (let cycle = 1; cycle <= 3; cycle++) { await historyStep("undo", `cycle ${cycle} undo`); await historyStep("redo", `cycle ${cycle} redo`); }
  for (let cycle = 1; cycle <= 2; cycle++) {
    const before = await snapshot(`focus ${cycle} before`);
    await click("1:1", `focus ${cycle} Beta`); await click("1:0", `focus ${cycle} return Delta`);
    const after = await snapshot(`focus ${cycle} after`); check(`focus ${cycle} roundtrip source/history unchanged`, before.source === after.source && JSON.stringify(before.history) === JSON.stringify(after.history), { before, after });
    await historyStep("undo", `focus ${cycle} undo`); await historyStep("redo", `focus ${cycle} redo`);
  }
  const records = await js("window.__tableHistory.records()");
  for (const entry of records.filter((entry) => entry.kind === "event" && entry.type === "keydown" && entry.phase === "capture" && entry.ctrlKey && ["z", "y"].includes(entry.key))) {
    check(entry.action + " trusted route key", entry.isTrusted && (route === "native-cell" ? entry.target.cell === "1:0" : entry.target.className.includes("cm-content") && entry.target.cell === null), entry);
  }
  for (const kind of ["undo", "redo"]) {
    const relevant = records.filter((entry) => entry.action.endsWith(" " + kind));
    const nativeInputs = relevant.filter((entry) => entry.kind === "event" && entry.type === "input" && entry.phase === "capture");
    const transactions = relevant.filter((entry) => entry.kind === "transaction" && entry.docChanged);
    check(kind + " correct history provenance", route === "native-cell" ? nativeInputs.length === 5 && nativeInputs.every((entry) => entry.isTrusted && entry.inputType === (kind === "undo" ? "historyUndo" : "historyRedo")) && transactions.length === 5 && transactions.every((entry) => entry.userEvent === "input.table-edit") : nativeInputs.length === 0 && transactions.length === 5 && transactions.every((entry) => entry.userEvent === kind), { nativeInputs, transactions });
  }
  await finish();
}).catch(finish);
