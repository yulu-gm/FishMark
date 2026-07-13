import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const HARD_TIMEOUT_MS = 180_000;

function parseArgs(argv) {
  const options = {
    caseId: null,
    command: null,
    containerPath: null,
    reportPath: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];
    if (["--case", "--command", "--container-path", "--report"].includes(argument)) {
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${argument}.`);
      }
      if (argument === "--case") options.caseId = next;
      if (argument === "--command") options.command = next;
      if (argument === "--container-path") options.containerPath = next;
      if (argument === "--report") options.reportPath = resolve(projectRoot, next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${JSON.stringify(argument)}.`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const port = Number(process.env.FISHMARK_EDITOR_BEHAVIOR_PORT ?? "5196");
const reportPath = options.reportPath ?? resolve(
  projectRoot,
  ".artifacts",
  "editor-behavior",
  `report-${Date.now()}.json`
);
const search = new URLSearchParams();
if (options.caseId) search.set("case", options.caseId);
if (options.command) search.set("command", options.command);
if (options.containerPath) search.set("containerPath", options.containerPath);
const suffix = search.size > 0 ? `?${search.toString()}` : "";

const server = await createServer({
  configFile: resolve(projectRoot, "vite.config.ts"),
  server: { host: "localhost", port, strictPort: true },
  logLevel: "silent"
});

let child;
let timeout;
try {
  await server.listen();
  child = spawn(
    electronBinary,
    [resolve(projectRoot, "scripts", "electron-editor-behavior-main.cjs")],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        FISHMARK_EDITOR_BEHAVIOR_PROBE_URL:
          `http://localhost:${port}/editor-behavior-manifest-probe.html${suffix}`,
        FISHMARK_EDITOR_BEHAVIOR_REPORT_PATH: reportPath,
        FISHMARK_EDITOR_BEHAVIOR_HARD_TIMEOUT_MS: String(HARD_TIMEOUT_MS)
      },
      stdio: "inherit"
    }
  );

  const exitCode = await new Promise((resolveExit) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolveExit(code);
    };
    timeout = setTimeout(() => {
      process.stderr.write(
        `Editor behavior manifest exceeded hard limit ${HARD_TIMEOUT_MS}ms.\n`
      );
      child.kill();
      finish(2);
    }, HARD_TIMEOUT_MS + 5_000);
    child.on("exit", (code) => finish(code ?? 1));
    child.on("error", () => finish(1));
  });

  process.stdout.write(`editor-behavior report: ${reportPath}\n`);
  process.exitCode = exitCode;
} finally {
  if (timeout) clearTimeout(timeout);
  await server.close();
}
