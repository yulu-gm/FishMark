// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createSanitizedMermaidSvgFragment } from "./mermaid-preview-renderer";

describe("createSanitizedMermaidSvgFragment", () => {
  it("removes script tags and unsafe SVG attributes before insertion", () => {
    const fragment = createSanitizedMermaidSvgFragment(
      [
        '<svg viewBox="0 0 10 10">',
        '<script>alert("x")</script>',
        '<a href="javascript:alert(1)" onclick="alert(2)" data-safe="ok">',
        '<rect width="10" height="10" fill="red" onmouseover="alert(3)" />',
        "</a>",
        '<text xlink:href="javascript:alert(4)">Safe text</text>',
        "</svg>"
      ].join("")
    );
    const link = fragment.querySelector("a");
    const rect = fragment.querySelector("rect");
    const text = fragment.querySelector("text");

    expect(fragment.querySelector("script")).toBeNull();
    expect(link?.getAttribute("href")).toBeNull();
    expect(link?.getAttribute("onclick")).toBeNull();
    expect(link?.getAttribute("data-safe")).toBe("ok");
    expect(rect?.getAttribute("onmouseover")).toBeNull();
    expect(rect?.getAttribute("fill")).toBe("red");
    expect(text?.getAttribute("xlink:href")).toBeNull();
    expect(text?.textContent).toBe("Safe text");
  });
});
