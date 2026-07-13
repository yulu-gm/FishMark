import {
  defineEditorBehaviorCase,
  desiredClassification,
  editorBehaviorResult,
  knownDefectClassification,
  operationResult,
  sourceSelection,
  testCurrentEvidence,
  unverifiedCurrentEvidence,
  type EditorBehaviorCase,
  type EditorBehaviorCommand,
  type EditorBehaviorContainer,
  type EditorBehaviorContainerPath,
  type EditorBehaviorResult
} from "./model";

export const requiredEditorBehaviorContainerPaths = [
  ["Document", "Paragraph"],
  ["Document", "List", "ListItem", "Paragraph"],
  ["Document", "List", "ListItem", "List", "ListItem", "Paragraph"],
  ["Document", "Blockquote", "Paragraph"],
  ["Document", "Blockquote", "Blockquote", "Paragraph"],
  ["Document", "Blockquote", "List", "ListItem", "Paragraph"],
  ["Document", "Blockquote", "List", "ListItem", "CodeFence"],
  ["Document", "List", "ListItem", "Blockquote", "Paragraph"],
  ["Document", "List", "ListItem", "Blockquote", "List", "ListItem", "Paragraph"],
  ["Document", "Blockquote", "Blockquote", "List", "ListItem", "BlockMath"]
] as const satisfies readonly EditorBehaviorContainerPath[];

type NestedLayer = "Blockquote" | "List";
type ListStyle = "unordered" | "ordered" | "task";

function wrapLeafSource(
  layers: readonly NestedLayer[],
  leaf: string,
  listStyle: ListStyle = "unordered"
): string {
  return [...layers].reverse().reduce((source, layer) => {
    if (layer === "Blockquote") {
      return source.split("\n").map((line) => `> ${line}`).join("\n");
    }

    const marker = listStyle === "ordered" ? "1. " : listStyle === "task" ? "- [ ] " : "- ";
    const [first = "", ...rest] = source.split("\n");
    return [`${marker}${first}`, ...rest.map((line) => `${" ".repeat(marker.length)}${line}`)].join("\n");
  }, leaf);
}

function layersForPath(path: EditorBehaviorContainerPath): readonly NestedLayer[] {
  return path.flatMap((entry) => {
    if (entry === "List") {
      return ["List" as const];
    }
    if (entry === "Blockquote") {
      return ["Blockquote" as const];
    }
    return [];
  });
}

function pathForLayers(layers: readonly NestedLayer[]): EditorBehaviorContainerPath {
  const path: EditorBehaviorContainer[] = ["Document"];
  for (const layer of layers) {
    if (layer === "List") {
      path.push("List", "ListItem");
    } else {
      path.push("Blockquote");
    }
  }
  path.push("Paragraph");
  return path;
}

function leafSource(path: EditorBehaviorContainerPath, content: string): string {
  const leaf = path[path.length - 1];
  if (leaf === "CodeFence") {
    return `\`\`\`txt\n${content}\n\`\`\``;
  }
  if (leaf === "BlockMath") {
    return `$$\n${content}\n$$`;
  }
  return content;
}

function sourceForPath(
  path: EditorBehaviorContainerPath,
  content: string,
  layers = layersForPath(path)
): string {
  return wrapLeafSource(layers, leafSource(path, content));
}

function resultAtText(
  source: string,
  text: string,
  placement: "start" | "end" | "range",
  viewMode: "source" | "wysiwym" = "wysiwym"
): EditorBehaviorResult {
  const start = source.indexOf(text);
  if (start < 0) {
    throw new Error(`Cannot place selection: ${JSON.stringify(text)} is absent from source.`);
  }
  const selection =
    placement === "start"
      ? sourceSelection(start)
      : placement === "range"
        ? sourceSelection(start, start + text.length)
        : sourceSelection(start + text.length);
  return editorBehaviorResult(source, selection, viewMode);
}

function expected(
  primary: EditorBehaviorResult,
  repeatCount: number,
  repeat: EditorBehaviorResult,
  undoCount: number,
  undo: EditorBehaviorResult
): EditorBehaviorCase["expected"] {
  return {
    ...primary,
    repeat: operationResult(repeatCount, repeat),
    undo: operationResult(undoCount, undo)
  };
}

function roadmapContract() {
  return [{ kind: "roadmap" as const, section: "7.7 recursive parity matrix" }];
}

