import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const HARD_TIMEOUT_MS = parsePositiveInteger(
  process.env.FISHMARK_EDITOR_BEHAVIOR_LAUNCHER_TIMEOUT_MS,
  180_000
);

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${JSON.stringify(value)}.`);
  }
  return parsed;
}

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

try {
  await server.listen();
  const exitCode = await runEditorBehaviorProcess({
    command: electronBinary,
    args: [resolve(projectRoot, "scripts", "electron-editor-behavior-main.cjs")],
    options: {
      cwd: projectRoot,
      env: {
        ...process.env,
        FISHMARK_EDITOR_BEHAVIOR_PROBE_URL:
          `http://localhost:${port}/editor-behavior-manifest-probe.html${suffix}`,
        FISHMARK_EDITOR_BEHAVIOR_REPORT_PATH: reportPath,
        FISHMARK_EDITOR_BEHAVIOR_HARD_TIMEOUT_MS: String(HARD_TIMEOUT_MS)
      },
      stdio: "inherit"
    },
    timeoutMs: HARD_TIMEOUT_MS,
    timeoutExitCode: 2,
    onTimeout: () => {
      process.stderr.write(
        `Editor behavior manifest exceeded hard limit ${HARD_TIMEOUT_MS}ms.\n`
      );
    }
  });

  process.stdout.write(`editor-behavior report: ${reportPath}\n`);
  process.exitCode = exitCode;
} finally {
  await server.close();
}
