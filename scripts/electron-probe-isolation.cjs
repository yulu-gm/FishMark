const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, join, resolve } = require("node:path");

const PREFIX = "fishmark-electron-probe-";

function createProbeIsolation(label) {
  assert.match(label, /^[a-z][a-z-]{1,63}$/);
  const temporaryRoot = realpathSync(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, PREFIX));
  const profile = join(directory, "user-data");
  const token = randomUUID();
  const journalPath = join(directory, "isolation.jsonl");
  const registryPath = join(directory, "process-pids");
  const evidenceDirectory = resolve(process.env.FISHMARK_PROBE_ISOLATION_EVIDENCE_DIR ?? ".artifacts/probe-isolation");
  mkdirSync(profile);
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(journalPath, "", { flag: "wx" });
  writeFileSync(registryPath, "", { flag: "wx" });
  const reportPath = join(evidenceDirectory, `${label}-${token}.json`);
  writeFileSync(reportPath, JSON.stringify({ label, token, directory, profile, pending: true }), { flag: "wx" });
  return { label, token, temporaryRoot, directory, profile, journalPath,
    reportPath,
    env: { FISHMARK_PROBE_ISOLATION_ROOT: directory, FISHMARK_PROBE_ISOLATION_TEMP_ROOT: temporaryRoot,
      FISHMARK_PROBE_ISOLATION_LABEL: label, FISHMARK_PROBE_ISOLATION_TOKEN: token,
      FISHMARK_PROCESS_TREE_REGISTRY_PATH: registryPath } };
}

function configureProbeIsolation(app, env = process.env) {
  const directory = env.FISHMARK_PROBE_ISOLATION_ROOT;
  const temporaryRoot = env.FISHMARK_PROBE_ISOLATION_TEMP_ROOT;
  const label = env.FISHMARK_PROBE_ISOLATION_LABEL;
  const token = env.FISHMARK_PROBE_ISOLATION_TOKEN;
  assert.ok(directory && temporaryRoot && label && token, "Use the isolated Electron probe parent launcher.");
  assertOwnedRoot(directory, temporaryRoot);
  assert.equal(app.isReady(), false, "Probe isolation must be configured before app readiness.");
  const profile = join(directory, "user-data");
  app.setPath("appData", directory);
  app.setPath("userData", profile);
  const journalPath = join(directory, "isolation.jsonl");
  function capture(phase) {
    const actualPaths = { appData: app.getPath("appData"), userData: app.getPath("userData") };
    const members = app.isReady() ? app.getAppMetrics().map(({ pid, creationTime, type }) => ({ pid, creationTime, type })) : [];
    appendFileSync(journalPath, JSON.stringify({ phase, epochMs: Date.now(), label, token, mainPid: process.pid, actualPaths, members }) + "\n");
    assert.equal(resolve(actualPaths.appData), directory, "Probe actual appData must stay in its owned root.");
    assert.equal(resolve(actualPaths.userData), profile, "Probe actual userData must stay in its owned profile.");
  }
  capture("configured");
  app.once("ready", () => capture("ready"));
  app.on("browser-window-created", (_event, window) => {
    window.webContents.once("did-finish-load", () => capture("loaded"));
  });
  return { capture };
}

async function finalizeProbeIsolation(isolation, outcome) {
  const report = { label: isolation.label, token: isolation.token, directory: isolation.directory, profile: isolation.profile,
    launcherPid: outcome.launcherPid, exitCode: outcome.exitCode, error: outcome.error, records: [], members: [], cleanupErrors: [], profileRemoved: false };
  try {
    const journal = readFileSync(isolation.journalPath, "utf8");
    report.records = journal.trim() ? journal.trim().split("\n").map((line) => JSON.parse(line)) : [];
    const members = new Map();
    for (const record of report.records) {
      assert.equal(record.label, isolation.label);
      assert.equal(record.token, isolation.token);
      assert.equal(resolve(record.actualPaths.appData), isolation.directory);
      assert.equal(resolve(record.actualPaths.userData), isolation.profile);
      for (const member of record.members) {
        assert.ok(Number.isSafeInteger(member.pid) && member.pid > 0 && Number.isFinite(member.creationTime) && member.creationTime > 0);
        members.set(`${member.pid}:${member.creationTime}`, member);
      }
    }
    report.members = [...members.values()];
    const pids = [...new Set([outcome.launcherPid, ...report.records.map((record) => record.mainPid), ...report.members.map((member) => member.pid)].filter(Boolean))];
    const deadline = Date.now() + 10_000;
    let alive;
    do {
      alive = pids.filter(isAlive);
      if (alive.length === 0) break;
      await new Promise((done) => setTimeout(done, 25));
    } while (Date.now() < deadline);
    report.stillOwned = alive;
    assert.deepEqual(alive, [], "Owned probe main/metric processes must exit before profile cleanup.");
    report.processesVerifiedGone = true;
    for (const phase of ["configured", "ready", "loaded", "before-exit"]) {
      assert.ok(report.records.some((record) => record.phase === phase), `Missing actual probe identity phase: ${phase}`);
    }
    assert.ok(report.members.some((member) => member.pid === report.records[0].mainPid), "Missing Electron main process creation time.");
    assert.equal(outcome.exitCode, 0, "Failed probes preserve their profile and evidence.");
    assert.equal(outcome.error, undefined);
    assertOwnedRoot(isolation.directory, isolation.temporaryRoot);
    // Preserve actual paths/identities outside the profile before deletion.
    report.passed = true;
    writeFileSync(isolation.reportPath, JSON.stringify(report, null, 2));
    rmSync(isolation.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    report.profileRemoved = true;
  } catch (error) {
    report.passed = false;
    report.cleanupErrors.push(error.stack ?? String(error));
  }
  writeFileSync(isolation.reportPath, JSON.stringify(report, null, 2));
  return report;
}

function assertOwnedRoot(directory, temporaryRoot) {
  const target = realpathSync(directory);
  assert.equal(target, resolve(directory));
  assert.equal(dirname(target), realpathSync(temporaryRoot));
  assert.ok(basename(target).startsWith(PREFIX), "Refusing cleanup/configuration outside the owned probe root.");
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

module.exports = { createProbeIsolation, configureProbeIsolation, finalizeProbeIsolation };
