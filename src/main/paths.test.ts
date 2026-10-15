import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { resolveRendererEntry, resolveRendererPayloadDirectory } from "./paths";
import { readFileSync } from "node:fs";

describe("resolveRendererEntry", () => {
  it("uses one physical renderer payload root and unpacks exactly dist resources", () => {
    const appPath = path.resolve("resources/app.asar"); const moduleDir = path.join(appPath, "dist-electron/main");
    expect(resolveRendererPayloadDirectory({ appPath, moduleDir, isPackaged: true })).toBe(path.join(`${appPath}.unpacked`, "dist"));
    expect(resolveRendererPayloadDirectory({ appPath: path.resolve("app"), moduleDir, isPackaged: true })).toBe(path.resolve("app/dist"));
    expect(resolveRendererPayloadDirectory({ appPath, moduleDir: path.resolve("dist-electron/main"), isPackaged: false })).toBe(path.resolve("dist"));
    const configuration = JSON.parse(readFileSync(path.resolve("electron-builder.json"), "utf8"));
    expect(configuration.asarUnpack).toEqual(["dist/**/*"]);
  });
  it("prefers the dev server when provided", () => {
    expect(resolveRendererEntry("/tmp/dist", "http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:5173/"
    );
  });

  it("appends the workbench mode to the dev server url when requested", () => {
    expect(resolveRendererEntry("/tmp/dist", "http://127.0.0.1:5173", "test-workbench")).toBe(
      "http://127.0.0.1:5173/?mode=test-workbench"
    );
  });

  it("falls back to the built renderer html file url", () => {
    expect(resolveRendererEntry("/tmp/dist")).toBe(
      pathToFileURL(path.join("/tmp/dist", "index.html")).toString()
    );
  });

  it("appends the workbench mode to the built renderer file url", () => {
    const rendererUrl = pathToFileURL(path.join("/tmp/dist", "index.html"));
    rendererUrl.searchParams.set("mode", "test-workbench");

    expect(resolveRendererEntry("/tmp/dist", undefined, "test-workbench")).toBe(
      rendererUrl.toString()
    );
  });
});
