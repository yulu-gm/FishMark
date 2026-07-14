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

type ProcessTreeModule = {
  readonly spawnTrackedProcess: (
    command: string,
    args: readonly string[],
    options: Record<string, unknown>,
    runtime: {
      readonly platform: "win32";
      readonly cleanupTimeoutMs: number;
      readonly terminatorTimeoutMs: number;
      readonly pollMs: number;
      readonly spawnTerminator: () => HungTerminator;
    }
  ) => {
    readonly child: import("node:child_process").ChildProcess;
    readonly terminate: () => Promise<void>;
  };
};

describe("runBatchProcess process-tree cleanup", () => {
  it("bounds a hung Windows terminator and reports the surviving target", async () => {
    const require = createRequire(import.meta.url);
    const processTree = require(
      resolve(process.cwd(), "scripts", "process-tree.cjs")
    ) as ProcessTreeModule;
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
