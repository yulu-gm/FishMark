import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { runBatchProcess } from "./editor-behavior-batch";

type HungTerminator = EventEmitter & {
  killed: boolean;
  kill: () => boolean;
};

type FakeRootProcess = EventEmitter & {
  readonly pid: number;
  readonly exitCode: number | null;
  readonly signalCode: NodeJS.Signals | null;
};

type ProcessTreeRuntime = {
  readonly platform: "win32" | "linux";
  readonly cleanupTimeoutMs: number;
  readonly terminatorTimeoutMs?: number;
  readonly pollMs: number;
  readonly now?: () => number;
  readonly delay?: (durationMs: number) => Promise<void>;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly isProcessGroupAlive?: (groupId: number) => boolean;
  readonly signalProcess?: (pid: number, signal: NodeJS.Signals) => void;
  readonly signalProcessGroup?: (groupId: number, signal: NodeJS.Signals) => void;
  readonly spawnRoot?: () => FakeRootProcess;
  readonly spawnTerminator?: () => HungTerminator;
};

type ProcessTreeModule = {
  readonly spawnTrackedProcess: (
    command: string,
    args: readonly string[],
    options: Record<string, unknown>,
    runtime: ProcessTreeRuntime
  ) => {
    readonly child: import("node:child_process").ChildProcess;
    readonly terminate: () => Promise<void>;
  };
};

