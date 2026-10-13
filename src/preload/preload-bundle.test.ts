import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";

import ts from "typescript";
import { build } from "vite";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { GET_PREFERENCES_CHANNEL, PREFERENCES_CHANGED_EVENT } from "../shared/preferences";
import type { ProductBridge } from "../shared/product-bridge";
import type { TestBridge } from "../shared/test-bridge";

const configFile = resolve(process.cwd(), "vite.preload.config.mjs");
let bundleCode: string;

beforeAll(async () => {
  const builds = await build({ configFile, logLevel: "silent", build: { write: false } });
  const result = Array.isArray(builds) ? builds[0] : builds;
  if (!result || !("output" in result)) throw new Error("Expected one preload build.");
  expect(result.output).toHaveLength(1);
  const entry = result.output[0];
  if (entry?.type !== "chunk") throw new Error("Expected a preload chunk.");
  expect(entry.fileName).toBe("preload.js");
  expect(entry.imports).toEqual(["electron"]);
  expect(entry.dynamicImports).toEqual([]);
  bundleCode = entry.code;
  const requires: Array<string | null> = [];
  const source = ts.createSourceFile("preload.js", bundleCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
      const argument = node.arguments[0];
      requires.push(node.arguments.length === 1 && argument && ts.isStringLiteral(argument) ? argument.text : null);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  expect(requires).toEqual(["electron"]);
}, 30_000);

describe("sandbox preload build", () => {
  it.each(["product", "editor-test", "test-workbench"] as const)("executes the %s bridge with only Electron's restricted runtime", async (mode) => {
    const { bridges, invoke, on, off, getPathForFile, requireModule } = runBundle([
      `--fishmark-runtime-mode=${mode === "test-workbench" ? mode : "editor"}`,
      `--fishmark-preload-bridge-mode=${mode}`,
      "--fishmark-startup-open-path=C%3A%2Fnotes%2Fhello%20world.md"
    ]);
    expect(requireModule.mock.calls).toEqual([["electron"]]);
    const product = bridges.get("fishmark") as ProductBridge;
    expect(product.platform).toBe("win32");
    expect(product.runtimeMode).toBe(mode === "test-workbench" ? mode : "editor");
    expect(product.startupOpenPath).toBe("C:/notes/hello world.md");
    expect(product).not.toHaveProperty("invoke");
    expect(product).not.toHaveProperty("ipcRenderer");
    expect(product).not.toHaveProperty("startScenarioRun");
    await product.getPreferences();
    expect(invoke).toHaveBeenCalledWith(GET_PREFERENCES_CHANNEL);
    const file = {} as File;
    expect(product.getPathForDroppedFile(file)).toBe("C:/notes/dropped.md");
    expect(getPathForFile).toHaveBeenCalledWith(file);

    const listener = vi.fn();
    const unsubscribe = product.onPreferencesChanged(listener);
    const [channel, callback] = on.mock.calls[0]!;
    const payload = { test: true };
    callback({ sender: "must not cross bridge" }, payload);
    expect(channel).toBe(PREFERENCES_CHANGED_EVENT);
    expect(listener.mock.calls).toEqual([[payload]]);
    unsubscribe();
    expect(off).toHaveBeenCalledWith(channel, callback);

    if (mode === "product") {
      expect([...bridges.keys()]).toEqual(["fishmark"]);
    } else {
      const test = bridges.get("fishmarkTest") as TestBridge;
      expect([...bridges.keys()]).toEqual(["fishmark", "fishmarkTest"]);
      await test.openEditorTestWindow();
      expect(invoke).toHaveBeenCalledWith("fishmark:open-editor-test-window");
    }
  });

  it.each([
    ["--fishmark-runtime-mode=test-workbench"],
    ["--fishmark-preload-bridge-mode=unknown"],
    ["--fishmark-preload-bridge-mode=editor-test", "--fishmark-preload-bridge-mode=test-workbench"]
  ])("fails closed for absent, unknown or conflicting bridge arguments: %j", (...argv) => {
    expect([...runBundle(argv).bridges.keys()]).toEqual(["fishmark"]);
  });

  it("rejects privileged Node imports instead of silently bundling browser shims", async () => {
    const temporaryRoot = await realpath(tmpdir());
    const directory = await mkdtemp(resolve(temporaryRoot, "fishmark-preload-contract-"));
    try {
      const entry = resolve(directory, "unsafe.ts");
      await writeFile(entry, 'import { readFileSync } from "node:fs"; readFileSync("secret");');
      await expect(build({
        configFile,
        logLevel: "silent",
        build: { write: false, lib: { entry, formats: ["cjs"], fileName: () => "preload.js" } }
      })).rejects.toThrow("Sandbox preload cannot import node:fs");
    } finally {
      await removeOwnedDirectory(directory, temporaryRoot);
    }
  });

  it.each(["tsconfig.electron.json", "tsconfig.electron.watch.json"])("keeps %s from emitting over the bundled preload", (configName) => {
    const configPath = resolve(process.cwd(), configName);
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
    expect(config.error).toBeUndefined();
    expect(parsed.errors).toEqual([]);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const outputs: string[] = [];
    program.emit(undefined, (fileName) => outputs.push(fileName.replaceAll("\\", "/")));
    expect(outputs.some((name) => name.endsWith("/main/main.js"))).toBe(true);
    expect(outputs.some((name) => name.includes("/preload/"))).toBe(false);
  }, 30_000);

  it("wires build, dev watch and packaging to the same bundled preload", async () => {
    const manifest = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8"));
    for (const script of ["build:electron", "dev:prepare"]) {
      expect(manifest.scripts[script]).toContain("npm run build:preload");
    }
    for (const script of ["dev", "dev:test-workbench"]) {
      expect(manifest.scripts[script]).toContain('"npm:dev:preload"');
    }
    expect(manifest.scripts["dev:preload"]).toBe("vite build --config vite.preload.config.mjs --watch");
    for (const script of ["dev:electron", "dev:electron:test-workbench"]) {
      expect(manifest.scripts[script]).toContain("wait-on ");
      expect(manifest.scripts[script]).toContain("dist-electron/preload/preload.js");
    }
    expect(manifest.scripts.typecheck).toContain("tsc -p tsconfig.preload.json");
    const builder = JSON.parse(await readFile(resolve(process.cwd(), "electron-builder.json"), "utf8"));
    expect(builder.files).toContain("dist-electron/**/*");
    for (const script of ["package:mac", "package:win", "release:mac", "release:win"]) {
      expect(manifest.scripts[script]).toContain("npm run build");
    }
  });
});

async function removeOwnedDirectory(directory: string, temporaryRoot: string) {
  const target = await realpath(directory);
  if (target !== resolve(directory) || dirname(target) !== temporaryRoot || !basename(target).startsWith("fishmark-preload-contract-")) {
    throw new Error("Refusing preload test cleanup outside its owned temporary directory.");
  }
  await rm(target, { recursive: true, force: true });
}

function runBundle(argv: string[]) {
  const bridges = new Map<string, ProductBridge | TestBridge>();
  const invoke = vi.fn(async () => undefined);
  const on = vi.fn<(channel: string, listener: (event: unknown, payload: unknown) => void) => void>();
  const off = vi.fn();
  const getPathForFile = vi.fn(() => "C:/notes/dropped.md");
  const requireModule = vi.fn((id: string) => {
    if (id !== "electron") throw new Error(`Sandbox cannot require ${id}`);
    return {
      contextBridge: { exposeInMainWorld: (name: string, api: ProductBridge | TestBridge) => bridges.set(name, api) },
      ipcRenderer: { invoke, on, off },
      webUtils: { getPathForFile }
    };
  });
  runInNewContext(bundleCode, { require: requireModule, process: { argv, platform: "win32" } });
  return { bridges, invoke, on, off, getPathForFile, requireModule };
}
