import { describe, expect, it } from "vitest";
import { resolvePreloadBridgeModeFromArgv } from "./preload-bridge-mode";

describe("explicit main-owned preload bridge mode", () => {
  it.each([[], ["--fishmark-runtime-mode=test-workbench"], ["--fishmark-preload-bridge-mode=unknown"], ["--fishmark-preload-bridge-mode=product"], ["--fishmark-preload-bridge-mode=editor-test", "--fishmark-preload-bridge-mode=product"]])("fails closed for absent, malformed, product or ambiguous arguments %j", (...argv: string[]) => {
    // Vitest spreads array cases; each row is one argv vector.
    expect(resolvePreloadBridgeModeFromArgv({ argv })).toBe("product");
  });
  it.each(["editor-test", "test-workbench"])("enables only explicit %s", (mode) => {
    expect(resolvePreloadBridgeModeFromArgv({ argv: [`--fishmark-preload-bridge-mode=${mode}`] })).toBe(mode);
  });
});
