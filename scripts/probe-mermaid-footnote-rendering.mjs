import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const port = Number(process.env.FISHMARK_MERMAID_FOOTNOTE_RENDER_PROBE_PORT ?? "5196");
const screenshotPath = resolve(
  projectRoot,
  ".artifacts/visual-verification/mermaid-footnote-render-probe.png"
);

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
  [resolve(projectRoot, "scripts/electron-mermaid-footnote-render-main.cjs")],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      FISHMARK_MERMAID_FOOTNOTE_RENDER_PROBE_URL: `http://localhost:${port}/mermaid-footnote-render-probe.html`,
      FISHMARK_MERMAID_FOOTNOTE_RENDER_SCREENSHOT: screenshotPath
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