describe("runBatchProcess process-tree cleanup", () => {
  it("waits for a timed-out Windows terminator to close before rejecting", async () => {
    const processTree = loadProcessTreeModule();
    let targetAlive = true;
    const terminator = createHungTerminator(() => {
      targetAlive = false;
      setTimeout(() => {
        terminator.emit("close", null, "SIGKILL");
      }, 25);
    });
    const tracked = processTree.spawnTrackedProcess(
      "ignored",
      [],
      {},
      {
        platform: "win32",
        cleanupTimeoutMs: 100,
        terminatorTimeoutMs: 10,
        pollMs: 1,
        isProcessAlive: () => targetAlive,
        spawnRoot: () => createFakeRootProcess(41),
        spawnTerminator: () => terminator
      }
    );
    let settled = false;
    const termination = tracked.terminate().then(
      () => {
        settled = true;
        return null;
      },
      (error: unknown) => {
        settled = true;
        return error;
      }
    );

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
    expect(terminator.killed).toBe(true);
    expect(settled).toBe(false);
    expect(await termination).toEqual(expect.objectContaining({
      message: expect.stringMatching(/taskkill.*timed out/iu)
    }));
  });

  it("rejects within the cleanup budget when a killed Windows terminator never closes", async () => {
    const processTree = loadProcessTreeModule();
    const terminator = createHungTerminator();
    const tracked = processTree.spawnTrackedProcess(
      "ignored",
      [],
      {},
      {
        platform: "win32",
        cleanupTimeoutMs: 70,
        terminatorTimeoutMs: 10,
        pollMs: 1,
        isProcessAlive: () => true,
        spawnRoot: () => createFakeRootProcess(42),
        spawnTerminator: () => terminator
      }
    );
    const startedAt = Date.now();

    await expect(tracked.terminate()).rejects.toThrow(
      /taskkill.*timed out.*terminator exit unconfirmed/iu
    );
    expect(Date.now() - startedAt).toBeLessThan(300);
    expect(terminator.killed).toBe(true);
  });

  it("escalates an owned POSIX group after the root exits and no descendants register", async () => {
    const processTree = loadProcessTreeModule();
    let now = 0;
    let groupAlive = true;
    const groupSignals: Array<[NodeJS.Signals, number]> = [];
    const individualSignals: Array<[number, NodeJS.Signals]> = [];
    const tracked = processTree.spawnTrackedProcess(
      "ignored",
      [],
      {},
      {
        platform: "linux",
        cleanupTimeoutMs: 6_000,
        pollMs: 500,
        now: () => now,
        delay: async (durationMs) => {
          now += durationMs;
        },
        isProcessAlive: () => false,
        isProcessGroupAlive: () => groupAlive,
        signalProcess: (pid, signal) => individualSignals.push([pid, signal]),
        signalProcessGroup: (_groupId, signal) => {
          groupSignals.push([signal, now]);
          if (signal === "SIGKILL") groupAlive = false;
        },
        spawnRoot: () => createFakeRootProcess(43, 0)
      }
    );

    await expect(tracked.terminate()).resolves.toBeUndefined();
    expect(groupSignals).toEqual([["SIGTERM", 0], ["SIGKILL", 3_000]]);
    expect(individualSignals).toEqual([]);
  });

  it("fails within the cleanup budget when an owned POSIX group survives SIGKILL", async () => {
    const processTree = loadProcessTreeModule();
    let now = 0;
    const groupSignals: NodeJS.Signals[] = [];
    const tracked = processTree.spawnTrackedProcess(
      "ignored",
      [],
      {},
      {
        platform: "linux",
        cleanupTimeoutMs: 100,
        pollMs: 10,
        now: () => now,
        delay: async (durationMs) => {
          now += durationMs;
        },
        isProcessAlive: () => false,
        isProcessGroupAlive: () => true,
        signalProcess: () => {
          throw new Error("exited root must not be signalled as an individual PID");
        },
        signalProcessGroup: (_groupId, signal) => groupSignals.push(signal),
        spawnRoot: () => createFakeRootProcess(44, 0)
      }
    );

    await expect(tracked.terminate()).rejects.toThrow(
      /POSIX process group 44 still alive at cleanup deadline/iu
    );
    expect(now).toBe(100);
    expect(groupSignals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("bounds a hung Windows terminator and reports the surviving target", async () => {
    const processTree = loadProcessTreeModule();
    const terminators: HungTerminator[] = [];
    const tracked = processTree.spawnTrackedProcess(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { cwd: process.cwd(), stdio: "ignore", windowsHide: true },
      {
        platform: "win32",
        cleanupTimeoutMs: 80,
        terminatorTimeoutMs: 10,
        pollMs: 1,
        spawnTerminator: () => {
          const terminator = Object.assign(new EventEmitter(), {
            killed: false,
            kill() {
              this.killed = true;
              return true;
            }
          }) as HungTerminator;
          terminators.push(terminator);
          return terminator;
        }
      }
    );
    const startedAt = Date.now();

    try {
      await expect(tracked.terminate()).rejects.toThrow(
        /taskkill.*timed out.*still alive/iu
      );
      expect(Date.now() - startedAt).toBeLessThan(500);
      expect(terminators.length).toBeGreaterThan(0);
      expect(terminators.every(({ killed }) => killed)).toBe(true);
    } finally {
      if (tracked.child.pid && isProcessAlive(tracked.child.pid)) {
        process.kill(tracked.child.pid, "SIGKILL");
      }
    }
  });

  it("rejects a nonzero root only after its registered descendant exits", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "fishmark-batch-nonzero-"));
    const descendantPidPath = join(tempDirectory, "descendant.pid");
    const wrapperSource = [
      'const { appendFileSync, writeFileSync } = require("node:fs");',
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });',
      "child.unref();",
      "writeFileSync(process.argv[1], String(child.pid));",
      'if (process.env.FISHMARK_PROCESS_TREE_REGISTRY_PATH) appendFileSync(process.env.FISHMARK_PROCESS_TREE_REGISTRY_PATH, `${child.pid}\\n`);',
      "process.exit(7);"
    ].join("");

    try {
      await expect(
        runBatchProcess({
          command: process.execPath,
          args: ["-e", wrapperSource, descendantPidPath],
          cwd: process.cwd(),
          signal: new AbortController().signal,
          stdio: "ignore"
        })
      ).rejects.toThrow(/code 7/u);
      const descendantPid = Number(readFileSync(descendantPidPath, "utf8"));
      expect(isProcessAlive(descendantPid)).toBe(false);
    } finally {
      if (existsSync(descendantPidPath)) {
        const descendantPid = Number(readFileSync(descendantPidPath, "utf8"));
        if (isProcessAlive(descendantPid)) process.kill(descendantPid, "SIGKILL");
      }
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function loadProcessTreeModule(): ProcessTreeModule {
  const require = createRequire(import.meta.url);
  return require(resolve(process.cwd(), "scripts", "process-tree.cjs")) as ProcessTreeModule;
}

function createFakeRootProcess(pid: number, exitCode: number | null = null): FakeRootProcess {
  return Object.assign(new EventEmitter(), {
    pid,
    exitCode,
    signalCode: null
  }) as FakeRootProcess;
}

function createHungTerminator(onKill?: () => void): HungTerminator {
  return Object.assign(new EventEmitter(), {
    killed: false,
    kill() {
      this.killed = true;
      onKill?.();
      return true;
    }
  }) as HungTerminator;
}
