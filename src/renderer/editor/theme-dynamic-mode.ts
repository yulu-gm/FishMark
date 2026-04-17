import type { ThemeSurfaceRuntimeMode } from "../shader/theme-surface-runtime";

export type ThemeDynamicAggregateMode =
  | "off"
  | "full"
  | "reduced"
  | "partial-fallback"
  | "fallback";

type ThemeDynamicSurfaceState = {
  active: boolean;
  mode: ThemeSurfaceRuntimeMode | null;
};

type ThemeDynamicSurfaceStates = {
  workbench: ThemeDynamicSurfaceState;
  titlebar: ThemeDynamicSurfaceState;
};

function collectActiveSurfaceStates(input: ThemeDynamicSurfaceStates): ThemeDynamicSurfaceState[] {
  return [input.workbench, input.titlebar].filter((surface) => surface.active);
}

export function resolveThemeDynamicAggregateMode(
  input: ThemeDynamicSurfaceStates
): ThemeDynamicAggregateMode {
  const activeStates = collectActiveSurfaceStates(input);
  const reportedModes = activeStates
    .map((surface) => surface.mode)
    .filter((mode): mode is ThemeSurfaceRuntimeMode => mode !== null);

  if (activeStates.length === 0 || reportedModes.length === 0) {
    return "off";
  }

  if (reportedModes.every((mode) => mode === "fallback")) {
    return activeStates.every((surface) => surface.mode === "fallback") ? "fallback" : "partial-fallback";
  }

  if (reportedModes.some((mode) => mode === "fallback")) {
    return "partial-fallback";
  }

  if (reportedModes.some((mode) => mode === "full")) {
    return "full";
  }

  return "reduced";
}

export function shouldWarnForThemeDynamicFallback(mode: ThemeDynamicAggregateMode): boolean {
  return mode === "fallback";
}
