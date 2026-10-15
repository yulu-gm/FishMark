import { describe, expect, it } from "vitest";
import { createPreviewAssetUrl } from "./preview-asset-url";

describe("hierarchical preview URLs", () => {
  it("preserves CSS relative font/import resolution and escaped path characters", () => {
    const css = createPreviewAssetUrl("C:/themes/a theme/ui.css");
    expect(css).toBe("fishmark-asset://preview/C%3A/themes/a%20theme/ui.css");
    expect(new URL("fonts/type.woff2", css).toString()).toBe("fishmark-asset://preview/C%3A/themes/a%20theme/fonts/type.woff2");
    expect(new URL("./base.css", css).toString()).toBe("fishmark-asset://preview/C%3A/themes/a%20theme/base.css");
    expect(createPreviewAssetUrl("//server/share/a#b.png")).toBe("fishmark-asset://preview/~unc//server/share/a%23b.png");
  });
});
