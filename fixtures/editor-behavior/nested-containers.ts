import {
  defineEditorBehaviorCase,
  desiredClassification,
  knownDefectClassification,
  physicalLineExpectations,
  pressKey,
  repeatActions,
  repositoryTestEvidence,
  setSelection,
  sourceSelection,
  undo,
  unverifiedEvidence,
  type EditorBehaviorAction,
  type EditorBehaviorCase,
  type EditorBehaviorCheckpoints,
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
type ResultDraft = Omit<EditorBehaviorResult, "semanticPath">;

function resultDraft(
  source: string,
  selection: ReturnType<typeof sourceSelection>,
  viewMode: "source" | "wysiwym"
): ResultDraft {
  return {
    source,
    selection,
    viewMode,
    visibleLines: physicalLineExpectations(source, selection, viewMode)
  };
}

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
    // A task checkbox starts a paragraph. A child container must start on a
    // subsequent line, indented relative to the list marker (not the checkbox).
    if (listStyle === "task" && source.startsWith("> ")) {
      return ["- [ ] task", ...source.split("\n").map((line) => `  ${line}`)].join("\n");
    }
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
): ResultDraft {
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
  return resultDraft(source, selection, viewMode);
}

type CheckpointResults = {
  readonly primary: ResultDraft;
  readonly repeatTotalActionCount: number;
  readonly repeat: ResultDraft;
  readonly undoActionCount: number;
  readonly undo: ResultDraft;
};

function checkpointResults(
  primary: ResultDraft,
  repeatCount: number,
  repeat: ResultDraft,
  undoCount: number,
  undo: ResultDraft
): CheckpointResults {
  return {
    primary,
    repeatTotalActionCount: repeatCount,
    repeat,
    undoActionCount: undoCount,
    undo
  };
}

type NestedCaseAuthoring = Omit<EditorBehaviorCase, "initial" | "checkpoints"> & {
  readonly viewMode: "source" | "wysiwym";
  readonly initial: { readonly source: string; readonly selection: ReturnType<typeof sourceSelection> };
  readonly checkpointResults: CheckpointResults;
  readonly semanticPaths?: Partial<
    Record<"initial" | "primary" | "repeat" | "undo", EditorBehaviorContainerPath>
  >;
};

function commandAction(
  command: Exclude<EditorBehaviorCommand, "InsertText">,
  result: ResultDraft
): EditorBehaviorAction {
  switch (command) {
    case "Enter":
    case "Backspace":
    case "ArrowUp":
    case "ArrowDown":
      return pressKey(command);
    case "Tab":
      return pressKey("Tab");
    case "Shift+Tab":
      return pressKey("Tab", { shift: true });
    case "selection":
      return setSelection(result.selection);
  }
}

function defineCase(input: NestedCaseAuthoring): EditorBehaviorCase {
  const {
    viewMode,
    initial,
    checkpointResults: expected,
    semanticPaths = {},
    ...behaviorCase
  } = input;
  const command = input.command as Exclude<EditorBehaviorCommand, "InsertText">;
  const pathFor = (state: "initial" | "primary" | "repeat" | "undo") =>
    semanticPaths[state] ?? input.containerPath;
  const complete = (draft: ResultDraft, state: "primary" | "repeat" | "undo") => ({
    ...draft,
    semanticPath: pathFor(state)
  });
  const checkpoints: EditorBehaviorCheckpoints = [
    {
      id: "primary",
      from: "initial",
      actions: [commandAction(command, expected.primary)],
      result: complete(expected.primary, "primary")
    },
    {
      id: "repeat",
      from: "primary",
      actions: repeatActions(
        [commandAction(command, expected.repeat)],
        expected.repeatTotalActionCount - 1
      ),
      result: complete(expected.repeat, "repeat")
    },
    {
      id: "undo",
      from: "primary",
      actions: repeatActions([undo()], expected.undoActionCount),
      result: complete(expected.undo, "undo")
    }
  ];
  return defineEditorBehaviorCase({
    ...behaviorCase,
    initial: {
      ...resultDraft(initial.source, initial.selection, viewMode),
      semanticPath: pathFor("initial")
    },
    checkpoints
  });
}

function roadmapContract() {
  return [{ kind: "roadmap" as const, section: "7.7 recursive parity matrix" }];
}

