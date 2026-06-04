import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const port = Number(process.env.FISHMARK_BLOCKQUOTE_TYPORA_VISUAL_PROBE_PORT ?? "5197");
const phase = process.env.FISHMARK_BLOCKQUOTE_TYPORA_VISUAL_PHASE ?? "after";
const screenshotPath = resolve(
  projectRoot,
  `.artifacts/visual-verification/blockquote-typora-${phase}.png`
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
  [resolve(projectRoot, "scripts/electron-blockquote-typora-visual-main.cjs")],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      FISHMARK_BLOCKQUOTE_TYPORA_VISUAL_PROBE_URL: `http://localhost:${port}/blockquote-typora-visual-probe.html`,
      FISHMARK_BLOCKQUOTE_TYPORA_VISUAL_SCREENSHOT: screenshotPath
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
