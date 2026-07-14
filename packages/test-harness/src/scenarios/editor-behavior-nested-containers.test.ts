import { describe, expect, it } from "vitest";

import {
  focusedRecursiveCases,
  recursiveParityMatrixCases,
  requiredEditorBehaviorContainerPaths
} from "../../../../fixtures/editor-behavior/nested-containers";
import { formatContainerPath } from "../../../../fixtures/editor-behavior/model";

describe("recursive editor behavior contracts", () => {
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
