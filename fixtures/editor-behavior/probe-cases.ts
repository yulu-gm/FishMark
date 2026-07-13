import {
  createEvidence,
  defineEditorBehaviorCase,
  desiredClassification,
  insertText,
  physicalLineExpectations,
  pressKey,
  repeatActions,
  setSelection,
  sourceSelection,
  undo,
  type EditorBehaviorCase,
  type EditorBehaviorAction,
  type EditorBehaviorCheckpoints,
  type EditorBehaviorCommand,
  type EditorBehaviorContractReference,
  type EditorBehaviorResult,
  type VisibleLineOptions
} from "./model";
import {
  findFishMarkProbe,
  type FishMarkNamedProbeCaseId
} from "./fishmark-probe-catalog";

const DOCUMENT_PARAGRAPH = ["Document", "Paragraph"] as const;
const DOCUMENT_BLOCKQUOTE_PARAGRAPH = ["Document", "Blockquote", "Paragraph"] as const;
const DOCUMENT_NESTED_BLOCKQUOTE_PARAGRAPH = [
  "Document",
  "Blockquote",
  "Blockquote",
  "Paragraph"
] as const;
const DOCUMENT_BLOCKQUOTE_LIST_PARAGRAPH = [
  "Document",
  "Blockquote",
  "List",
  "ListItem",
  "Paragraph"
] as const;
const DOCUMENT_BLOCKQUOTE_CODE_FENCE = [
  "Document",
  "Blockquote",
  "CodeFence"
] as const;
const DOCUMENT_LIST_PARAGRAPH = ["Document", "List", "ListItem", "Paragraph"] as const;
type ResultInput = readonly [
  source: string,
  selection: ReturnType<typeof sourceSelection>,
  options?: VisibleLineOptions
];

type ResultDraft = Omit<EditorBehaviorResult, "semanticPath">;

function result(
  viewMode: "source" | "wysiwym",
  [source, selection, options]: ResultInput
): ResultDraft {
  return {
    source,
    selection,
    viewMode,
    visibleLines: physicalLineExpectations(source, selection, viewMode, options)
  };
}

type CheckpointResults = {
  readonly primary: ResultDraft;
  readonly repeatTotalActionCount: number;
  readonly repeat: ResultDraft;
  readonly undoActionCount: number;
  readonly undo: ResultDraft;
};

function checkpointResults(
  viewMode: "source" | "wysiwym",
  expected: ResultInput,
  repeatCount: number,
  repeat: ResultInput,
  undoCount: number,
  undo: ResultInput
): CheckpointResults {
  return {
    primary: result(viewMode, expected),
    repeatTotalActionCount: repeatCount,
    repeat: result(viewMode, repeat),
    undoActionCount: undoCount,
    undo: result(viewMode, undo)
  };
}

type ProbeCaseAuthoring = Omit<EditorBehaviorCase, "initial" | "checkpoints"> & {
  readonly viewMode: "source" | "wysiwym";
  readonly initial: { readonly source: string; readonly selection: ReturnType<typeof sourceSelection> };
  readonly checkpointResults: CheckpointResults;
  readonly semanticPaths?: Partial<
    Record<"initial" | "primary" | "repeat" | "undo", EditorBehaviorCase["containerPath"]>
  >;
  readonly insertedText?: string;
  readonly primaryFollowupActions?: readonly EditorBehaviorAction[];
};

