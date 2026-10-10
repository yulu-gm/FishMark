import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";
import { createRuntimePhaseInstrumentation } from "./runtime-phase-instrumentation.mjs";
const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.FISHMARK_RUNTIME_PERF_PORT ?? "5197");
const reportPath = resolve(projectRoot, process.env.FISHMARK_RUNTIME_PERF_REPORT ?? ".artifacts/editor-runtime-performance.json");
if (existsSync(reportPath)) throw new Error("Fresh runtime performance report path required");
mkdirSync(dirname(reportPath), { recursive: true });
const userDataPath = mkdtempSync(join(dirname(reportPath), "runtime-userData-"));
const phaseMode = process.env.FISHMARK_RUNTIME_PHASE_TIMING ?? "off";
if (!["on", "off"].includes(phaseMode)) throw new Error("Runtime phase timing must be on or off");
const instrumentation = createRuntimePhaseInstrumentation(projectRoot);
const server = await createServer({ configFile: resolve(projectRoot, "vite.config.ts"),
  define: { __FISHMARK_RUNTIME_PHASE_TIMING__: JSON.stringify(phaseMode === "on"),
    __FISHMARK_RUNTIME_PHASE_TARGETS__: JSON.stringify(instrumentation.targets) },
  plugins: phaseMode === "on" ? [instrumentation.plugin] : [],
  server: { host: "localhost", port, strictPort: true, watch: null, hmr: false }, logLevel: "silent" });
try {
  await server.listen();
  const code = await runEditorBehaviorProcess({
    command: require("electron"), args: [resolve(projectRoot, "scripts/electron-editor-runtime-performance-main.cjs")],
    options: { cwd: projectRoot, windowsHide: true, stdio: "inherit", env: { ...process.env,
      FISHMARK_RUNTIME_PERF_URL: `http://localhost:${port}/editor-runtime-performance-probe.html`,
      FISHMARK_RUNTIME_PERF_USER_DATA: userDataPath,
      FISHMARK_RUNTIME_PERF_REPORT: reportPath } },
    timeoutMs: 180000, timeoutExitCode: 124,
    onTimeout: () => process.stderr.write("Editor runtime performance probe timed out\n")
  });
  process.exitCode = code;
} finally {
  await server.close();
  writeFileSync(join(dirname(reportPath), "phase-transform-manifest.json"),
    JSON.stringify({ phaseMode, targets: instrumentation.targets, applied: instrumentation.manifest() }, null, 2), { flag: "wx" });
}
