import { createRequire } from "node:module";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";

const { createProbeIsolation, finalizeProbeIsolation } = createRequire(import.meta.url)("./electron-probe-isolation.cjs");
export { createProbeIsolation };

export async function runIsolatedElectronProbe(input) {
  let exitCode = 1;
  let launcherPid;
  let failure;
  try {
    exitCode = await runEditorBehaviorProcess({ ...input,
      options: { ...input.options, env: { ...input.options.env, ...input.isolation.env } },
      onSpawn(child) { launcherPid = child.pid; }
    });
  } catch (error) { failure = error.stack ?? String(error); }
  const report = await finalizeProbeIsolation(input.isolation, { launcherPid, exitCode, error: failure });
  process.stderr.write(`Electron probe isolation: ${report.passed ? "PASS" : "FAIL"}; evidence: ${input.isolation.reportPath}\n`);
  if (!report.passed) {
    throw new Error(`Electron probe isolation failed; preserved ${input.isolation.directory}: ${report.cleanupErrors.join("\n")}`);
  }
  return exitCode;
}