function parityClassification(command: EditorBehaviorCommand, path: EditorBehaviorContainerPath) {
  return desiredClassification({
    contractReferences: roadmapContract(),
    currentEvidence: unverifiedCurrentEvidence(
      `No current runner executes ${command} with source, selection, semantic geometry, repeat, undo, and mode assertions at ${path.join(" > ")}.`
    )
  });
}

function paragraphEnterSources(
  path: EditorBehaviorContainerPath,
  layers: readonly NestedLayer[]
): { readonly expectedSource: string; readonly repeatSource: string } {
  const deepestLayer = layers[layers.length - 1];
  if (deepestLayer !== "List") {
    return {
      expectedSource: sourceForPath(path, "al\n\npha", layers),
      repeatSource: sourceForPath(path, "al\n\n\n\npha", layers)
    };
  }

  const outerLayers = layers.slice(0, -1);
  const expectedSource = wrapLeafSource(outerLayers, "- al\n- pha");
  const repeatSource =
    outerLayers[outerLayers.length - 1] === "List"
      ? wrapLeafSource(outerLayers.slice(0, -1), "- - al\n- pha")
      : wrapLeafSource(outerLayers, "- al\n\npha");
  return { expectedSource, repeatSource };
}

function removeDeepestList(layers: readonly NestedLayer[]): readonly NestedLayer[] {
  const index = layers.lastIndexOf("List");
  return index < 0 ? layers : layers.filter((_, layerIndex) => layerIndex !== index);
}

function recursiveParityCase(
  command: Exclude<EditorBehaviorCommand, "InsertText">,
  path: EditorBehaviorContainerPath,
  pathIndex: number
): EditorBehaviorCase {
  const layers = layersForPath(path);
  const leaf = path[path.length - 1];
  const initialSource = sourceForPath(path, "alpha", layers);
  const initialResult = resultAtText(initialSource, "alpha", "end");
  const common = {
    id: `matrix-${command.toLowerCase().replace("+", "-")}-path-${pathIndex + 1}`,
    title: `${command} contract at ${path.join(" > ")}`,
    origin: "recursive-parity" as const,
    command,
    containerPath: path,
    containerDepth: layers.length,
    lineContent: "content" as const,
    viewMode: "wysiwym" as const,
    viewModeContract: "projected-geometry" as const,
    classification: parityClassification(command, path)
  };

  if (command === "Enter") {
    const isParagraph = leaf === "Paragraph";
    const sources = isParagraph
      ? paragraphEnterSources(path, layers)
      : {
          expectedSource: sourceForPath(path, "al\npha", layers),
          repeatSource: sourceForPath(path, "al\n\npha", layers)
        };
    return defineEditorBehaviorCase({
      ...common,
      cursorPlacement: "line-middle",
      initial: { source: initialSource, selection: sourceSelection(initialSource.indexOf("alpha") + 2) },
      expected: expected(
        resultAtText(sources.expectedSource, "pha", "start"),
        2,
        resultAtText(sources.repeatSource, "pha", "start"),
        1,
        editorBehaviorResult(
          initialSource,
          sourceSelection(initialSource.indexOf("alpha") + 2),
          "wysiwym"
        )
      )
    });
  }

  if (command === "Backspace") {
    return defineEditorBehaviorCase({
      ...common,
      cursorPlacement: "line-end",
      initial: { source: initialSource, selection: initialResult.selection },
      expected: expected(
        resultAtText(sourceForPath(path, "alph", layers), "alph", "end"),
        2,
        resultAtText(sourceForPath(path, "alp", layers), "alp", "end"),
        1,
        initialResult
      )
    });
  }

  if (command === "Tab") {
    const cursor = sourceSelection(initialSource.indexOf("alpha") + 2);
    const unchanged = editorBehaviorResult(initialSource, cursor, "wysiwym");
    return defineEditorBehaviorCase({
      ...common,
      title: `Invalid Tab is a no-op at ${path.join(" > ")}`,
      cursorPlacement: "line-middle",
      initial: { source: initialSource, selection: cursor },
      expected: expected(unchanged, 2, unchanged, 1, unchanged)
    });
  }

  if (command === "Shift+Tab") {
    const adapterOwnsTab = leaf === "CodeFence" || leaf === "BlockMath";
    const listOwnsLeaf = layers[layers.length - 1] === "List";
    const expectedLayers = adapterOwnsTab || !listOwnsLeaf ? layers : removeDeepestList(layers);
    const repeatLayers =
      adapterOwnsTab || expectedLayers[expectedLayers.length - 1] !== "List"
        ? expectedLayers
        : removeDeepestList(expectedLayers);
    return defineEditorBehaviorCase({
      ...common,
      cursorPlacement: "line-end",
      initial: { source: initialSource, selection: initialResult.selection },
      expected: expected(
        resultAtText(sourceForPath(path, "alpha", expectedLayers), "alpha", "end"),
        2,
        resultAtText(sourceForPath(path, "alpha", repeatLayers), "alpha", "end"),
        1,
        initialResult
      )
    });
  }

  if (command === "ArrowUp" || command === "ArrowDown") {
    const source = sourceForPath(path, "alpha\nomega", layers);
    const initialText = command === "ArrowUp" ? "omega" : "alpha";
    const targetText = command === "ArrowUp" ? "alpha" : "omega";
    const initial = resultAtText(source, initialText, "end");
    const target = resultAtText(source, targetText, "end");
    return defineEditorBehaviorCase({
      ...common,
      cursorPlacement: "line-end",
      initial: { source, selection: initial.selection },
      expected: expected(target, 2, target, 1, target)
    });
  }

  const range = resultAtText(initialSource, "alpha", "range");
  return defineEditorBehaviorCase({
    ...common,
    cursorPlacement: "range",
    initial: { source: initialSource, selection: range.selection },
    expected: expected(range, 2, range, 1, range)
  });
}

