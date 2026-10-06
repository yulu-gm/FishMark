export const PRELOAD_BRIDGE_MODE_ARGUMENT_PREFIX = "--fishmark-preload-bridge-mode=";

export type PreloadBridgeMode = "product" | "editor-test" | "test-workbench";

export function resolvePreloadBridgeModeFromArgv(input: {
  argv: string[];
}): PreloadBridgeMode {
  const bridgeArguments = input.argv.filter((entry) =>
    entry.startsWith(PRELOAD_BRIDGE_MODE_ARGUMENT_PREFIX)
  );
  if (bridgeArguments.length !== 1) return "product";
  const bridgeValue = bridgeArguments[0]?.slice(PRELOAD_BRIDGE_MODE_ARGUMENT_PREFIX.length);

  if (bridgeValue === "editor-test" || bridgeValue === "test-workbench") {
    return bridgeValue;
  }

  return "product";
}
