// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { createPreviewAssetUrl } from "../shared/preview-asset-url";
import {
  THEME_RUNTIME_ENV_CSS_VARS,
  THEME_RUNTIME_THEME_MODE_ATTRIBUTE
} from "../shared/theme-style-contract";
import { createThemePackageRuntime } from "./theme-package-runtime";
import { applyThemeRuntimeEnv, clearThemeRuntimeEnv } from "./theme-runtime-env";

describe("theme package runtime", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.documentElement.removeAttribute(THEME_RUNTIME_THEME_MODE_ATTRIBUTE);
    document.documentElement.style.removeProperty(THEME_RUNTIME_ENV_CSS_VARS.wordCount);
    document.documentElement.style.removeProperty(THEME_RUNTIME_ENV_CSS_VARS.focusMode);
    document.documentElement.style.removeProperty(THEME_RUNTIME_ENV_CSS_VARS.viewportWidth);
    document.documentElement.style.removeProperty(THEME_RUNTIME_ENV_CSS_VARS.viewportHeight);
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

  it("mounts theme links after existing base stylesheet nodes", () => {
    const baseStyle = document.createElement("style");
    baseStyle.dataset.testid = "base-style";
    baseStyle.textContent = ".base { color: red; }";
    document.head.appendChild(baseStyle);

    const runtime = createThemePackageRuntime(document);

    runtime.applyPackage(
      {
        id: "default",
        styles: {
          ui: createPreviewAssetUrl("/theme/ui.css"),
          markdown: createPreviewAssetUrl("/theme/markdown.css")
        },
        tokens: {
          dark: createPreviewAssetUrl("/theme/tokens-dark.css")
        }
      },
      "dark"
    );

    expect(Array.from(document.head.children).map((node) => node.getAttribute("data-testid") ?? node.tagName)).toEqual([
      "base-style",
      "LINK",
      "LINK",
      "LINK"
    ]);
    expect(
      Array.from(document.head.querySelectorAll("link[data-yulora-theme-part]")).map((node) =>
        node.getAttribute("href")
      )
    ).toEqual([
      createPreviewAssetUrl("/theme/tokens-dark.css"),
      createPreviewAssetUrl("/theme/ui.css"),
      createPreviewAssetUrl("/theme/markdown.css")
    ]);
  });

  it("applies runtime env CSS variables to the root element", () => {
    applyThemeRuntimeEnv(document.documentElement, {
      wordCount: 42,
      focusMode: 1,
      themeMode: "dark",
      viewport: {
        width: 1440,
        height: 900
      }
    });

    expect(document.documentElement.getAttribute(THEME_RUNTIME_THEME_MODE_ATTRIBUTE)).toBe("dark");
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.wordCount)).toBe(
      "42"
    );
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.focusMode)).toBe(
      "1"
    );
    expect(
      document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.viewportWidth)
    ).toBe("1440");
    expect(
      document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.viewportHeight)
    ).toBe("900");
  });

  it("clears runtime env CSS variables from the root element", () => {
    applyThemeRuntimeEnv(document.documentElement, {
      wordCount: 42,
      focusMode: 1,
      themeMode: "dark",
      viewport: {
        width: 1440,
        height: 900
      }
    });

    clearThemeRuntimeEnv(document.documentElement);

    expect(document.documentElement.getAttribute(THEME_RUNTIME_THEME_MODE_ATTRIBUTE)).toBeNull();
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.wordCount)).toBe(
      ""
    );
    expect(document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.focusMode)).toBe(
      ""
    );
    expect(
      document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.viewportWidth)
    ).toBe("");
    expect(
      document.documentElement.style.getPropertyValue(THEME_RUNTIME_ENV_CSS_VARS.viewportHeight)
    ).toBe("");
  });
});
