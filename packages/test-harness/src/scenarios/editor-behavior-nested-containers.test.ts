import { describe, expect, it } from "vitest";
import { micromark, parse, postprocess, preprocess } from "micromark";
import { createDocumentStructureCache } from "@fishmark/markdown-engine";
import { createEditorDerivedSnapshotFromCache } from "@fishmark/editor-model";

import {
  focusedRecursiveCases,
  recursiveParityMatrixCases,
  representativeDepthCases,
  requiredEditorBehaviorContainerPaths
} from "../../../../fixtures/editor-behavior/nested-containers";
import { formatContainerPath } from "../../../../fixtures/editor-behavior/model";
import { namedFishMarkProbeCases } from "../../../../fixtures/editor-behavior/probe-cases";

describe("recursive editor behavior contracts", () => {
  it("authors single-quote separators using the established production Enter source contract", () => {
    // Existing code-editor contract: '> quote' Enter -> '> quote\n>\n> '.
    // This checks fixture authoring independently of the current command implementation.
    const behaviorCase = recursiveParityMatrixCases.find(({ id }) => id === "matrix-enter-path-4")!;
    const [primary, repeat] = behaviorCase.checkpoints;
    expect(primary.result.source).toBe("> al\n>\n> pha");
    expect(primary.result.selection).toEqual({ anchor: 9, head: 9 });
    expect(repeat.result.source).toBe("> al\n>\n> \n>\n> pha");
    expect(repeat.result.selection).toEqual({ anchor: 14, head: 14 });
    expect(primary.result.visibleLines[1]!.geometry).toEqual({ semanticDepth: 1, contentColumn: 1, markerColumn: 0, visibility: "collapsed" });
    expect(repeat.result.visibleLines.slice(1, 4).map(({ geometry }) => geometry.visibility)).toEqual(["collapsed", "collapsed", "collapsed"]);
    expect(behaviorCase.classification.contractReferences.some(({ kind }) => kind === "typora-oracle")).toBe(false);
  });

  it("authors repeat Enter as the existing empty nested quote pair outdent", () => {
    // The named probe captured the first Enter only. The repeat follows the
    // pre-refactor exitTrailingBlockquoteSeparatorPair contract, not a Typora capture.
    const behaviorCase = namedFishMarkProbeCases.find(({ id }) => id === "nested-blockquote-marker-commits-after-enter")!;
    const repeat = behaviorCase.checkpoints[1].result;
    expect(repeat.source).toBe(">\n> ");
    expect(repeat.selection).toEqual({ anchor: 4, head: 4 });
    expect(repeat.visibleLines.map(({ role }) => role)).toEqual(["structural-separator", "structural-separator"]);
    expect(repeat.visibleLines.map(({ geometry }) => geometry.visibility)).toEqual(["collapsed", "visible"]);
    expect(behaviorCase.classification.contractReferences.some(({ kind }) => kind === "typora-oracle")).toBe(false);
  });

  it.each([
    { depth: 5, source: "> - [ ] task\n>   > - [ ] task\n>   >   > leaf", columns: [[2, 8, 2], [4, 12, 6], [5, 10, 8]] },
    { depth: 8, source: "> - [ ] task\n>   > - [ ] task\n>   >   > - [ ] task\n>   >   >   > - [ ] leaf", columns: [[2, 8, 2], [4, 12, 6], [6, 16, 10], [8, 20, 14]] }
  ])("expresses depth $depth task containers as independently valid Markdown", ({ depth, source, columns }) => {
    const behaviorCase = representativeDepthCases.find(({ containerDepth }) => containerDepth === depth)!;
    expect(behaviorCase.initial.source).toBe(source);
    const leafStart = source.indexOf("leaf");
    // Independent micromark block events establish syntax ownership. These
    // fixtures contain exactly one item per list, also checked in rendered HTML.
    const events = postprocess(parse().document().write(preprocess()(source, undefined, true)));
    const path = ["Document", ...events.flatMap(([event, token]) => {
      if (event !== "enter" || token.start.offset! > leafStart || token.end.offset! < leafStart + 4) return [];
      if (token.type === "blockQuote") return ["Blockquote"];
      if (token.type === "listUnordered") return ["List", "ListItem"];
      return token.type === "paragraph" ? ["Paragraph"] : [];
    })];
    expect(path).toEqual(behaviorCase.containerPath);
    expect(micromark(source).match(/<li>/gu)).toHaveLength(Math.floor(depth / 2));
    expect(source.match(/\[ \]/gu)).toHaveLength(Math.floor(depth / 2));
    for (const checkpoint of behaviorCase.checkpoints) {
      expect(checkpoint.result.source).toBe(source);
      expect(checkpoint.result.semanticPath).toEqual(path);
      expect(checkpoint.result.selection).toEqual({ anchor: leafStart, head: leafStart + 4 });
      expect(checkpoint.result.visibleLines.map(({ geometry }) => [geometry.semanticDepth, geometry.contentColumn, geometry.markerColumn])).toEqual(columns);
      expect(checkpoint.result.visibleLines.every(({ role, geometry }) => role === "content" && geometry.visibility === "visible")).toBe(true);
    }
  });

  it("does not interpret task paragraph text as inline blockquote containers", () => {
    expect(micromark("> - [ ] > - [ ] > leaf")).toBe("<blockquote>\n<ul>\n<li>[ ] &gt; - [ ] &gt; leaf</li>\n</ul>\n</blockquote>");
  });

  it.each([
    { id: "nested-quote-list-repeated-enter-exit", checkpoints: ["primary", "undo"] },
    { id: "blockquote-bare-list-marker-tab", checkpoints: ["primary", "repeat", "undo"] },
    { id: "blockquote-padded-empty-list-item-tab", checkpoints: ["primary", "repeat", "undo"] },
    { id: "blockquote-list-exit-trailing-separator-cleanup", checkpoints: ["undo"] }
  ])("keeps empty item syntax distinct from an editable paragraph: $id", ({ id, checkpoints }) => {
    const behaviorCase = namedFishMarkProbeCases.find((candidate) => candidate.id === id)!;
    for (const checkpoint of behaviorCase.checkpoints.filter((candidate) => checkpoints.includes(candidate.id))) {
      expect(checkpoint.result.semanticPath.at(-1)).toBe("ListItem");
      // FishMark's existing two-space empty-item editing dialect is checked
      // separately below where standard Markdown chooses setext headings.
      if (!(["blockquote-bare-list-marker-tab", "blockquote-padded-empty-list-item-tab"].includes(id) && checkpoint.id !== "undo")) {
        expect(micromark(checkpoint.result.source)).toContain("<li></li>");
      }
      expect(checkpoint.result.visibleLines.at(-1)!.role).toBe("content");
    }
  });

  it.each([
    { id: "blockquote-bare-list-marker-tab", heading: "parent" },
    { id: "blockquote-padded-empty-list-item-tab", heading: "List1" }
  ])("preserves the established FishMark empty-item editing dialect: $id", ({ id, heading }) => {
    const source = namedFishMarkProbeCases.find((candidate) => candidate.id === id)!.checkpoints[0].result.source;
    expect(micromark(source)).toContain(`<h2>${heading}</h2>`);
    const snapshot = createEditorDerivedSnapshotFromCache(createDocumentStructureCache(source));
    const active = snapshot.nodeAt(source.length)!;
    expect(active.kind).toBe("list-item");
    expect(active.data.kind).toBe("list-item");
    expect(snapshot.lineAt(source.length)!.contentStartOffset).toBe(source.length);
  });

  it("observes quote and trailing whitespace ranges without synthetic ownership", () => {
    const behaviorCase = focusedRecursiveCases.find(({ id }) => id === "list-blockquote-enter")!;
    const primary = behaviorCase.checkpoints[0].result;
    const repeat = behaviorCase.checkpoints[1].result;
    const tokens = (source: string) => postprocess(parse().document().write(preprocess()(source, undefined, true)));
    const paragraphEnds = tokens(primary.source).filter(([event, token]) => event === "enter" && token.type === "paragraph").map(([, token]) => token.end.offset);
    expect(primary.source).toBe("- > quote\n  > ");
    expect(paragraphEnds).toEqual([9]);
    expect(primary.semanticPath).toEqual(["Document", "List", "ListItem", "Blockquote"]);
    expect(repeat.source).toBe("- > quote\n  \n");
    const owners = tokens(repeat.source).filter(([event, token]) => event === "enter" && ["listUnordered", "blockQuote", "paragraph"].includes(token.type));
    expect(owners.map(([, token]) => token.end.offset)).toEqual([9, 9, 9]);
    expect(repeat.visibleLines[1]!.geometry).toEqual({ semanticDepth: 0, contentColumn: 0, markerColumn: null, visibility: "visible" });
  });

  it("models quoted nested-list Shift+Tab before and after the legal outdent", () => {
    const behaviorCase = focusedRecursiveCases.find(
      ({ id }) => id === "blockquote-list-shift-tab"
    )!;
    const nestedPath = [
      "Document",
      "Blockquote",
      "List",
      "ListItem",
      "List",
      "ListItem",
      "Paragraph"
    ];
    const outdentedPath = [
      "Document",
      "Blockquote",
      "List",
      "ListItem",
      "Paragraph"
    ];

    expect(behaviorCase.containerDepth).toBe(3);
    expect(behaviorCase.containerPath).toEqual(nestedPath);
    expect(behaviorCase.initial.semanticPath).toEqual(nestedPath);
    expect(behaviorCase.checkpoints[0].result.semanticPath).toEqual(outdentedPath);
    expect(behaviorCase.checkpoints[1].result.semanticPath).toEqual(outdentedPath);
    expect(behaviorCase.checkpoints[2].result.semanticPath).toEqual(nestedPath);
  });

  it.each([
    { pathNumber: 2, primarySource: "- alpha", repeatSource: "- alpha", kind: "top-level list" },
    { pathNumber: 3, primarySource: "- alpha", repeatSource: "- alpha", kind: "nested list" },
    { pathNumber: 6, primarySource: "> - alpha", repeatSource: "> - alpha", kind: "top-level quote list" },
    {
      pathNumber: 7,
      primarySource: "> - ```txt\n>   alpha\n>   ```",
      repeatSource: "> - ```txt\n>   alpha\n>   ```",
      kind: "adapter-owned code fence"
    },
    { pathNumber: 9, primarySource: "- > alpha", repeatSource: "- > alpha", kind: "nested mixed list" },
    {
      pathNumber: 10,
      primarySource: "> > - $$\n> >   alpha\n> >   $$",
      repeatSource: "> > - $$\n> >   alpha\n> >   $$",
      kind: "adapter-owned block math"
    }
  ])(
    "applies Shift+Tab only to a legally promotable nested list at path $pathNumber ($kind)",
    ({ pathNumber, primarySource, repeatSource }) => {
      const behaviorCase = recursiveParityMatrixCases.find(
        (candidate) =>
          candidate.command === "Shift+Tab" &&
          formatContainerPath(candidate.containerPath) ===
            formatContainerPath(requiredEditorBehaviorContainerPaths[pathNumber - 1]!)
      )!;

      expect(behaviorCase.checkpoints[0].result.source).toBe(primarySource);
      expect(behaviorCase.checkpoints[1].result.source).toBe(repeatSource);
    }
  );
});
