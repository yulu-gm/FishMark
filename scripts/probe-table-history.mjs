import { createServer } from "vite";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), route = process.argv[2], out = resolve(process.argv[3] ?? "");
if (!["native-cell", "document-history"].includes(route) || process.argv.length !== 4) throw new Error("Usage: node scripts/probe-table-history.mjs native-cell|document-history FRESH_OUTPUT_DIR");
if (existsSync(out)) throw new Error("Fresh output directory required");
mkdirSync(out, { recursive: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const baseline = "1654e82cd28008cc4f6ae9adec04c5a4d56389ec";
const files = ["src/renderer/code-editor.ts", "packages/codemirror-adapter/src/extensions/markdown.ts", "packages/codemirror-adapter/src/decorations/table-widget.ts",
  "packages/codemirror-adapter/src/table-commands.ts", "packages/codemirror-adapter/src/transaction-adapter.ts", "packages/editor-model/src/commands/table.ts", "packages/markdown-engine/src/format-table-markdown.ts"];
const identity = files.map((file) => {
  const expected = execFileSync("git", ["show", `${baseline}:${file}`], { cwd: root }), actual = readFileSync(resolve(root, file));
  const normalized = Buffer.from(actual.toString().replaceAll("\r\n", "\n"));
  if (!normalized.equals(expected)) throw new Error("Published product source mismatch " + file);
  return { file, publishedSha256: hash(expected), normalizedWorkingSha256: hash(normalized), workingByteSha256: hash(actual) };
});
writeFileSync(resolve(out, "source-identity.json"), JSON.stringify({ baseline, route, phaseTiming: "off", productTransforms: 0, files: identity,
  scripts: ["scripts/probe-table-history.mjs", "scripts/table-history-renderer.ts", "scripts/electron-table-history-main.cjs"].map((file) => ({ file, sha256: hash(readFileSync(resolve(root, file))) })) }, null, 2), { flag: "wx" });
const port = 5199;
const server = await createServer({ configFile: resolve(root, "vite.config.ts"), server: { host: "localhost", port, strictPort: true, watch: null, hmr: false, fs: { allow: [root] } }, logLevel: "silent",
  plugins: [{ name: "isolated-table-history-html", configureServer(vite) { vite.middlewares.use((req, res, next) => {
    if (req.url !== "/table-history-diagnostic.html") return next();
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><html><head><title>FishMark table history diagnostic</title></head><body><div id="probe-root"></div><script type="module" src="/@fs/${resolve(root, "scripts/table-history-renderer.ts").replaceAll("\\", "/")}"></script></body></html>`);
  }); } }] });
try {
  await server.listen();
  const require = createRequire(import.meta.url);
  process.exitCode = await runEditorBehaviorProcess({ command: require("electron"), args: [resolve(root, "scripts/electron-table-history-main.cjs"), route, out],
    options: { cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, FISHMARK_TABLE_HISTORY_URL: `http://localhost:${port}/table-history-diagnostic.html` } },
    timeoutMs: 90000, timeoutExitCode: 124, onTimeout: () => process.stderr.write("Table history diagnostic timed out\n") });
} finally { await server.close(); }