const recursiveParityCommands = [
  "Enter",
  "Backspace",
  "Tab",
  "Shift+Tab",
  "ArrowUp",
  "ArrowDown",
  "selection"
] as const;

export function createRecursiveParityMatrixCases(): readonly EditorBehaviorCase[] {
  return recursiveParityCommands.flatMap((command) =>
    requiredEditorBehaviorContainerPaths.map((path, pathIndex) =>
      recursiveParityCase(command, path, pathIndex)
    )
  );
}

export const recursiveParityMatrixCases = createRecursiveParityMatrixCases();

export function createRepresentativeDepthCases(): readonly EditorBehaviorCase[] {
  return Array.from({ length: 9 }, (_, depth) => {
    const layers: NestedLayer[] = Array.from({ length: depth }, (__, index) =>
      index % 2 === 0 ? "Blockquote" : "List"
    );
    const listStyle: ListStyle = depth % 3 === 1 ? "ordered" : depth % 3 === 2 ? "task" : "unordered";
    const source = wrapLeafSource(layers, "leaf", listStyle);
    const range = resultAtText(source, "leaf", "range", depth === 0 ? "source" : "wysiwym");
    return defineEditorBehaviorCase({
      id: `mixed-container-depth-${depth}-selection`,
      title: `Range selection remains source-mapped at mixed container depth ${depth}`,
      origin: "recursive-parity",
      command: "selection",
      containerPath: pathForLayers(layers),
      containerDepth: depth,
      lineContent: "content",
      cursorPlacement: "range",
      viewMode: depth === 0 ? "source" : "wysiwym",
      viewModeContract: depth === 0 ? "raw-source-geometry" : "projected-geometry",
      classification: desiredClassification({
        contractReferences: roadmapContract(),
        currentEvidence: unverifiedCurrentEvidence(
          `No current runner asserts selection and physical geometry at semantic depth ${depth}.`
        )
      }),
      initial: { source, selection: range.selection },
      expected: expected(range, 2, range, 1, range)
    });
  });
}

export const representativeDepthCases = createRepresentativeDepthCases();

