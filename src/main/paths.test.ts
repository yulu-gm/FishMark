import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { resolveRendererEntry } from "./paths";

describe("resolveRendererEntry", () => {
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
