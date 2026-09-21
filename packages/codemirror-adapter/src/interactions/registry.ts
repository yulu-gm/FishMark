import { createPointerInteractionContext, createVerticalInteractionContext } from "./context";
import { codeFenceAdapter } from "./adapters/code-fence-adapter";
import { lineBlockAdapter } from "./adapters/line-block-adapter";
import { tableAdapter } from "./adapters/table-adapter";
import type { BlockInteractionAdapter, VerticalNavigationResult } from "./types";

const adapters: readonly BlockInteractionAdapter[] = [tableAdapter, codeFenceAdapter, lineBlockAdapter];

function normalizeAdapterResult(
  result: VerticalNavigationResult | number | null
): VerticalNavigationResult | null {
  if (result === null) {
    return null;
  }

  if (typeof result === "number") {
    return { anchor: result, goalColumn: undefined };
  }

  return result;
}

export function resolvePointerSelectionAnchor(
  view: Parameters<typeof createPointerInteractionContext>[0],
  activeState: Parameters<typeof createPointerInteractionContext>[1],
  event: Parameters<typeof createPointerInteractionContext>[2]
): number | null {
  const context = createPointerInteractionContext(view, activeState, event);

  if (!context) {
    return null;
  }

  for (const adapter of adapters) {
    const nextAnchor = adapter.resolvePointerSelection?.(context);

    if (typeof nextAnchor === "number") {
      return nextAnchor;
    }
  }

  return null;
}

export function resolveArrowUp(
  view: Parameters<typeof createVerticalInteractionContext>[0],
  activeState: Parameters<typeof createVerticalInteractionContext>[1],
  goalColumn?: number
): VerticalNavigationResult | null {
  const context = createVerticalInteractionContext(view, activeState, goalColumn);

  for (const adapter of adapters) {
    const result = normalizeAdapterResult(adapter.resolveArrowUp?.(context) ?? null);

    if (result) {
      return result;
    }
  }

  return null;
}

export function resolveArrowDown(
  view: Parameters<typeof createVerticalInteractionContext>[0],
  activeState: Parameters<typeof createVerticalInteractionContext>[1],
  goalColumn?: number
): VerticalNavigationResult | null {
  const context = createVerticalInteractionContext(view, activeState, goalColumn);

  for (const adapter of adapters) {
    const result = normalizeAdapterResult(adapter.resolveArrowDown?.(context) ?? null);

    if (result) {
      return result;
    }
  }

  return null;
}
