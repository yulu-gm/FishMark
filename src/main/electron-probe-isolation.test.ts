import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type Isolation = { label: string; token: string; directory: string; profile: string; temporaryRoot: string; journalPath: string; reportPath: string; env: Record<string, string> };
type ProbeApp = { isReady(): boolean; getPath(name: string): string; setPath(name: string, value: string): void;
  getAppMetrics(): { pid: number; creationTime: number; type: string }[];
  once(event: string, listener: () => void): void; on(event: string, listener: (_event: unknown, window: unknown) => void): void };
type Report = { passed: boolean; profileRemoved: boolean; processesVerifiedGone?: boolean; records: { phase: string; actualPaths: { appData: string; userData: string } }[]; cleanupErrors: string[] };
const { createProbeIsolation, configureProbeIsolation, finalizeProbeIsolation } = createRequire(import.meta.url)("../../scripts/electron-probe-isolation.cjs") as {
  createProbeIsolation(label: string): Isolation;
  configureProbeIsolation(app: ProbeApp, env: Record<string, string>): { capture(phase: string): void };
  finalizeProbeIsolation(isolation: Isolation, outcome: { launcherPid?: number; exitCode: number }): Promise<Report>;
};
const { runIsolatedElectronProbe } = createRequire(import.meta.url)("../../scripts/run-isolated-electron-probe.mjs") as {
  runIsolatedElectronProbe(input: { isolation: Isolation; command: string; args: string[]; options: { env: NodeJS.ProcessEnv; stdio: string }; timeoutMs: number; timeoutExitCode: number; onTimeout(): void }): Promise<number>;
};
const owned: Isolation[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const isolation of owned.splice(0)) {
    if (!existsSync(isolation.directory)) continue;
    const target = realpathSync(isolation.directory);
    if (target !== resolve(isolation.directory) || dirname(target) !== isolation.temporaryRoot || !basename(target).startsWith("fishmark-electron-probe-")) {
      throw new Error("Refusing unit-test cleanup outside its owned probe root.");
    }
    rmSync(target, { recursive: true, force: true });
  }
});

function fixture() {
  const isolation = createProbeIsolation("unit-contract");
  owned.push(isolation);
  const paths: Record<string, string> = {};
  const readyListeners: Array<() => void> = [];
  let ready = false;
  const app: ProbeApp = {
    isReady: () => ready,
    setPath: (name, value) => { paths[name] = value; },
    getPath: (name) => paths[name]!,
    getAppMetrics: () => [{ pid: process.pid, creationTime: 1234, type: "Browser" }],
    once: (_event, listener) => { readyListeners.push(listener); },
    on: () => {}
  };
  return { isolation, app, paths, ready: () => { ready = true; readyListeners.forEach((listener) => listener()); } };
}

function recordRun(input: ReturnType<typeof fixture>) {
  const configured = configureProbeIsolation(input.app, input.isolation.env);
  input.ready();
  configured.capture("loaded");
  configured.capture("before-exit");
  return configured;
}

function mockGone() {
  return vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("No such process"), { code: "ESRCH" }); });
}

