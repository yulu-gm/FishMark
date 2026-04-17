// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { createPreviewAssetUrl } from "../shared/preview-asset-url";
import { createThemePackageRuntime } from "./theme-package-runtime";

describe("theme package runtime", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("mounts tokens, ui, titlebar, editor, and markdown links in stable order", () => {
    const runtime = createThemePackageRuntime(document);

    runtime.applyPackage(
      {
        id: "rain-glass",
        styles: {
          ui: createPreviewAssetUrl("/theme/ui.css"),
          titlebar: createPreviewAssetUrl("/theme/titlebar.css"),
          editor: createPreviewAssetUrl("/theme/editor.css")
        },
        tokens: {
          dark: createPreviewAssetUrl("/theme/tokens-dark.css")
        }
      },
      "dark"
    );

    expect(
      Array.from(document.head.querySelectorAll("link[data-yulora-theme-part]")).map((node) =>
        node.getAttribute("href")
      )
    ).toEqual([
      createPreviewAssetUrl("/theme/tokens-dark.css"),
      createPreviewAssetUrl("/theme/ui.css"),
      createPreviewAssetUrl("/theme/titlebar.css"),
      createPreviewAssetUrl("/theme/editor.css")
    ]);
  });
});