function commandAction(
  command: EditorBehaviorCommand,
  result: ResultDraft,
  insertedTextValue?: string
): EditorBehaviorAction {
  switch (command) {
    case "InsertText":
      if (insertedTextValue === undefined) {
        throw new Error("InsertText fixtures must declare their inserted text payload.");
      }
      return insertText(insertedTextValue);
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

function defineCase(input: ProbeCaseAuthoring): EditorBehaviorCase {
  const {
    viewMode,
    initial,
    checkpointResults: expected,
    insertedText: insertedTextValue,
    primaryFollowupActions = [],
    semanticPaths = {},
    ...behaviorCase
  } = input;
  const pathFor = (state: "initial" | "primary" | "repeat" | "undo") =>
    semanticPaths[state] ?? input.containerPath;
  const complete = (draft: ResultDraft, state: "primary" | "repeat" | "undo") => ({
    ...draft,
    semanticPath: pathFor(state)
  });
  const primaryAction = commandAction(input.command, expected.primary, insertedTextValue);
  const repeatAction = commandAction(input.command, expected.repeat, insertedTextValue);
  const checkpoints: EditorBehaviorCheckpoints = [
    {
      id: "primary",
      from: "initial",
      actions: [primaryAction, ...primaryFollowupActions],
      result: complete(expected.primary, "primary")
    },
    {
      id: "repeat",
      from: "primary",
      actions: repeatActions([repeatAction], expected.repeatTotalActionCount - 1),
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
      ...result(viewMode, [initial.source, initial.selection]),
      semanticPath: pathFor("initial")
    },
    checkpoints
  });
}

function roadmapReference(section = "7.7 recursive parity matrix"): EditorBehaviorContractReference {
  return { kind: "roadmap", section };
}

function oracleReference(caseId: string): EditorBehaviorContractReference {
  return {
    kind: "typora-oracle",
    file: `docs/plans/typora-like-editor/oracle/${caseId}.json`
  };
}

function probeClassification(input: {
  readonly probeCaseId: FishMarkNamedProbeCaseId;
  readonly contractReferences?: readonly EditorBehaviorContractReference[];
}) {
  const probe = findFishMarkProbe(input.probeCaseId);
  return desiredClassification({
    probeCaseId: input.probeCaseId,
    contractReferences: input.contractReferences ?? [roadmapReference()],
    evidence: createEvidence({
      gapReason:
        "The named probe does not assert this complete RF-001 checkpoint target.",
      verifiedTargets: probe.capabilities.map((capability) => ({
        checkpoint: capability.checkpoint,
        aspect: capability.aspect,
        provenance: {
          kind: "fishmark-probe" as const,
          probeCaseId: input.probeCaseId,
          assertion: `${probe.probe.file}:${probe.probe.functionName}: ${capability.assertion}`
        }
      }))
    })
  });
}

export const capturedOracleAndProbeCases: readonly EditorBehaviorCase[] = [
  defineCase({
    id: "empty-type-hash",
    title: "Typing a hash in an empty document preserves the source marker",
    origin: "typora-oracle",
    command: "InsertText",
    insertedText: "#",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "empty-type-hash",
      contractReferences: [oracleReference("empty-type-hash")]
    }),
    initial: { source: "", selection: sourceSelection(0) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["#", sourceSelection(1)],
      2,
      ["##", sourceSelection(2)],
      1,
      ["", sourceSelection(0)]
    )
  }),
  defineCase({
    id: "empty-type-one-space",
    title: "Typing one space in an empty document preserves one source space",
    origin: "typora-oracle",
    command: "InsertText",
    insertedText: " ",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "empty-type-one-space",
      contractReferences: [oracleReference("empty-type-one-space")]
    }),
    initial: { source: "", selection: sourceSelection(0) },
    checkpointResults: checkpointResults(
      "wysiwym",
      [" ", sourceSelection(1)],
      2,
      ["  ", sourceSelection(2)],
      1,
      ["", sourceSelection(0)]
    )
  }),
  defineCase({
    id: "empty-type-three-spaces",
    title: "Typing spaces in an empty document preserves whitespace source",
    origin: "typora-oracle",
    command: "InsertText",
    insertedText: "   ",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "source",
    classification: probeClassification({
      probeCaseId: "empty-type-three-spaces",
      contractReferences: [oracleReference("empty-type-three-spaces")]
    }),
    initial: { source: "", selection: sourceSelection(0) },
    checkpointResults: checkpointResults(
      "source",
      ["   ", sourceSelection(3)],
      2,
      ["      ", sourceSelection(6)],
      1,
      ["", sourceSelection(0)]
    )
  }),
  defineCase({
    id: "empty-spaces-enter-text",
    title: "Enter after spaces creates a paragraph that accepts ordinary text",
    origin: "typora-oracle",
    command: "Enter",
    primaryFollowupActions: [insertText("abc")],
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "whitespace-only",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "empty-spaces-enter-text",
      contractReferences: [oracleReference("empty-spaces-enter-text")]
    }),
    initial: { source: "   ", selection: sourceSelection(3) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["   \n\nabc", sourceSelection(8)],
      2,
      ["   \n\nabc\n\n", sourceSelection(10)],
      2,
      ["   ", sourceSelection(3)]
    )
  }),
  defineCase({
    id: "whitespace-line-enter",
    title: "Repeated Enter preserves the whitespace physical line",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "whitespace-only",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "empty-spaces-repeated-enter",
    }),
    initial: { source: "   ", selection: sourceSelection(3) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["   \n\n", sourceSelection(5)],
      2,
      ["   \n\n\n\n", sourceSelection(7)],
      1,
      ["   ", sourceSelection(3)]
    )
  }),
  ...[
    {
      id: "paragraph-end-enter",
      title: "Enter at paragraph end creates a visible empty paragraph",
      placement: "line-end" as const,
      initialSelection: sourceSelection(9),
      expectedSource: "Paragraph\n\n",
      expectedSelection: sourceSelection(11),
      repeatSource: "Paragraph\n\n\n\n",
      repeatSelection: sourceSelection(13)
    },
    {
      id: "paragraph-middle-enter",
      title: "Enter in paragraph content splits at the source selection",
      placement: "line-middle" as const,
      initialSelection: sourceSelection(5),
      expectedSource: "Alpha\n\nBeta",
      expectedSelection: sourceSelection(7),
      repeatSource: "Alpha\n\n\n\nBeta",
      repeatSelection: sourceSelection(9),
      initialSource: "AlphaBeta"
    },
    {
      id: "paragraph-start-enter",
      title: "Enter at paragraph start creates a visible empty paragraph above",
      placement: "line-start" as const,
      initialSelection: sourceSelection(0),
      expectedSource: "\n\nParagraph",
      expectedSelection: sourceSelection(2),
      repeatSource: "\n\n\n\nParagraph",
      repeatSelection: sourceSelection(4)
    }
  ].map((input) => {
    const initialSource = input.initialSource ?? "Paragraph";
    return defineCase({
      id: input.id,
      title: input.title,
      origin: "typora-oracle",
      command: "Enter",
      containerPath: DOCUMENT_PARAGRAPH,
      containerDepth: 0,
      lineContent: "content",
      cursorPlacement: input.placement,
      viewMode: "wysiwym",
      classification: probeClassification({
        probeCaseId: input.id as "paragraph-end-enter" | "paragraph-middle-enter" | "paragraph-start-enter",
        contractReferences: [oracleReference(input.id)]
      }),
      initial: { source: initialSource, selection: input.initialSelection },
      checkpointResults: checkpointResults(
        "wysiwym",
        [input.expectedSource, input.expectedSelection],
        2,
        [input.repeatSource, input.repeatSelection],
        1,
        [initialSource, input.initialSelection]
      )
    });
  }),
  defineCase({
    id: "heading-end-enter",
    title: "Enter after a heading creates a paragraph without copying the heading marker",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "heading-end-enter",
      contractReferences: [oracleReference("heading-end-enter")]
    }),
    initial: { source: "# Title", selection: sourceSelection(7) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["# Title\n\n", sourceSelection(9)],
      2,
      ["# Title\n\n\n\n", sourceSelection(11)],
      1,
      ["# Title", sourceSelection(7)]
    )
  }),
  defineCase({
    id: "heading-end-repeated-enter",
    title: "Repeated Enter after a heading accumulates distinct empty paragraphs",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "heading-end-repeated-enter",
      contractReferences: [oracleReference("heading-end-repeated-enter")]
    }),
    initial: { source: "# Title", selection: sourceSelection(7) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["# Title\n\n", sourceSelection(9)],
      3,
      ["# Title\n\n\n\n\n\n", sourceSelection(13)],
      1,
      ["# Title", sourceSelection(7)]
    )
  }),
  defineCase({
    id: "heading-empty-paragraph-space",
    title: "A space in the empty paragraph after a heading remains editable source",
    origin: "typora-oracle",
    command: "InsertText",
    insertedText: " ",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "heading-empty-paragraph-space",
      contractReferences: [oracleReference("heading-empty-paragraph-space")]
    }),
    initial: { source: "# Title\n\n", selection: sourceSelection(9) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["# Title\n\n ", sourceSelection(10)],
      2,
      ["# Title\n\n  ", sourceSelection(11)],
      1,
      ["# Title\n\n", sourceSelection(9)]
    )
  }),
  defineCase({
    id: "heading-empty-paragraph-backspace",
    title: "Backspace from the empty paragraph below a heading rejoins the heading",
    origin: "typora-oracle",
    command: "Backspace",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "heading-empty-paragraph-backspace",
      contractReferences: [oracleReference("heading-empty-paragraph-backspace")]
    }),
    initial: { source: "# Title\n\n", selection: sourceSelection(9) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["# Title", sourceSelection(7)],
      2,
      ["# Titl", sourceSelection(6)],
      1,
      ["# Title\n\n", sourceSelection(9)]
    )
  }),
  defineCase({
    id: "structural-blank-arrow-down",
    title: "ArrowDown crosses a structural separator to the next visible paragraph",
    origin: "typora-oracle",
    command: "ArrowDown",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "structural-blank-arrow-down",
      contractReferences: [oracleReference("structural-blank-arrow-down")]
    }),
    initial: { source: "Paragraph one\n\nParagraph two", selection: sourceSelection(13) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["Paragraph one\n\nParagraph two", sourceSelection(28)],
      2,
      ["Paragraph one\n\nParagraph two", sourceSelection(28)],
      1,
      ["Paragraph one\n\nParagraph two", sourceSelection(28)]
    )
  })
];

