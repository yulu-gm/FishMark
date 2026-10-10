import { createServer } from "vite";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { runEditorBehaviorProcess } from "./editor-behavior-process-launcher.mjs";
const root = process.cwd(), out = resolve(process.argv[2] ?? ""), variant = process.argv[3] ?? "baseline";
if (![3, 4, 5].includes(process.argv.length) || existsSync(out) || !["baseline", "prefix-box", "candidate"].includes(variant) || (process.argv[4] !== undefined && process.argv[4] !== "extra"))
    throw Error("Fresh output dir and known variant required");
mkdirSync(out, { recursive: true });
const files = ["src/renderer/styles/markdown-render.css", "src/renderer/styles/editor-source.css", "packages/codemirror-adapter/src/decorations/block-decorations.ts", "packages/codemirror-adapter/src/heading-marker-presentation.ts", "packages/codemirror-adapter/src/extensions/markdown.ts", "src/renderer/code-editor.ts"];
const identities = files.map(file => { const bytes = readFileSync(file), official = execFileSync("git", ["show", "1654e82cd28008cc4f6ae9adec04c5a4d56389ec:" + file]); const matchesMain = Buffer.from(bytes.toString().replaceAll("\r\n", "\n")).equals(official); if (!matchesMain && !(variant === "candidate" && [files[0], files[2]].includes(file)))
    throw Error("List main mismatch " + file); return { file, matchesMain, sha256: createHash("sha256").update(bytes).digest("hex") }; });
const runners = ["scripts/probe-list-caret.mjs", "scripts/list-caret-renderer.ts", "scripts/electron-list-caret-main.cjs", "scripts/capture-owned-list-caret.ps1", "scripts/analyze-list-caret.mjs", "scripts/probe-list-caret-baseline.mjs"];
const protocol = runners.map(file => ({ file, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") }));
for (const file of [...files, ...runners]) {
    const target = resolve(out, "source-snapshot", file);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, readFileSync(file), { flag: "wx" });
}
writeFileSync(resolve(out, "source-identity.json"), JSON.stringify({ main: "1654e82cd28008cc4f6ae9adec04c5a4d56389ec", checkpoint: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), productTransforms: 0, diagnosticStyleCounterfactual: variant, extra: process.argv[4] === "extra", identities, protocol }, null, 2));
const server = await createServer({ configFile: resolve("vite.config.ts"), server: { host: "localhost", port: 5198, strictPort: true, watch: null, hmr: false, fs: { allow: [root] } }, plugins: [{ name: "list-caret-diagnostic", configureServer(s) { s.middlewares.use((req, res, next) => { if (req.url?.split("?")[0] !== "/list-caret-diagnostic.html")
                return next(); res.setHeader("Content-Type", "text/html"); res.end(`<html><body><div id="probe-root"></div><script type="module" src="/@fs/${resolve("scripts/list-caret-renderer.ts").replaceAll("\\", "/")}"></script></body></html>`); }); } }], logLevel: "silent" });
delete process.env.ELECTRON_RUN_AS_NODE;
try {
    await server.listen();
    const require = createRequire(import.meta.url);
    process.exitCode = await runEditorBehaviorProcess({ command: require("electron"), args: [resolve("scripts/electron-list-caret-main.cjs"), out], options: { cwd: root, windowsHide: true, env: { ...process.env, FISHMARK_LIST_CARET_URL: "http://localhost:5198/list-caret-diagnostic.html?variant=" + variant + (process.argv[4] === "extra" ? "&extra=1" : "") }, stdio: "inherit" }, timeoutMs: 150000, timeoutExitCode: 124, onTimeout: () => process.stderr.write("Owned caret probe timeout\n") });
}
finally {
    await server.close();
}