describe("owned Electron probe isolation", () => {
  it("requires the explicit parent protocol before configuring paths", () => {
    const input = fixture();
    expect(() => configureProbeIsolation(input.app, {})).toThrow("isolated Electron probe parent");
    expect(input.paths).toEqual({});
    expect(input.isolation.env.FISHMARK_PROCESS_TREE_REGISTRY_PATH).toContain(input.isolation.directory);
  });

  it("sets both actual paths before ready and retains actual phases and creation times", () => {
    const input = fixture();
    recordRun(input);
    expect(input.paths).toEqual({ appData: input.isolation.directory, userData: input.isolation.profile });
    const records = readFileSync(input.isolation.journalPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(records.map((record) => record.phase)).toEqual(["configured", "ready", "loaded", "before-exit"]);
    expect(records.at(-1).members).toEqual([{ pid: process.pid, creationTime: 1234, type: "Browser" }]);
  });

  it("rejects a path overwritten after configuration and preserves its actual mismatch evidence", () => {
    const input = fixture();
    const configured = configureProbeIsolation(input.app, input.isolation.env);
    input.paths.userData = resolve(input.isolation.directory, "unexpected-profile");
    expect(() => configured.capture("loaded")).toThrow("actual userData");
    expect(readFileSync(input.isolation.journalPath, "utf8")).toContain("unexpected-profile");
  });

  it("persists actual identity outside the profile before removing a successful stopped run", async () => {
    const input = fixture();
    recordRun(input);
    const kill = mockGone();
    const report = await finalizeProbeIsolation(input.isolation, { launcherPid: process.pid, exitCode: 0 });
    expect(report.passed).toBe(true);
    expect(report.profileRemoved).toBe(true);
    expect(report.processesVerifiedGone).toBe(true);
    expect(existsSync(input.isolation.directory)).toBe(false);
    expect(JSON.parse(readFileSync(input.isolation.reportPath, "utf8")).records).toHaveLength(4);
    expect(kill.mock.calls.every((call) => call[1] === 0)).toBe(true);
  });

  it("preserves a failed child's profile and final proof even after all owned processes stop", async () => {
    const input = fixture();
    recordRun(input);
    mockGone();
    const report = await finalizeProbeIsolation(input.isolation, { exitCode: 2 });
    expect(report.passed).toBe(false);
    expect(report.profileRemoved).toBe(false);
    expect(existsSync(input.isolation.directory)).toBe(true);
    expect(report.cleanupErrors.join("\n")).toContain("Failed probes preserve");
    expect(existsSync(input.isolation.reportPath)).toBe(true);
  });

  it("never signals observed metric PIDs or deletes a profile while they are alive", async () => {
    const input = fixture();
    recordRun(input);
    vi.useFakeTimers();
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    const finishing = finalizeProbeIsolation(input.isolation, { exitCode: 0 });
    await vi.advanceTimersByTimeAsync(10_000);
    const report = await finishing;
    expect(report.passed).toBe(false);
    expect(report.profileRemoved).toBe(false);
    expect(existsSync(input.isolation.directory)).toBe(true);
    expect(kill.mock.calls.every((call) => call[1] === 0)).toBe(true);
    expect(report.cleanupErrors.join("\n")).toContain("must exit before profile cleanup");
  });

  it.each(["missing-phase", "wrong-token", "wrong-path"])("preserves the root for invalid final child evidence: %s", async (kind) => {
    const input = fixture();
    recordRun(input);
    let journal = readFileSync(input.isolation.journalPath, "utf8");
    if (kind === "missing-phase") journal = journal.split("\n").filter((line) => !line.includes('"phase":"loaded"')).join("\n");
    if (kind === "wrong-token") journal = journal.replace(input.isolation.token, "unexpected-token");
    if (kind === "wrong-path") journal = journal.replace(JSON.stringify(input.isolation.profile), JSON.stringify(join(input.isolation.directory, "unowned")));
    writeFileSync(input.isolation.journalPath, journal);
    mockGone();
    const report = await finalizeProbeIsolation(input.isolation, { exitCode: 0 });
    expect(report.passed).toBe(false);
    expect(report.profileRemoved).toBe(false);
    expect(existsSync(input.isolation.directory)).toBe(true);
    expect(report.cleanupErrors).toHaveLength(1);
  });

  it("refuses final cleanup when the resolved root is no longer a child of the captured temporary root", async () => {
    const input = fixture();
    recordRun(input);
    mockGone();
    const report = await finalizeProbeIsolation({ ...input.isolation, temporaryRoot: input.isolation.directory }, { exitCode: 0 });
    expect(report.passed).toBe(false);
    expect(report.profileRemoved).toBe(false);
    expect(existsSync(input.isolation.directory)).toBe(true);
  });

  it("overrides an inherited process registry in a real bounded Node child without touching the foreign registry", async () => {
    const input = fixture();
    const script = join(input.isolation.directory, "node-contract.cjs");
    const foreignRegistry = `${input.isolation.reportPath}.foreign-registry`;
    writeFileSync(foreignRegistry, "retained foreign bytes", { flag: "wx" });
    writeFileSync(script, `const assert=require("node:assert/strict");const {join}=require("node:path");
assert.equal(process.env.FISHMARK_PROCESS_TREE_REGISTRY_PATH,join(process.env.FISHMARK_PROBE_ISOLATION_ROOT,"process-pids"));
const paths={};let ready=false;let onReady;const app={isReady:()=>ready,setPath:(name,path)=>paths[name]=path,getPath:name=>paths[name],
getAppMetrics:()=>[{pid:process.pid,creationTime:1234,type:"Node unit simulation"}],once:(_event,callback)=>onReady=callback,on:()=>{}};
const configured=require(${JSON.stringify(resolve(process.cwd(), "scripts/electron-probe-isolation.cjs"))}).configureProbeIsolation(app);
ready=true;onReady();configured.capture("loaded");configured.capture("before-exit");`);
    try {
      const code = await runIsolatedElectronProbe({ isolation: input.isolation, command: process.execPath, args: [script],
        options: { env: { ...process.env, FISHMARK_PROCESS_TREE_REGISTRY_PATH: foreignRegistry }, stdio: "ignore" },
        timeoutMs: 5000, timeoutExitCode: 2, onTimeout: () => {} });
      expect(code).toBe(0);
      expect(readFileSync(foreignRegistry, "utf8")).toBe("retained foreign bytes");
      expect(existsSync(input.isolation.directory)).toBe(false);
    } finally { rmSync(foreignRegistry, { force: true }); }
  }, 10_000);
});
