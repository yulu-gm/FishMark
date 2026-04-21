import { createPointerInteractionContext, createVerticalInteractionContext } from "./context";
import { codeFenceAdapter } from "./adapters/code-fence-adapter";
import { lineBlockAdapter } from "./adapters/line-block-adapter";
import { tableAdapter } from "./adapters/table-adapter";
import type { BlockInteractionAdapter } from "./types";

const adapters: readonly BlockInteractionAdapter[] = [tableAdapter, codeFenceAdapter, lineBlockAdapter];

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

export function resolveArrowUpAnchor(
  view: Parameters<typeof createVerticalInteractionContext>[0],
  activeState: Parameters<typeof createVerticalInteractionContext>[1]
): number | null {
  const context = createVerticalInteractionContext(view, activeState);

  for (const adapter of adapters) {
    const nextAnchor = adapter.resolveArrowUp?.(context);

    if (typeof nextAnchor === "number") {
      return nextAnchor;
    }
  }

  return null;
}

export function resolveArrowDownAnchor(
  view: Parameters<typeof createVerticalInteractionContext>[0],
  activeState: Parameters<typeof createVerticalInteractionContext>[1]
): number | null {
  const context = createVerticalInteractionContext(view, activeState);

  for (const adapter of adapters) {
    const nextAnchor = adapter.resolveArrowDown?.(context);

    if (typeof nextAnchor === "number") {
      return nextAnchor;
    }
  }

  return null;
}
