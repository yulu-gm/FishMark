import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "fishmark-workspace-safety-"));
const reportPath = resolve(root, ".artifacts/ci/workspace-safety.json");
// The isolated headless Linux runner may not support user namespaces. This
// smoke covers workflow/data safety, not M9's OS sandbox/security acceptance.
const headlessLinux = process.platform === "linux" &&
  (process.env.CI === "true" || (typeof process.getuid === "function" && process.getuid() === 0));
mkdirSync(dirname(reportPath), { recursive: true });
rmSync(reportPath, { force: true });
try {
  const code = await runEditorBehaviorProcess({
    command: require("electron"),
    args: [
      ...(headlessLinux ? ["--no-sandbox"] : []),
      resolve(root, "scripts/electron-workspace-safety-main.cjs")
    ],
    options: {
      cwd: root,
      env: { ...process.env, FISHMARK_SAFETY_TEMP: temporaryDirectory, FISHMARK_SAFETY_REPORT: reportPath },
      stdio: "inherit"
    },
    timeoutMs: 90_000,
    timeoutExitCode: 2,
    onTimeout: () => console.error("Workspace safety smoke exceeded its hard timeout.")
  });
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  process.exitCode = code === 0 && report.verdict === "PASS" ? 0 : 1;
  console.log(`Workspace safety: ${report.verdict}; evidence: ${reportPath}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