function parityClassification(command: EditorBehaviorCommand, path: EditorBehaviorContainerPath) {
  return desiredClassification({
    contractReferences: roadmapContract(),
    evidence: unverifiedEvidence(
      `No current runner executes ${command} with source, selection, semantic geometry, repeat, undo, and mode assertions at ${path.join(" > ")}.`
    )
  });
}

function paragraphEnterSources(
  path: EditorBehaviorContainerPath,
  layers: readonly NestedLayer[]
): {
  readonly expectedSource: string;
  readonly repeatSource: string;
  readonly primaryPath: EditorBehaviorContainerPath;
  readonly repeatPath: EditorBehaviorContainerPath;
} {
  const deepestLayer = layers[layers.length - 1];
  if (layers.length === 1 && deepestLayer === "Blockquote") {
    // The established single-quote Enter contract writes bare structural
    // separators; only editable continuation lines carry the trailing space.
    return {
      expectedSource: "> al\n>\n> pha",
      repeatSource: "> al\n>\n> \n>\n> pha",
      primaryPath: path,
      repeatPath: path
    };
  }
  if (deepestLayer !== "List") {
    return {
      expectedSource: sourceForPath(path, "al\n\npha", layers),
      repeatSource: sourceForPath(path, "al\n\n\n\npha", layers),
      primaryPath: path,
      repeatPath: path
    };
  }

  const outerLayers = layers.slice(0, -1);
  const expectedSource = wrapLeafSource(outerLayers, "- al\n- pha");
  const repeatSource =
    outerLayers[outerLayers.length - 1] === "List"
      ? wrapLeafSource(outerLayers.slice(0, -1), "- - al\n- pha")
      : wrapLeafSource(outerLayers, "- al\n\npha");
  return {
    expectedSource,
    repeatSource,
    primaryPath: path,
    repeatPath: pathForLayers(outerLayers)
  };
}

function removeDeepestList(layers: readonly NestedLayer[]): readonly NestedLayer[] {
  const index = layers.lastIndexOf("List");
  return index < 0 ? layers : layers.filter((_, layerIndex) => layerIndex !== index);
}

