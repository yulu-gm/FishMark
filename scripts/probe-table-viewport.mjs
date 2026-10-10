import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";
const require = createRequire(import.meta.url);
delete process.env.ELECTRON_RUN_AS_NODE;
process.exitCode = await runEditorBehaviorProcess({ command: require("electron"), args: [resolve("scripts/electron-table-viewport-main.cjs"), ...process.argv.slice(2)], options: { cwd: process.cwd(), windowsHide: true, env: { ...process.env }, stdio: "inherit" }, timeoutMs: 180000, timeoutExitCode: 124, onTimeout: () => process.stderr.write("Owned table viewport probe timeout\n") });
