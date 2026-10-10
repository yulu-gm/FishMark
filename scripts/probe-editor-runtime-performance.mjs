import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";
const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.FISHMARK_RUNTIME_PERF_PORT ?? "5197");
const reportPath = resolve(projectRoot, process.env.FISHMARK_RUNTIME_PERF_REPORT ?? ".artifacts/editor-runtime-performance.json");
if (existsSync(reportPath)) throw new Error("Fresh runtime performance report path required");
mkdirSync(dirname(reportPath), { recursive: true });
const userDataPath = mkdtempSync(join(dirname(reportPath), "runtime-userData-"));
const server = await createServer({ configFile: resolve(projectRoot, "vite.config.ts"), server: { host: "localhost", port, strictPort: true, watch: null, hmr: false }, logLevel: "silent" });
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
} finally { await server.close(); }