export const focusedRecursiveCases: readonly EditorBehaviorCase[] = [
  defineEditorBehaviorCase({
    id: "list-item-start-backspace",
    title: "Backspace at list item content start removes one list container",
    origin: "fishmark-probe",
    command: "Backspace",
    containerPath: requiredEditorBehaviorContainerPaths[1],
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      currentEvidence: testCurrentEvidence({
        file: "packages/editor-core/src/commands/list-edits.test.ts",
        testName: "removes an unordered list marker at the current item content start on Backspace",
        verifiedAspects: ["command-plan", "source", "selection"],
        gapReason: "The planner unit test does not assert projected geometry, repeat, undo, or view-mode parity."
      })
    }),
    initial: { source: "- item", selection: sourceSelection(2) },
    expected: expected(
      editorBehaviorResult("item", sourceSelection(0), "wysiwym"),
      2,
      editorBehaviorResult("item", sourceSelection(0), "wysiwym"),
      1,
      editorBehaviorResult("- item", sourceSelection(2), "wysiwym")
    )
  }),
  defineEditorBehaviorCase({
    id: "nested-list-item-tab",
    title: "Tab nests a list item under its previous sibling",
    origin: "fishmark-probe",
    command: "Tab",
    containerPath: requiredEditorBehaviorContainerPaths[2],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "line-middle",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      currentEvidence: testCurrentEvidence({
        file: "src/renderer/code-editor.test.ts",
        testName: "indents a second-level unordered item into a third-level child list when Tab is pressed",
        verifiedAspects: ["command-plan", "source", "selection"],
        gapReason: "The renderer unit test does not assert semantic geometry, repeat, undo, or both view modes."
      })
    }),
    initial: { source: "- parent\n  - child\n  - target", selection: sourceSelection(25) },
    expected: expected(
      editorBehaviorResult("- parent\n  - child\n    - target", sourceSelection(27), "wysiwym"),
      2,
      editorBehaviorResult("- parent\n  - child\n    - target", sourceSelection(27), "wysiwym"),
      1,
      editorBehaviorResult("- parent\n  - child\n  - target", sourceSelection(25), "wysiwym")
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-arrow-down",
    title: "ArrowDown skips a collapsed quoted separator",
    origin: "recursive-parity",
    command: "ArrowDown",
    containerPath: requiredEditorBehaviorContainerPaths[3],
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      currentEvidence: unverifiedCurrentEvidence(
        "The structural-separator probe executes ArrowUp and Backspace, not ArrowDown on this source."
      )
    }),
    initial: { source: "> first\n>\n> second", selection: sourceSelection(7) },
    expected: expected(
      editorBehaviorResult("> first\n>\n> second", sourceSelection(18), "wysiwym"),
      2,
      editorBehaviorResult("> first\n>\n> second", sourceSelection(18), "wysiwym"),
      1,
      editorBehaviorResult("> first\n>\n> second", sourceSelection(18), "wysiwym")
    )
  }),
  defineEditorBehaviorCase({
    id: "nested-blockquote-arrow-up",
    title: "ArrowUp preserves the visual column across nested quote lines",
    origin: "recursive-parity",
    command: "ArrowUp",
    containerPath: requiredEditorBehaviorContainerPaths[4],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      currentEvidence: unverifiedCurrentEvidence(
        "The current named navigation probe covers one quote depth, not this nested source."
      )
    }),
    initial: { source: "> > first\n> > second", selection: sourceSelection(20) },
    expected: expected(
      editorBehaviorResult("> > first\n> > second", sourceSelection(9), "wysiwym"),
      2,
      editorBehaviorResult("> > first\n> > second", sourceSelection(9), "wysiwym"),
      1,
      editorBehaviorResult("> > first\n> > second", sourceSelection(9), "wysiwym")
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-list-shift-tab",
    title: "Shift+Tab outdents one quoted list level without leaving the quote",
    origin: "recursive-parity",
    command: "Shift+Tab",
    containerPath: requiredEditorBehaviorContainerPaths[5],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "line-middle",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      currentEvidence: unverifiedCurrentEvidence(
        "Current quoted-list probes do not execute Shift+Tab on this exact source."
      )
    }),
    initial: { source: "> - first\n>   - second", selection: sourceSelection(17) },
    expected: expected(
      editorBehaviorResult("> - first\n> - second", sourceSelection(15), "wysiwym"),
      2,
      editorBehaviorResult("> - first\n> - second", sourceSelection(15), "wysiwym"),
      1,
      editorBehaviorResult("> - first\n>   - second", sourceSelection(17), "wysiwym")
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-list-code-fence-selection",
    title: "Range selection maps to quoted fenced-code source offsets",
    origin: "recursive-parity",
    command: "selection",
    containerPath: requiredEditorBehaviorContainerPaths[6],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "range",
    viewMode: "source",
    viewModeContract: "raw-source-geometry",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      currentEvidence: unverifiedCurrentEvidence(
        "No current named probe executes this exact quoted-list fenced-code range selection."
      )
    }),
    initial: { source: "> - ```ts\n>   code\n>   ```", selection: sourceSelection(15, 19) },
    expected: expected(
      editorBehaviorResult("> - ```ts\n>   code\n>   ```", sourceSelection(15, 19), "source"),
      2,
      editorBehaviorResult("> - ```ts\n>   code\n>   ```", sourceSelection(15, 19), "source"),
      1,
      editorBehaviorResult("> - ```ts\n>   code\n>   ```", sourceSelection(15, 19), "source")
    )
  }),
  defineEditorBehaviorCase({
    id: "list-blockquote-enter",
    title: "Enter continues a blockquote inside a list item",
    origin: "recursive-parity",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[7],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      currentEvidence: unverifiedCurrentEvidence(
        "No current named probe executes Enter on a blockquote nested inside a list item."
      )
    }),
    initial: { source: "- > quote", selection: sourceSelection(9) },
    expected: expected(
      editorBehaviorResult("- > quote\n  > ", sourceSelection(14), "wysiwym"),
      2,
      editorBehaviorResult("- > quote\n  \n", sourceSelection(13), "wysiwym"),
      1,
      editorBehaviorResult("- > quote", sourceSelection(9), "wysiwym")
    )
  }),
  defineEditorBehaviorCase({
    id: "list-blockquote-list-tab",
    title: "Tab nests a list inside a blockquote inside a list item",
    origin: "recursive-parity",
    command: "Tab",
    containerPath: requiredEditorBehaviorContainerPaths[8],
    containerDepth: 3,
    lineContent: "content",
    cursorPlacement: "line-middle",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: knownDefectClassification({
      reason: "Current block-path resolution stops at the outer List, so the list planner returns no transaction.",
      contractReferences: roadmapContract(),
      currentEvidence: testCurrentEvidence({
        file: "packages/editor-core/src/commands/list-edits.test.ts",
        testName: "documents the current list-blockquote-list indent limitation",
        verifiedAspects: ["command-plan"],
        gapReason: "No editor runner asserts source, selection, geometry, repeat, undo, or mode for this defect."
      }),
      observed: { kind: "planner-result", outcome: "no-transaction" }
    }),
    initial: { source: "- > - first\n  > - second\n  > - target", selection: sourceSelection(32) },
    expected: expected(
      editorBehaviorResult("- > - first\n  > - second\n  >   - target", sourceSelection(34), "wysiwym"),
      2,
      editorBehaviorResult("- > - first\n  > - second\n  >   - target", sourceSelection(34), "wysiwym"),
      1,
      editorBehaviorResult("- > - first\n  > - second\n  > - target", sourceSelection(32), "wysiwym")
    )
  }),
  defineEditorBehaviorCase({
    id: "nested-quote-list-block-math-selection",
    title: "Block math inside nested quotes and a list retains source selection geometry",
    origin: "recursive-parity",
    command: "selection",
    containerPath: requiredEditorBehaviorContainerPaths[9],
    containerDepth: 3,
    lineContent: "content",
    cursorPlacement: "range",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: knownDefectClassification({
      reason: "The current block-path adapter stops at the List and cannot represent the BlockMath descendant.",
      contractReferences: roadmapContract(),
      currentEvidence: testCurrentEvidence({
        file: "packages/editor-core/src/context/block-path.test.ts",
        testName: "documents current mixed-container paths stopping at list blocks",
        verifiedAspects: ["semantic-path"],
        gapReason: "No named probe asserts source selection or projected geometry for this path."
      }),
      observed: {
        kind: "semantic-path",
        path: ["Document", "Blockquote", "Blockquote", "List"]
      }
    }),
    initial: { source: "> > - $$\n> >   x + y\n> >   $$", selection: sourceSelection(17, 22) },
    expected: expected(
      editorBehaviorResult("> > - $$\n> >   x + y\n> >   $$", sourceSelection(17, 22), "wysiwym"),
      2,
      editorBehaviorResult("> > - $$\n> >   x + y\n> >   $$", sourceSelection(17, 22), "wysiwym"),
      1,
      editorBehaviorResult("> > - $$\n> >   x + y\n> >   $$", sourceSelection(17, 22), "wysiwym")
    )
  })
];
