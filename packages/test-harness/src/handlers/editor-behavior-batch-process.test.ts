import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runBatchProcess } from "./editor-behavior-batch";

describe("runBatchProcess process-tree cleanup", () => {
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