function hasPromotableNestedList(layers: readonly NestedLayer[]): boolean {
  return (
    layers[layers.length - 1] === "List" &&
    layers.filter((layer) => layer === "List").length > 1
  );
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
    classification: parityClassification(command, path)
  };

  if (command === "Enter") {
    const isParagraph = leaf === "Paragraph";
    const sources = isParagraph
      ? paragraphEnterSources(path, layers)
      : {
          expectedSource: sourceForPath(path, "al\npha", layers),
          repeatSource: sourceForPath(path, "al\n\npha", layers),
          primaryPath: path,
          repeatPath: path
        };
    return defineCase({
      ...common,
      cursorPlacement: "line-middle",
      initial: { source: initialSource, selection: sourceSelection(initialSource.indexOf("alpha") + 2) },
      semanticPaths: { primary: sources.primaryPath, repeat: sources.repeatPath },
      checkpointResults: checkpointResults(
        resultAtText(sources.expectedSource, "pha", "start"),
        2,
        resultAtText(sources.repeatSource, "pha", "start"),
        1,
        resultDraft(
          initialSource,
          sourceSelection(initialSource.indexOf("alpha") + 2),
          "wysiwym"
        )
      )
    });
  }

  if (command === "Backspace") {
    return defineCase({
      ...common,
      cursorPlacement: "line-end",
      initial: { source: initialSource, selection: initialResult.selection },
      checkpointResults: checkpointResults(
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
    const unchanged = resultDraft(initialSource, cursor, "wysiwym");
    return defineCase({
      ...common,
      title: `Invalid Tab is a no-op at ${path.join(" > ")}`,
      cursorPlacement: "line-middle",
      initial: { source: initialSource, selection: cursor },
      checkpointResults: checkpointResults(unchanged, 2, unchanged, 1, unchanged)
    });
  }

  if (command === "Shift+Tab") {
    const adapterOwnsTab = leaf === "CodeFence" || leaf === "BlockMath";
    const expectedLayers =
      adapterOwnsTab || !hasPromotableNestedList(layers)
        ? layers
        : removeDeepestList(layers);
    const repeatLayers =
      adapterOwnsTab || !hasPromotableNestedList(expectedLayers)
        ? expectedLayers
        : removeDeepestList(expectedLayers);
    return defineCase({
      ...common,
      cursorPlacement: "line-end",
      initial: { source: initialSource, selection: initialResult.selection },
      semanticPaths: {
        primary: leaf === "Paragraph" ? pathForLayers(expectedLayers) : path,
        repeat: leaf === "Paragraph" ? pathForLayers(repeatLayers) : path
      },
      checkpointResults: checkpointResults(
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
    return defineCase({
      ...common,
      cursorPlacement: "line-end",
      initial: { source, selection: initial.selection },
      checkpointResults: checkpointResults(target, 2, target, 1, target)
    });
  }

  const range = resultAtText(initialSource, "alpha", "range");
  return defineCase({
    ...common,
    cursorPlacement: "range",
    initial: { source: initialSource, selection: range.selection },
    checkpointResults: checkpointResults(range, 2, range, 1, range)
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
    const draft = resultAtText(source, "leaf", "range", depth === 0 ? "source" : "wysiwym");
    // Author the continuation geometry from the requested layers. The generic
    // single-line prefix helper cannot infer task-item ancestry across lines.
    const range = listStyle === "task" ? {
      ...draft,
      visibleLines: draft.visibleLines.map((line, index) => ({
        ...line,
        geometry: {
          semanticDepth: Math.min(depth, (index + 1) * 2),
          contentColumn: line.sourceText.indexOf(index === draft.visibleLines.length - 1 ? "leaf" : "task"),
          markerColumn: Math.max(line.sourceText.lastIndexOf(">"), line.sourceText.lastIndexOf("-")),
          visibility: "visible" as const
        }
      }))
    } : draft;
    return defineCase({
      id: `mixed-container-depth-${depth}-selection`,
      title: `Range selection remains source-mapped at mixed container depth ${depth}`,
      origin: "recursive-parity",
      command: "selection",
      containerPath: pathForLayers(layers),
      containerDepth: depth,
      lineContent: "content",
      cursorPlacement: "range",
      viewMode: depth === 0 ? "source" : "wysiwym",
      classification: desiredClassification({
        contractReferences: roadmapContract(),
        evidence: unverifiedEvidence(
          `No current runner asserts selection and physical geometry at semantic depth ${depth}.`
        )
      }),
      initial: { source, selection: range.selection },
      checkpointResults: checkpointResults(range, 2, range, 1, range)
    });
  });
}

export const representativeDepthCases = createRepresentativeDepthCases();

export const focusedRecursiveCases: readonly EditorBehaviorCase[] = [
  defineCase({
    id: "list-item-start-backspace",
    title: "Backspace at list item content start removes one list container",
    origin: "fishmark-probe",
    command: "Backspace",
    containerPath: requiredEditorBehaviorContainerPaths[1],
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      evidence: repositoryTestEvidence({
        caseId: "list-item-start-backspace",
        file: "packages/editor-core/src/commands/list-edits.test.ts",
        testName: "removes an unordered list marker at the current item content start on Backspace",
        verifiedTargets: [
          { checkpoint: "primary", aspect: "source" },
          { checkpoint: "primary", aspect: "selection" }
        ],
        gapReason: "The planner unit test does not assert the complete action plan, geometry, repeat, undo, or view mode."
      })
    }),
    initial: { source: "- item", selection: sourceSelection(2) },
    semanticPaths: {
      primary: requiredEditorBehaviorContainerPaths[0],
      repeat: requiredEditorBehaviorContainerPaths[0]
    },
    checkpointResults: checkpointResults(
      resultDraft("item", sourceSelection(0), "wysiwym"),
      2,
      resultDraft("item", sourceSelection(0), "wysiwym"),
      1,
      resultDraft("- item", sourceSelection(2), "wysiwym")
    )
  }),
  defineCase({
    id: "nested-list-item-tab",
    title: "Tab nests a list item under its previous sibling",
    origin: "fishmark-probe",
    command: "Tab",
    containerPath: requiredEditorBehaviorContainerPaths[2],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "line-middle",
    viewMode: "wysiwym",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      evidence: repositoryTestEvidence({
        caseId: "nested-list-item-tab",
        file: "src/renderer/code-editor.test.ts",
        testName: "indents a second-level unordered item into a third-level child list when Tab is pressed",
        verifiedTargets: [
          { checkpoint: "primary", aspect: "source" },
          { checkpoint: "primary", aspect: "selection" }
        ],
        gapReason: "The renderer test does not assert the complete action plan, semantic geometry, repeat, undo, or both view modes."
      })
    }),
    initial: { source: "- parent\n  - child\n  - target", selection: sourceSelection(25) },
    semanticPaths: {
      primary: pathForLayers(["List", "List", "List"]),
      repeat: pathForLayers(["List", "List", "List"])
    },
    checkpointResults: checkpointResults(
      resultDraft("- parent\n  - child\n    - target", sourceSelection(27), "wysiwym"),
      2,
      resultDraft("- parent\n  - child\n    - target", sourceSelection(27), "wysiwym"),
      1,
      resultDraft("- parent\n  - child\n  - target", sourceSelection(25), "wysiwym")
    )
  }),
  defineCase({
    id: "blockquote-arrow-down",
    title: "ArrowDown skips a collapsed quoted separator",
    origin: "recursive-parity",
    command: "ArrowDown",
    containerPath: requiredEditorBehaviorContainerPaths[3],
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      evidence: unverifiedEvidence(
        "The structural-separator probe executes ArrowUp and Backspace, not ArrowDown on this source."
      )
    }),
    initial: { source: "> first\n>\n> second", selection: sourceSelection(7) },
    checkpointResults: checkpointResults(
      resultDraft("> first\n>\n> second", sourceSelection(18), "wysiwym"),
      2,
      resultDraft("> first\n>\n> second", sourceSelection(18), "wysiwym"),
      1,
      resultDraft("> first\n>\n> second", sourceSelection(18), "wysiwym")
    )
  }),
  defineCase({
    id: "nested-blockquote-arrow-up",
    title: "ArrowUp preserves the visual column across nested quote lines",
    origin: "recursive-parity",
    command: "ArrowUp",
    containerPath: requiredEditorBehaviorContainerPaths[4],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      evidence: unverifiedEvidence(
        "The current named navigation probe covers one quote depth, not this nested source."
      )
    }),
    initial: { source: "> > first\n> > second", selection: sourceSelection(20) },
    checkpointResults: checkpointResults(
      resultDraft("> > first\n> > second", sourceSelection(9), "wysiwym"),
      2,
      resultDraft("> > first\n> > second", sourceSelection(9), "wysiwym"),
      1,
      resultDraft("> > first\n> > second", sourceSelection(9), "wysiwym")
    )
  }),
  defineCase({
    id: "blockquote-list-shift-tab",
    title: "Shift+Tab outdents one quoted list level without leaving the quote",
    origin: "recursive-parity",
    command: "Shift+Tab",
    containerPath: [
      "Document",
      "Blockquote",
      "List",
      "ListItem",
      "List",
      "ListItem",
      "Paragraph"
    ],
    containerDepth: 3,
    lineContent: "content",
    cursorPlacement: "line-middle",
    viewMode: "wysiwym",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      evidence: unverifiedEvidence(
        "Current quoted-list probes do not execute Shift+Tab on this exact source."
      )
    }),
    initial: { source: "> - first\n>   - second", selection: sourceSelection(17) },
    semanticPaths: {
      primary: requiredEditorBehaviorContainerPaths[5],
      repeat: requiredEditorBehaviorContainerPaths[5]
    },
    checkpointResults: checkpointResults(
      resultDraft("> - first\n> - second", sourceSelection(15), "wysiwym"),
      2,
      resultDraft("> - first\n> - second", sourceSelection(15), "wysiwym"),
      1,
      resultDraft("> - first\n>   - second", sourceSelection(17), "wysiwym")
    )
  }),
  defineCase({
    id: "blockquote-list-code-fence-selection",
    title: "Range selection maps to quoted fenced-code source offsets",
    origin: "recursive-parity",
    command: "selection",
    containerPath: requiredEditorBehaviorContainerPaths[6],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "range",
    viewMode: "source",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      evidence: unverifiedEvidence(
        "No current named probe executes this exact quoted-list fenced-code range selection."
      )
    }),
    initial: { source: "> - ```ts\n>   code\n>   ```", selection: sourceSelection(15, 19) },
    checkpointResults: checkpointResults(
      resultDraft("> - ```ts\n>   code\n>   ```", sourceSelection(15, 19), "source"),
      2,
      resultDraft("> - ```ts\n>   code\n>   ```", sourceSelection(15, 19), "source"),
      1,
      resultDraft("> - ```ts\n>   code\n>   ```", sourceSelection(15, 19), "source")
    )
  }),
  defineCase({
    id: "list-blockquote-enter",
    title: "Enter continues a blockquote inside a list item",
    origin: "recursive-parity",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[7],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: desiredClassification({
      contractReferences: roadmapContract(),
      evidence: unverifiedEvidence(
        "No current named probe executes Enter on a blockquote nested inside a list item."
      )
    }),
    initial: { source: "- > quote", selection: sourceSelection(9) },
    semanticPaths: {
      primary: ["Document", "List", "ListItem", "Blockquote"],
      repeat: requiredEditorBehaviorContainerPaths[1]
    },
    checkpointResults: checkpointResults(
      resultDraft("- > quote\n  > ", sourceSelection(14), "wysiwym"),
      2,
      {
        ...resultDraft("- > quote\n  \n", sourceSelection(13), "wysiwym"),
        visibleLines: physicalLineExpectations("- > quote\n  \n", sourceSelection(13), "wysiwym", {
          geometryOverrides: { 2: { semanticDepth: 0, contentColumn: 0, markerColumn: null } }
        })
      },
      1,
      resultDraft("- > quote", sourceSelection(9), "wysiwym")
    )
  }),
  defineCase({
    id: "list-blockquote-list-tab",
    title: "Tab nests a list inside a blockquote inside a list item",
    origin: "recursive-parity",
    command: "Tab",
    containerPath: requiredEditorBehaviorContainerPaths[8],
    containerDepth: 3,
    lineContent: "content",
    cursorPlacement: "line-middle",
    viewMode: "wysiwym",
    classification: knownDefectClassification({
      reason: "Current block-path resolution stops at the outer List, so the list planner returns no transaction.",
      contractReferences: roadmapContract(),
      evidence: unverifiedEvidence(
        "The repository test proves the observed no-transaction defect, not any desired checkpoint target."
      ),
      observed: { kind: "planner-result", outcome: "no-transaction" }
    }),
    initial: { source: "- > - first\n  > - second\n  > - target", selection: sourceSelection(32) },
    semanticPaths: {
      primary: [
        "Document",
        "List",
        "ListItem",
        "Blockquote",
        "List",
        "ListItem",
        "List",
        "ListItem",
        "Paragraph"
      ],
      repeat: [
        "Document",
        "List",
        "ListItem",
        "Blockquote",
        "List",
        "ListItem",
        "List",
        "ListItem",
        "Paragraph"
      ]
    },
    checkpointResults: checkpointResults(
      resultDraft("- > - first\n  > - second\n  >   - target", sourceSelection(34), "wysiwym"),
      2,
      resultDraft("- > - first\n  > - second\n  >   - target", sourceSelection(34), "wysiwym"),
      1,
      resultDraft("- > - first\n  > - second\n  > - target", sourceSelection(32), "wysiwym")
    )
  }),
  defineCase({
    id: "nested-quote-list-block-math-selection",
    title: "Block math inside nested quotes and a list retains source selection geometry",
    origin: "recursive-parity",
    command: "selection",
    containerPath: requiredEditorBehaviorContainerPaths[9],
    containerDepth: 3,
    lineContent: "content",
    cursorPlacement: "range",
    viewMode: "wysiwym",
    classification: knownDefectClassification({
      reason: "The current block-path adapter stops at the List and cannot represent the BlockMath descendant.",
      contractReferences: roadmapContract(),
      evidence: unverifiedEvidence(
        "The repository test proves the observed truncated path, not the desired semantic path or editor result."
      ),
      observed: {
        kind: "semantic-path",
        path: ["Document", "Blockquote", "Blockquote", "List"]
      }
    }),
    initial: { source: "> > - $$\n> >   x + y\n> >   $$", selection: sourceSelection(17, 22) },
    checkpointResults: checkpointResults(
      resultDraft("> > - $$\n> >   x + y\n> >   $$", sourceSelection(17, 22), "wysiwym"),
      2,
      resultDraft("> > - $$\n> >   x + y\n> >   $$", sourceSelection(17, 22), "wysiwym"),
      1,
      resultDraft("> > - $$\n> >   x + y\n> >   $$", sourceSelection(17, 22), "wysiwym")
    )
  })
];
