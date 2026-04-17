import { describe, expect, it } from "vitest";

import {
  resolveThemeDynamicAggregateMode,
  shouldWarnForThemeDynamicFallback
} from "./theme-dynamic-mode";

describe("theme dynamic mode aggregation", () => {
  it("reports a healthy workbench plus broken titlebar as partial-fallback", () => {
    expect(
      resolveThemeDynamicAggregateMode({
        workbench: {
          active: true,
          mode: "full"
        },
        titlebar: {
          active: true,
          mode: "fallback"
        }
      })
    ).toBe("partial-fallback");
    expect(shouldWarnForThemeDynamicFallback("partial-fallback")).toBe(false);
  });

  it("treats a fallback surface plus a pending active surface as partial-fallback", () => {
    expect(
      resolveThemeDynamicAggregateMode({
        workbench: {
          active: true,
          mode: "fallback"
        },
        titlebar: {
          active: true,
          mode: null
        }
      })
    ).toBe("partial-fallback");
  });

  it("only warns when every active dynamic surface has fallen back", () => {
    expect(
      resolveThemeDynamicAggregateMode({
        workbench: {
          active: true,
          mode: "fallback"
        },
        titlebar: {
          active: true,
          mode: "fallback"
        }
      })
    ).toBe("fallback");
    expect(shouldWarnForThemeDynamicFallback("fallback")).toBe(true);
  });

  it("keeps mixed non-fallback modes distinct from failure states", () => {
    expect(
      resolveThemeDynamicAggregateMode({
        workbench: {
          active: true,
          mode: "reduced"
        },
        titlebar: {
          active: true,
          mode: "full"
        }
      })
    ).toBe("full");
    expect(
      resolveThemeDynamicAggregateMode({
        workbench: {
          active: true,
          mode: "reduced"
        },
        titlebar: {
          active: true,
          mode: "reduced"
        }
      })
    ).toBe("reduced");
  });
});
