import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

type ProcessLauncherModule = {
  readonly runEditorBehaviorProcess: (input: {
    readonly command: string;
    readonly args: readonly string[];
    readonly options: {
      readonly cwd: string;
      readonly stdio: "ignore";
      readonly windowsHide: boolean;
    };
    readonly timeoutMs: number;
    readonly timeoutExitCode: number;
    readonly onTimeout: () => void;
  }) => Promise<number>;
};

describe("editor behavior launcher process-tree cleanup", () => {
  it("awaits the complete child tree after its hard timeout", async () => {
    const cwd = process.cwd();
    const tempDirectory = mkdtempSync(join(tmpdir(), "fishmark-launcher-timeout-"));
    const descendantPidPath = join(tempDirectory, "descendant.pid");
    const wrapperSource = [
      'const { appendFileSync, writeFileSync } = require("node:fs");',
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });',
      "child.unref();",
      "writeFileSync(process.argv[1], String(child.pid));",
      'appendFileSync(process.env.FISHMARK_PROCESS_TREE_REGISTRY_PATH, `${child.pid}\\n`);',
      "setInterval(() => {}, 1000);"
    ].join("");
    const { runEditorBehaviorProcess } = await import(
      pathToFileURL(
        resolve(cwd, "scripts", "editor-behavior-process-launcher.mjs")
      ).href
    ) as ProcessLauncherModule;
    let descendantPid: number | undefined;

    try {
      const exitCode = await runEditorBehaviorProcess({
        command: process.execPath,
        args: ["-e", wrapperSource, descendantPidPath],
        options: {
          cwd,
          stdio: "ignore",
          windowsHide: true
        },
        timeoutMs: 100,
        timeoutExitCode: 2,
        onTimeout: () => undefined
      });
      expect(exitCode).toBe(2);
      expect(existsSync(descendantPidPath)).toBe(true);
      descendantPid = Number(readFileSync(descendantPidPath, "utf8"));
      expect(isProcessAlive(descendantPid)).toBe(false);
    } finally {
      if (descendantPid !== undefined && isProcessAlive(descendantPid)) {
        process.kill(descendantPid, "SIGKILL");
      }
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }, 10_000);
});

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
