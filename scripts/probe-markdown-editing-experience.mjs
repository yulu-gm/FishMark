import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { createServer } from "vite";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const port = Number(process.env.FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_PORT ?? "5195");
const requestedCase = process.env.FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_CASE ?? "";
const requestedGroup = process.env.FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP ?? "";
const probeSearchParams = new URLSearchParams();
if (requestedCase.length > 0) {
  probeSearchParams.set("case", requestedCase);
}
if (requestedGroup.length > 0) {
  probeSearchParams.set("group", requestedGroup);
}
const probeSearch = probeSearchParams.toString();
const probePath = probeSearch.length > 0
  ? `/markdown-editing-experience-probe.html?${probeSearch}`
  : "/markdown-editing-experience-probe.html";

const server = await createServer({
  configFile: resolve(projectRoot, "vite.config.ts"),
  server: {
    host: "localhost",
    port,
    strictPort: true
  },
  logLevel: "silent"
});

await server.listen();

const child = spawn(
  electronBinary,
  [resolve(projectRoot, "scripts/electron-markdown-editing-experience-main.cjs")],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_URL: `http://localhost:${port}${probePath}`
    },
    stdio: "inherit"
  }
);

const exitCode = await new Promise((resolveExit) => {
  child.on("exit", (code) => resolveExit(code ?? 1));
  child.on("error", () => resolveExit(1));
});

await server.close();
process.exit(exitCode);
