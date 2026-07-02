import { describe, expect, it } from "vitest";

import { detectDraftSyntax } from "./draft-syntax";

describe("draft-syntax", () => {
  it("detects top-level code fence openers", () => {
    expect(detectDraftSyntax("```ts")).toEqual({
      type: "codeFenceOpener",
      containerPrefix: "",
      contentPrefix: "",
      indent: "",
      fence: "```",
      info: "ts"
    });
  });

  it("detects blockquote-contained code fence openers", () => {
    expect(detectDraftSyntax("> ```ts")).toEqual({
      type: "codeFenceOpener",
      containerPrefix: "> ",
      contentPrefix: "> ",
      indent: "",
      fence: "```",
      info: "ts"
    });
  });

  it("detects nested blockquote-contained code fence openers", () => {
    expect(detectDraftSyntax("> > ```ts")).toEqual({
      type: "codeFenceOpener",
      containerPrefix: "> > ",
      contentPrefix: "> > ",
      indent: "",
      fence: "```",
      info: "ts"
    });
  });

  it("detects nested blockquote marker drafts after stripping the outer container", () => {
    expect(detectDraftSyntax("> >")).toEqual({
      type: "blockquoteMarker",
      containerPrefix: "> ",
      committedPrefix: "> > "
    });
  });

  it("detects bare and no-padding blockquote marker drafts", () => {
    expect(detectDraftSyntax(">")).toEqual({
      type: "blockquoteMarker",
      containerPrefix: "",
      committedPrefix: "> "
    });
    expect(detectDraftSyntax(">>")).toEqual({
      type: "blockquoteMarker",
      containerPrefix: ">",
      committedPrefix: ">> "
    });
  });

  it("detects blockquote-contained list marker drafts", () => {
    expect(detectDraftSyntax("> - ")).toEqual({
      type: "listMarker",
      containerPrefix: "> ",
      contentPrefix: "> ",
      indent: "",
      marker: "-",
      task: null
    });
  });

  it("detects nested blockquote-contained list marker drafts", () => {
    expect(detectDraftSyntax("> > - ")).toEqual({
      type: "listMarker",
      containerPrefix: "> > ",
      contentPrefix: "> > ",
      indent: "",
      marker: "-",
      task: null
    });
  });

  it("detects table header drafts", () => {
    expect(detectDraftSyntax("| name | qty |")).toEqual({
      type: "tableHeader",
      containerPrefix: "",
      cells: ["name", "qty"]
    });
  });

  it("detects nested blockquote-contained table header drafts", () => {
    expect(detectDraftSyntax("> > | name | qty |")).toEqual({
      type: "tableHeader",
      containerPrefix: "> > ",
      cells: ["name", "qty"]
    });
  });

  it("does not treat one-pipe prose as a table header draft", () => {
    expect(detectDraftSyntax("name | qty")).toBeNull();
  });
});
