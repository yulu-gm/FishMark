import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { build, createServer } from "vite";
import react from "@vitejs/plugin-react";
import { describe, expect, it } from "vitest";
import { createRendererCspPlugin, PRODUCTION_RENDERER_CSP } from "../../scripts/vite-renderer-csp";

const sourcePath = resolve(process.cwd(), "src/renderer/index.html");
const configFile = resolve(process.cwd(), "vite.config.ts");
const policyOf = (html: string) => /http-equiv="Content-Security-Policy" content="([^"]+)"/u.exec(html)?.[1];
const inlineScripts = (html: string) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)]
  .filter((script) => !/\bsrc=/iu.test(script[1] ?? "")).map((script) => script[2] ?? "");
const hash = (text: string) => createHash("sha256").update(text).digest("base64");

function expectEarlyPolicy(html: string) {
  const policyIndex = html.indexOf('<meta http-equiv="Content-Security-Policy"');
  expect(policyIndex).toBeGreaterThan(html.indexOf("<head>"));
  for (const tag of html.matchAll(/<(?:script|link|style)\b/giu)) expect(policyIndex).toBeLessThan(tag.index!);
  expect([...html.matchAll(/http-equiv="Content-Security-Policy"/gu)]).toHaveLength(1);
}

describe("renderer CSP", () => {
  it("keeps the source policy exact and before any executable/resource tag", async () => {
    const html = await readFile(sourcePath, "utf8");
    expect(policyOf(html)).toBe(PRODUCTION_RENDERER_CSP);
    expectEarlyPolicy(html);
    const directives = Object.fromEntries(PRODUCTION_RENDERER_CSP.split("; ").map((value) => {
      const [directive, ...sources] = value.split(" ");
      return [directive, sources];
    }));
    expect(directives["script-src"]).toEqual(["'self'"]);
    expect(directives["script-src-attr"]).toEqual(["'none'"]);
    expect(directives["connect-src"]).toEqual(["fishmark-asset://preview"]);
    expect(PRODUCTION_RENDERER_CSP).not.toMatch(/unsafe-eval|nonce-|sha256-|ws:|localhost|\*/u);
  });

  it("emits the production policy ahead of generated lazy-module and stylesheet links", async () => {
    const temporaryRoot = await realpath(tmpdir());
    const directory = await mkdtemp(resolve(temporaryRoot, "fishmark-csp-build-"));
    try {
      const html = (await readFile(sourcePath, "utf8")).replace("./main.tsx", "./main.js");
      await writeFile(resolve(directory, "index.html"), html);
      await writeFile(resolve(directory, "main.js"), 'import "./style.css"; window.loadLazy = () => import("./lazy.js");');
      await writeFile(resolve(directory, "lazy.js"), "export const lazy = true;");
      await writeFile(resolve(directory, "style.css"), "body { color: red; }");
      const builds = await build({ configFile: false, root: directory, logLevel: "silent", plugins: [createRendererCspPlugin()], build: { write: false } });
      const output = Array.isArray(builds) ? builds[0] : builds;
      if (!output || !("output" in output)) throw new Error("Expected a production build.");
      const asset = output.output.find((entry) => entry.fileName === "index.html");
      if (asset?.type !== "asset") throw new Error("Expected a built renderer HTML entry.");
      const builtHtml = String(asset.source);
      expect(policyOf(builtHtml)).toBe(PRODUCTION_RENDERER_CSP);
      expectEarlyPolicy(builtHtml);
      expect(inlineScripts(builtHtml)).toEqual([]);
      expect(output.output.some((entry) => entry.type === "chunk" && entry.isDynamicEntry)).toBe(true);
    } finally { await removeOwnedDirectory(directory, temporaryRoot); }
  });

  it.each([5173, 5174])("uses actual dev port %i and only the trusted React preamble hash", async (port) => {
    const server = await createServer({ configFile, logLevel: "silent", server: { port }, optimizeDeps: { noDiscovery: true, entries: [] } });
    try {
      const source = await readFile(sourcePath, "utf8");
      const malicious = 'window.__untrustedInline = "must stay blocked";';
      const html = await server.transformIndexHtml("/index.html", source.replace("</body>", `<script>${malicious}</script></body>`));
      const expectedPreamble = react.preambleCode.replace("__BASE__", server.config.base);
      expect(inlineScripts(html)).toContain(expectedPreamble);
      expect(inlineScripts(html)).toContain(malicious);
      const expectedPolicy = PRODUCTION_RENDERER_CSP.replace("script-src 'self'", `script-src 'self' 'sha256-${hash(expectedPreamble)}'`)
        .replace("connect-src fishmark-asset://preview", `connect-src fishmark-asset://preview 'self' ws://localhost:${port}`);
      expect(policyOf(html)).toBe(expectedPolicy);
      expect(policyOf(html)).not.toContain(hash(malicious));
      expectEarlyPolicy(html);
      const independent = await server.transformIndexHtml("/independent-probe.html", "<html><head></head><body><script>probe()</script></body></html>");
      expect(policyOf(independent)).toBeUndefined();
    } finally { await server.close(); }
  });

  it("rejects missing or changed policy and unexpected React preamble bytes", async () => {
    let corruptRefresh = false;
    const server = await createServer({ configFile, logLevel: "silent", optimizeDeps: { noDiscovery: true, entries: [] },
      plugins: [{ name: "test-corrupt-refresh", enforce: "pre", transformIndexHtml: { order: "post", handler(html) {
        return corruptRefresh ? html.replace(react.preambleCode.replace("__BASE__", "/"), "changed refresh preamble") : html;
      } } }] });
    try {
      const source = await readFile(sourcePath, "utf8");
      await expect(server.transformIndexHtml("/index.html", source.replace(PRODUCTION_RENDERER_CSP, "default-src *"))).rejects.toThrow("exactly one unchanged production CSP");
      await expect(server.transformIndexHtml("/index.html", source.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/u, ""))).rejects.toThrow("exactly one unchanged production CSP");
      const meta = /<meta http-equiv="Content-Security-Policy"[^>]*>/u.exec(source)![0];
      await expect(server.transformIndexHtml("/index.html", source.replace("<head>", `<head>${meta}`))).rejects.toThrow("exactly one unchanged production CSP");
      corruptRefresh = true;
      await expect(server.transformIndexHtml("/index.html", source)).rejects.toThrow("differs from its trusted CSP hash input");
    } finally { await server.close(); }
  });

  it("does not grant a refresh hash or WebSocket when HMR is disabled", async () => {
    const server = await createServer({ configFile, logLevel: "silent", server: { hmr: false }, optimizeDeps: { noDiscovery: true, entries: [] } });
    try {
      const html = await server.transformIndexHtml("/index.html", await readFile(sourcePath, "utf8"));
      expect(policyOf(html)).toBe(PRODUCTION_RENDERER_CSP.replace("connect-src fishmark-asset://preview", "connect-src fishmark-asset://preview 'self'"));
      expect(inlineScripts(html)).toEqual([]);
      expectEarlyPolicy(html);
    } finally { await server.close(); }
  });

  it("rejects a different HMR host instead of adding broad WebSocket sources", async () => {
    const server = await createServer({ configFile, logLevel: "silent", server: { hmr: { host: "different.invalid" } }, optimizeDeps: { noDiscovery: true, entries: [] } });
    try {
      await expect(server.transformIndexHtml("/index.html", await readFile(sourcePath, "utf8"))).rejects.toThrow("configured localhost WebSocket");
    } finally { await server.close(); }
  });
});

async function removeOwnedDirectory(directory: string, temporaryRoot: string) {
  const target = await realpath(directory);
  if (target !== resolve(directory) || dirname(target) !== temporaryRoot || !basename(target).startsWith("fishmark-csp-build-")) {
    throw new Error("Refusing CSP test cleanup outside its owned temporary directory.");
  }
  await rm(target, { recursive: true, force: true });
}