export const namedFishMarkProbeCases: readonly EditorBehaviorCase[] = [
  defineCase({
    id: "blockquote-raw-prefix-hidden",
    title: "Focused blockquote prefix projects hidden marker geometry",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-raw-prefix-hidden",
    }),
    initial: { source: "> quote", selection: sourceSelection(2) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> quote", sourceSelection(2)],
      2,
      ["> quote", sourceSelection(2)],
      1,
      ["> quote", sourceSelection(2)]
    )
  }),
  defineCase({
    id: "blockquote-marker-commits-after-text",
    title: "Typing content commits a plain greater-than as a quote marker",
    origin: "fishmark-probe",
    command: "InsertText",
    insertedText: "quote",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-marker-commits-after-text",
    }),
    initial: { source: ">", selection: sourceSelection(1) },
    checkpointResults: checkpointResults(
      "wysiwym",
      [">quote", sourceSelection(6)],
      2,
      [">quotequote", sourceSelection(11)],
      1,
      [">", sourceSelection(1)]
    )
  }),
  defineCase({
    id: "blockquote-marker-commits-after-selection-move",
    title: "Moving away collapses an inactive bare quote separator",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-marker-commits-after-selection-move",
    }),
    initial: { source: ">\n\nParagraph", selection: sourceSelection(1) },
    semanticPaths: {
      primary: DOCUMENT_PARAGRAPH,
      repeat: DOCUMENT_PARAGRAPH,
      undo: DOCUMENT_PARAGRAPH
    },
    checkpointResults: checkpointResults(
      "wysiwym",
      [">\n\nParagraph", sourceSelection(3)],
      2,
      [">\n\nParagraph", sourceSelection(3)],
      1,
      [">\n\nParagraph", sourceSelection(3)]
    )
  }),
  defineCase({
    id: "nested-blockquote-marker-commits-after-text",
    title: "Typing nested content commits the inner quote marker",
    origin: "fishmark-probe",
    command: "InsertText",
    insertedText: "nested",
    containerPath: DOCUMENT_NESTED_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 2,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "nested-blockquote-marker-commits-after-text",
    }),
    initial: { source: "> >", selection: sourceSelection(3) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> >nested", sourceSelection(9)],
      2,
      ["> >nestednested", sourceSelection(15)],
      1,
      ["> >", sourceSelection(3)]
    )
  }),
  defineCase({
    id: "blockquote-marker-commits-after-enter",
    title: "Enter commits a quote marker and creates the next quoted line",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-marker-commits-after-enter",
    }),
    initial: { source: ">", selection: sourceSelection(1) },
    semanticPaths: { repeat: DOCUMENT_PARAGRAPH },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> \n> ", sourceSelection(5)],
      2,
      ["> \n\n", sourceSelection(4)],
      1,
      [">", sourceSelection(1)]
    )
  }),
  defineCase({
    id: "nested-blockquote-marker-commits-after-enter",
    title: "Enter commits a nested quote marker at the same quote depth",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_NESTED_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 2,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "nested-blockquote-marker-commits-after-enter",
    }),
    initial: { source: "> >", selection: sourceSelection(3) },
    semanticPaths: { repeat: DOCUMENT_BLOCKQUOTE_PARAGRAPH },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> > \n> > ", sourceSelection(9)],
      2,
      ["> > \n> \n> ", sourceSelection(10)],
      1,
      ["> >", sourceSelection(3)]
    )
  }),
  defineCase({
    id: "blockquote-bare-separator-rendering",
    title: "Inactive bare quote separator remains structurally collapsed",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-bare-separator-rendering",
    }),
    initial: {
      source: "> 1\n>\n> 222\n\nPlain paragraph",
      selection: sourceSelection(13)
    },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> 1\n>\n> 222\n\nPlain paragraph", sourceSelection(13)],
      2,
      ["> 1\n>\n> 222\n\nPlain paragraph", sourceSelection(13)],
      1,
      ["> 1\n>\n> 222\n\nPlain paragraph", sourceSelection(13)]
    )
  }),
  defineCase({
    id: "blockquote-structural-separator-navigation",
    title: "ArrowUp skips a quote-internal structural separator",
    origin: "fishmark-probe",
    command: "ArrowUp",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-structural-separator-navigation",
    }),
    initial: { source: "> 1\n>\n> 222", selection: sourceSelection(8) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> 1\n>\n> 222", sourceSelection(3)],
      2,
      ["> 1\n>\n> 222", sourceSelection(3)],
      1,
      ["> 1\n>\n> 222", sourceSelection(3)]
    )
  }),
  defineCase({
    id: "blockquote-trailing-empty-separator-backspace",
    title: "Backspace removes a trailing empty quote and its separator",
    origin: "fishmark-probe",
    command: "Backspace",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-trailing-empty-separator-backspace",
    }),
    initial: {
      source: "> 1111\n>\n> ",
      selection: sourceSelection("> 1111\n>\n> ".length)
    },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> 1111", sourceSelection(6)],
      2,
      ["> 111", sourceSelection(5)],
      1,
      ["> 1111\n>\n> ", sourceSelection("> 1111\n>\n> ".length)]
    )
  }),
  defineCase({
    id: "blockquote-list-trailing-empty-backspace",
    title: "Backspace removes trailing quote rows after a quoted list",
    origin: "fishmark-probe",
    command: "Backspace",
    containerPath: DOCUMENT_BLOCKQUOTE_LIST_PARAGRAPH,
    containerDepth: 2,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-list-trailing-empty-backspace",
    }),
    initial: {
      source: "> 111\n>\n> - list1\n> - list2\n>   - child list\n>\n> ",
      selection: sourceSelection("> 111\n>\n> - list1\n> - list2\n>   - child list\n>\n> ".length)
    },
    semanticPaths: {
      initial: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
      primary: [
        "Document",
        "Blockquote",
        "List",
        "ListItem",
        "List",
        "ListItem",
        "Paragraph"
      ],
      repeat: [
        "Document",
        "Blockquote",
        "List",
        "ListItem",
        "List",
        "ListItem",
        "Paragraph"
      ],
      undo: DOCUMENT_BLOCKQUOTE_PARAGRAPH
    },
    checkpointResults: checkpointResults(
      "wysiwym",
      [
        "> 111\n>\n> - list1\n> - list2\n>   - child list",
        sourceSelection("> 111\n>\n> - list1\n> - list2\n>   - child list".length)
      ],
      2,
      [
        "> 111\n>\n> - list1\n> - list2\n>   - child lis",
        sourceSelection("> 111\n>\n> - list1\n> - list2\n>   - child lis".length)
      ],
      1,
      [
        "> 111\n>\n> - list1\n> - list2\n>   - child list\n>\n> ",
        sourceSelection("> 111\n>\n> - list1\n> - list2\n>   - child list\n>\n> ".length)
      ]
    )
  }),
  defineCase({
    id: "nested-quote-list-repeated-enter-exit",
    title: "Repeated Enter exits a nested empty list into its quote depth",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: ["Document", "Blockquote", "Blockquote", "List", "ListItem", "Paragraph"],
    containerDepth: 3,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "nested-quote-list-repeated-enter-exit",
    }),
    initial: {
      source: "> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> >   -",
        selection: sourceSelection("> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> >   -".length)
    },
    semanticPaths: { repeat: DOCUMENT_NESTED_BLOCKQUOTE_PARAGRAPH },
    checkpointResults: checkpointResults(
      "wysiwym",
      [
        "> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> > -",
        sourceSelection("> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> > -".length)
      ],
      2,
      [
        "> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> > \n> > ",
        sourceSelection("> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> > \n> > ".length)
      ],
      1,
      [
        "> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> >   -",
        sourceSelection("> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> >   -".length)
      ]
    )
  }),
  ...[
    {
      id: "blockquote-bare-list-marker-tab" as const,
      title: "Tab indents a bare list marker inside a nested quote",
      path: ["Document", "Blockquote", "Blockquote", "List", "ListItem", "Paragraph"] as const,
      depth: 3,
      initial: "> > - parent\n> > -",
      expected: "> > - parent\n> >   - "
    },
    {
      id: "blockquote-padded-empty-list-item-tab" as const,
      title: "Tab indents an empty list item inside a quote",
      path: DOCUMENT_BLOCKQUOTE_LIST_PARAGRAPH,
      depth: 2,
      initial: "> - List1\n> - ",
      expected: "> - List1\n>   - "
    },
    {
      id: "blockquote-list-tab-after-residual-separator" as const,
      title: "Tab removes a residual quote separator while indenting",
      path: DOCUMENT_BLOCKQUOTE_LIST_PARAGRAPH,
      depth: 2,
      initial: "> - List 1\n>\n> - 2",
      expected: "> - List 1\n>   - 2"
    }
  ].map((input) =>
    defineCase({
      id: input.id,
      title: input.title,
      origin: "fishmark-probe",
      command: "Tab",
      containerPath: input.path,
      containerDepth: input.depth,
      lineContent: "empty",
      cursorPlacement: "line-end",
      viewMode: "wysiwym",
      classification: probeClassification({
        probeCaseId: input.id,
      }),
      initial: { source: input.initial, selection: sourceSelection(input.initial.length) },
      semanticPaths: {
        primary: [
          ...input.path.slice(0, -1),
          "List",
          "ListItem",
          "Paragraph"
        ],
        repeat: [
          ...input.path.slice(0, -1),
          "List",
          "ListItem",
          "Paragraph"
        ]
      },
      checkpointResults: checkpointResults(
        "wysiwym",
        [input.expected, sourceSelection(input.expected.length)],
        2,
        [input.expected, sourceSelection(input.expected.length)],
        1,
        [input.initial, sourceSelection(input.initial.length)]
      )
    })
  ),
  defineCase({
    id: "blockquote-list-exit-trailing-separator-cleanup",
    title: "Repeated Enter exits a quoted list and removes trailing quote rows",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_BLOCKQUOTE_LIST_PARAGRAPH,
    containerDepth: 2,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-list-exit-trailing-separator-cleanup",
    }),
    initial: { source: "> - List1\n> - ", selection: sourceSelection(14) },
    semanticPaths: {
      primary: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
      repeat: DOCUMENT_PARAGRAPH
    },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> - List1\n>\n> ", sourceSelection("> - List1\n>\n> ".length)],
      2,
      ["> - List1\n\n", sourceSelection("> - List1\n\n".length)],
      1,
      ["> - List1\n> - ", sourceSelection(14)]
    )
  }),
  defineCase({
    id: "blockquote-inner-blocks-rendering-enter",
    title: "Enter creates a quoted separator while nested blocks retain semantics",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-inner-blocks-rendering-enter",
    }),
    initial: { source: "> alpha", selection: sourceSelection(7) },
    semanticPaths: { repeat: DOCUMENT_PARAGRAPH },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> alpha\n>\n> ", sourceSelection(12)],
      2,
      ["> alpha\n\n", sourceSelection(9)],
      1,
      ["> alpha", sourceSelection(7)]
    )
  }),
  defineCase({
    id: "blockquote-code-fence-input",
    title: "Enter completes a fenced code block inside a blockquote",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_BLOCKQUOTE_CODE_FENCE,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-code-fence-input",
    }),
    initial: { source: "> ```\n\nPlain paragraph", selection: sourceSelection(5) },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> ```\n> \n> ```\n\nPlain paragraph", sourceSelection(8)],
      2,
      ["> ```\n> \n> \n> ```\n\nPlain paragraph", sourceSelection(11)],
      1,
      ["> ```\n\nPlain paragraph", sourceSelection(5)]
    )
  }),
  defineCase({
    id: "blockquote-table-rendering",
    title: "A table inside a blockquote retains source selection and projected geometry",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "blockquote-table-rendering",
    }),
    initial: {
      source: "> Before\n>\n> | name | qty |\n> | --- | ---: |\n> | pen | 2 |\n>\n> After",
      selection: sourceSelection(49)
    },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["> Before\n>\n> | name | qty |\n> | --- | ---: |\n> | pen | 2 |\n>\n> After", sourceSelection(49)],
      2,
      ["> Before\n>\n> | name | qty |\n> | --- | ---: |\n> | pen | 2 |\n>\n> After", sourceSelection(49)],
      1,
      ["> Before\n>\n> | name | qty |\n> | --- | ---: |\n> | pen | 2 |\n>\n> After", sourceSelection(49)]
    )
  }),
  defineCase({
    id: "deep-ordered-list-repeated-enter-exit",
    title: "Repeated Enter exits each level of a deep ordered list",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: [
      "Document",
      "List",
      "ListItem",
      "List",
      "ListItem",
      "List",
      "ListItem",
      "Paragraph"
    ],
    containerDepth: 3,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "deep-ordered-list-repeated-enter-exit",
    }),
    initial: {
      source: "1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1",
      selection: sourceSelection("1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1".length)
    },
    semanticPaths: { repeat: DOCUMENT_PARAGRAPH },
    checkpointResults: checkpointResults(
      "wysiwym",
      [
        "1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1\n    2. ",
        sourceSelection("1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1\n    2. ".length)
      ],
      4,
      [
        "1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1\n\n",
        sourceSelection("1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1\n\n".length)
      ],
      1,
      [
        "1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1",
        sourceSelection("1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1".length)
      ]
    )
  }),
  defineCase({
    id: "top-level-list-item-enter-body-upgrade",
    title: "Enter at a top-level list item start upgrades it to body text",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_LIST_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    classification: probeClassification({
      probeCaseId: "top-level-list-item-enter-body-upgrade",
    }),
    initial: { source: "1. Previous\n2. Body", selection: sourceSelection(15) },
    semanticPaths: { primary: DOCUMENT_PARAGRAPH, repeat: DOCUMENT_PARAGRAPH },
    checkpointResults: checkpointResults(
      "wysiwym",
      ["1. Previous\n\nBody", sourceSelection(13)],
      2,
      ["1. Previous\n\n\n\nBody", sourceSelection(15)],
      1,
      ["1. Previous\n2. Body", sourceSelection(15)]
    )
  })
];
