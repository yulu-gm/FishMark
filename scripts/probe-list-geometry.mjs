import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";

import { createServer } from "vite";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const port = Number(process.env.FISHMARK_LIST_GEOMETRY_PROBE_PORT ?? "5191");

const server = await createServer({
  configFile: resolve(projectRoot, "vite.config.ts"),
  server: {
    host: "localhost",
    port,
    strictPort: true,
    watch: null,
    hmr: false
  },
  logLevel: "silent"
});

await server.listen();

try {
  process.exitCode = await runEditorBehaviorProcess({
    command: electronBinary,
    args: [resolve(projectRoot, "scripts/electron-list-geometry-main.cjs")],
    options: {
      cwd: projectRoot,
      env: {
        ...process.env,
        FISHMARK_LIST_GEOMETRY_PROBE_URL: `http://localhost:${port}/list-geometry-probe.html`
      },
      stdio: "inherit",
      windowsHide: true
    },
    timeoutMs: 180_000,
    timeoutExitCode: 2,
    onTimeout: () => process.stderr.write("List geometry probe exceeded 180000ms.\n")
  });
} finally {
  await server.close();
}
