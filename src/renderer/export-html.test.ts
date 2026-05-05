// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  collectReadableStyleSheetText,
  createFishmarkExportHtml
} from "./export-html";

describe("createFishmarkExportHtml", () => {
  it("renders a standalone document with FishMark reading classes and inline CSS", () => {
    const html = createFishmarkExportHtml({
      markdown: [
        "# Title",
        "",
        "**bold** and `code`",
        "",
        "- item",
        "",
        "| A | B |",
        "| - | - |",
        "| 1 | 2 |"
      ].join("\n"),
      title: "note.md",
      cssText: ".document-editor .cm-line{line-height:1.85;}",
      rootAttributes: {
        colorScheme: "light",
        style: "--fishmark-document-font-size: 18px;",
        theme: "light"
      }
    });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<title>note.md</title>");
    expect(html).toContain(".document-editor .cm-line{line-height:1.85;}");
    expect(html).toContain("data-fishmark-theme=\"light\"");
    expect(html).toContain("color-scheme: light;");
    expect(html).toContain("--fishmark-document-font-size: 18px;");
    expect(html).toContain("cm-line cm-inactive-heading cm-inactive-heading-depth-1");
    expect(html).toContain("cm-inactive-heading-marker");
    expect(html).toContain("cm-inactive-inline-strong");
    expect(html).toContain("cm-inactive-inline-code");
    expect(html).toContain("cm-inactive-list cm-inactive-list-unordered");
    expect(html).toContain("cm-table-widget");
  });

  it("restores browser viewport scrolling when app shell CSS is inlined", () => {
    const html = createFishmarkExportHtml({
      markdown: "# Scrollable export",
      title: "scroll.md",
      cssText: "body { overflow: hidden; }",
      rootAttributes: {
        className: "fishmark-theme-root"
      }
    });

    expect(html).toContain('<html class="fishmark-theme-root fishmark-html-export-root"');
    expect(html).toContain(".fishmark-html-export-root");
    expect(html).toContain("overflow-y: auto;");
    expect(html).toContain("height: auto;");
  });

  it("marks structural source blank lines with the inactive blank-line reading class", () => {
    const html = createFishmarkExportHtml({
      markdown: ["Paragraph one", "", "Paragraph two"].join("\n"),
      title: "note.md"
    });

    expect(html).toContain('<div class="cm-line cm-inactive-blank-line"><br></div>');
  });

  it("exports only the first blank row in a block gap as the collapsed structural separator", () => {
    const html = createFishmarkExportHtml({
      markdown: ["Paragraph one", "", "", "Paragraph two"].join("\n"),
      title: "note.md"
    });

    expect(html.match(/class="cm-line cm-inactive-blank-line"/gu)).toHaveLength(1);
    expect(html).toContain('<div class="cm-line"><br></div>');
  });

  it("marks only the structural source blank row when exporting CRLF Markdown", () => {
    const html = createFishmarkExportHtml({
      markdown: ["Paragraph one", "", "", "Paragraph two"].join("\r\n"),
      title: "note.md"
    });

    expect(html.match(/class="cm-line cm-inactive-blank-line"/gu)).toHaveLength(1);
    expect(html).toContain('<div class="cm-line"><br></div>');
  });

  it("escapes title, Markdown text, and inline CSS terminators", () => {
    const html = createFishmarkExportHtml({
      markdown: "# 1 < 2 & 3",
      title: "unsafe </title><script>",
      cssText: ".x::before{content:\"</style><script>\";}"
    });

    expect(html).toContain("<title>unsafe &lt;/title&gt;&lt;script&gt;</title>");
    expect(html).toContain("1 &lt; 2 &amp; 3");
    expect(html).not.toContain("</style><script>");
  });
});

describe("collectReadableStyleSheetText", () => {
  it("collects accessible stylesheet rules from the active document", () => {
    const style = document.createElement("style");
    style.textContent = ".document-editor { color: red; }";
    document.head.appendChild(style);

    expect(collectReadableStyleSheetText(document)).toContain(".document-editor");

    style.remove();
  });
});
