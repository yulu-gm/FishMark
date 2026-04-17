// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  THEME_PARTS,
  createThemeRuntime,
  resolveBuiltinThemeDescriptor
} from "./theme-runtime";

describe("theme runtime", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("mounts theme parts in the expected order and swaps hrefs in place", () => {
    const runtime = createThemeRuntime(document);

    runtime.applyTheme({
      id: "graphite-dark",
      source: "community",
      partUrls: {
        markdown: "file:///themes/graphite-dark/markdown.css",
        tokens: "file:///themes/graphite-dark/tokens.css",
        ui: "file:///themes/graphite-dark/ui.css"
      }
    });

    const initialLinks = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[data-yulora-theme-part]')
    );

    expect(initialLinks.map((node) => node.dataset.yuloraThemePart)).toEqual([
      "tokens",
      "ui",
      "markdown"
    ]);
    expect(initialLinks.map((node) => node.getAttribute("href"))).toEqual([
      "file:///themes/graphite-dark/tokens.css",
      "file:///themes/graphite-dark/ui.css",
      "file:///themes/graphite-dark/markdown.css"
    ]);

    runtime.applyTheme({
      id: "graphite-light",
      source: "community",
      partUrls: {
        tokens: "file:///themes/graphite-light/tokens.css",
        editor: "file:///themes/graphite-light/editor.css"
      }
    });

    const updatedLinks = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[data-yulora-theme-part]')
    );

    expect(updatedLinks.map((node) => node.dataset.yuloraThemePart)).toEqual(["tokens", "editor"]);
    expect(updatedLinks.map((node) => node.getAttribute("href"))).toEqual([
      "file:///themes/graphite-light/tokens.css",
      "file:///themes/graphite-light/editor.css"
    ]);
  });

  it("clears all mounted theme links", () => {
    const runtime = createThemeRuntime(document);

    runtime.applyTheme({
      id: "graphite-dark",
      source: "community",
      partUrls: {
        tokens: "file:///themes/graphite-dark/tokens.css",
        ui: "file:///themes/graphite-dark/ui.css",
        editor: "file:///themes/graphite-dark/editor.css",
        markdown: "file:///themes/graphite-dark/markdown.css"
      }
    });

    runtime.clear();

    expect(document.head.querySelector('link[data-yulora-theme-part]')).toBeNull();
  });

  it("provides builtin descriptors for the default themes", () => {
    const lightDescriptor = resolveBuiltinThemeDescriptor("light");
    const darkDescriptor = resolveBuiltinThemeDescriptor("dark");

    expect(lightDescriptor?.source).toBe("builtin");
    expect(darkDescriptor?.source).toBe("builtin");

    for (const descriptor of [lightDescriptor, darkDescriptor]) {
      expect(descriptor).not.toBeNull();
      expect(Object.keys(descriptor?.partUrls ?? {})).toEqual(THEME_PARTS);
      for (const part of THEME_PARTS) {
        expect(descriptor?.partUrls[part]).toMatch(/\.css$/);
      }
    }

    expect(lightDescriptor.partUrls.tokens).toContain("/styles/themes/default/light/tokens.css");
    expect(darkDescriptor.partUrls.tokens).toContain("/styles/themes/default/dark/tokens.css");
  });
});
