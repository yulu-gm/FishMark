import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const dir = resolve(process.argv[2] ?? "");
if (process.argv.length !== 3) throw new Error("Usage: node scripts/analyze-table-history.mjs OUTPUT_ROOT");
const runs = ["01-native-cell", "02-document-history", "03-native-cell", "04-document-history"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const summary = [];
for (const run of runs) {
  const bytes = readFileSync(resolve(dir, run, "report.json")), report = JSON.parse(bytes);
  const identity = JSON.parse(readFileSync(resolve(dir, run, "source-identity.json")));
  if (!report.complete || identity.productTransforms !== 0 || identity.phaseTiming !== "off") throw new Error("Invalid completed run " + run);
  const records = report.eventsAndTransactions;
  const keys = records.filter((event) => event.kind === "event" && event.phase === "capture" && ["keydown", "keyup"].includes(event.type) && event.ctrlKey && ["z", "y"].includes(event.key));
  if (keys.length !== 20 || keys.some((event) => !event.isTrusted)) throw new Error("Trusted key count mismatch " + run);
  const downs = keys.filter((event) => event.type === "keydown");
  if (downs.some((event) => report.route === "native-cell" ? event.target.cell !== "1:0" : event.target.cell !== null || !event.target.className.includes("cm-content"))) throw new Error("Mixed history routes " + run);
  const inputs = records.filter((event) => event.kind === "event" && event.type === "input" && event.phase === "capture");
  if (inputs.some((event) => !event.isTrusted) || inputs.filter((event) => event.action === "initial native insert Delta" && event.inputType === "insertText" && event.target.cell === "1:0").length !== 1) throw new Error("Initial input trust mismatch " + run);
  for (const cell of ["1:1", "1:0"]) for (let cycle = 1; cycle <= 2; cycle++) {
    const label = `focus ${cycle} ${cell === "1:1" ? "Beta" : "return Delta"}`;
    if (!records.some((event) => event.kind === "event" && event.action === label && event.type === "mousedown" && event.phase === "capture" && event.isTrusted && event.target.cell === cell)) throw new Error("Focus switch ownership mismatch " + run);
  }
  const transactions = records.filter((event) => event.kind === "transaction" && event.docChanged);
  summary.push({ run, route: report.route, sha256: hash(bytes), userData: report.environment.userData,
    checks: { total: report.checks.length, passed: report.checks.filter((check) => check.pass).length, failed: report.checks.filter((check) => !check.pass).map((check) => check.name) },
    trustedKeyDowns: downs.length, trustedKeyUps: keys.length - downs.length, inputTypes: inputs.map((event) => ({ action: event.action, inputType: event.inputType, cell: event.state.cellTexts.find((cell) => cell.cell === "1:0")?.text })),
    transactions: transactions.map((event) => ({ action: event.action, userEvent: event.userEvent, sameSource: event.beforeSource === event.afterSource })),
    frames: records.filter((event) => event.kind === "frame").map((event) => ({ action: event.action, baseBytes: Buffer.byteLength(event.baseText), resultBytes: Buffer.byteLength(event.resultingText), sameSource: event.baseText === event.resultingText })),
    stages: report.snapshots.filter((snapshot) => snapshot.label === "initial" || snapshot.label === "initial edited" || snapshot.label.endsWith(" undo") || snapshot.label.endsWith(" redo")).map((snapshot) => ({ label: snapshot.label, source: snapshot.source, sourceBytes: Buffer.byteLength(snapshot.source), cell: snapshot.cellTexts.find((cell) => cell.cell === "1:0")?.text, history: snapshot.history, focus: snapshot.focus })),
    identity, presentation: report.presentation });
}
if (new Set(summary.map((run) => run.userData)).size !== 4) throw new Error("Expected four fresh userData paths");
const result = { schemaVersion: 1, productBaseline: "1654e82cd28008cc4f6ae9adec04c5a4d56389ec", observations: {
  tc042FirstEditCanonical: summary.every((run) => run.stages.find((stage) => stage.label === "initial edited")?.sourceBytes === 71),
  nativeOriginalByteUndoWasNotAProjectNativeOracle: true,
  nativeFocusHistoryDefectReproduced: summary.filter((run) => run.route === "native-cell").every((run) => run.checks.failed.length === 4),
  documentRouteAllChecksPassed: summary.filter((run) => run.route === "document-history").every((run) => run.checks.failed.length === 0),
  oldRF901FailUnchanged: true, optimizationReapplied: false
}, runs: summary };
writeFileSync(resolve(dir, "analysis.json"), JSON.stringify(result, null, 2), { flag: "wx" });
console.log(JSON.stringify({ observations: result.observations, runs: summary.map((run) => ({ run: run.run, checks: run.checks, inputs: run.inputTypes.length, docTransactions: run.transactions.length, frames: run.frames.length })) }, null, 2));
