export type RendererRuntimeMode = "editor" | "test-workbench";

type ResolveRuntimeModeInput = {
  readonly search: string;
  readonly bridgeMode?: RendererRuntimeMode;
};

export function resolveRuntimeMode(input: ResolveRuntimeModeInput): RendererRuntimeMode {
  const locationMode = new URLSearchParams(input.search).get("mode");

  if (locationMode === "test-workbench") {
    return "test-workbench";
  }

  if (locationMode === "editor") {
    return "editor";
  }

  return input.bridgeMode ?? "editor";
}
