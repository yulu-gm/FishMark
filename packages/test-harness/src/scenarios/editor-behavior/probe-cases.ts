import {
  defineEditorBehaviorCase,
  desiredClassification,
  editorBehaviorResult,
  operationResult,
  probeCurrentEvidence,
  sourceSelection,
  type EditorBehaviorCase,
  type EditorBehaviorContractReference,
  type EditorBehaviorEvidenceAspect,
  type EditorBehaviorResult,
  type VisibleLineOptions
} from "./model";

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

function result(
  viewMode: "source" | "wysiwym",
  [source, selection, options]: ResultInput
): EditorBehaviorResult {
  return editorBehaviorResult(source, selection, viewMode, options);
}

function expectation(
  viewMode: "source" | "wysiwym",
  expected: ResultInput,
  repeatCount: number,
  repeat: ResultInput,
  undoCount: number,
  undo: ResultInput
): EditorBehaviorCase["expected"] {
  return {
    ...result(viewMode, expected),
    repeat: operationResult(repeatCount, result(viewMode, repeat)),
    undo: operationResult(undoCount, result(viewMode, undo))
  };
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
  readonly probeCaseId: Parameters<typeof probeCurrentEvidence>[0];
  readonly verifiedAspects: readonly EditorBehaviorEvidenceAspect[];
  readonly contractReferences?: readonly EditorBehaviorContractReference[];
  readonly note?: string;
}) {
  return desiredClassification({
    contractReferences: input.contractReferences ?? [roadmapReference()],
    currentEvidence: probeCurrentEvidence(
      input.probeCaseId,
      input.verifiedAspects,
      "The current named probe does not assert every RF-001 semantic geometry, repeat, undo, and mode aspect.",
      input.note
    )
  });
}

const SOURCE_SELECTION = ["command-plan", "source", "selection"] as const;
const SOURCE_SELECTION_REPEAT = [
  "command-plan",
  "source",
  "selection",
  "repeat"
] as const;

export const capturedOracleAndProbeCases: readonly EditorBehaviorCase[] = [
  defineEditorBehaviorCase({
    id: "empty-type-hash",
    title: "Typing a hash in an empty document preserves the source marker",
    origin: "typora-oracle",
    command: "InsertText",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "empty-type-hash",
      verifiedAspects: SOURCE_SELECTION,
      contractReferences: [oracleReference("empty-type-hash")]
    }),
    initial: { source: "", selection: sourceSelection(0) },
    expected: expectation(
      "wysiwym",
      ["#", sourceSelection(1)],
      2,
      ["##", sourceSelection(2)],
      1,
      ["", sourceSelection(0)]
    )
  }),
  defineEditorBehaviorCase({
    id: "empty-type-one-space",
    title: "Typing one space in an empty document preserves one source space",
    origin: "typora-oracle",
    command: "InsertText",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "empty-type-one-space",
      verifiedAspects: SOURCE_SELECTION,
      contractReferences: [oracleReference("empty-type-one-space")]
    }),
    initial: { source: "", selection: sourceSelection(0) },
    expected: expectation(
      "wysiwym",
      [" ", sourceSelection(1)],
      2,
      ["  ", sourceSelection(2)],
      1,
      ["", sourceSelection(0)]
    )
  }),
  defineEditorBehaviorCase({
    id: "empty-type-three-spaces",
    title: "Typing spaces in an empty document preserves whitespace source",
    origin: "typora-oracle",
    command: "InsertText",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "source",
    viewModeContract: "raw-source-geometry",
    classification: probeClassification({
      probeCaseId: "empty-type-three-spaces",
      verifiedAspects: SOURCE_SELECTION,
      contractReferences: [oracleReference("empty-type-three-spaces")]
    }),
    initial: { source: "", selection: sourceSelection(0) },
    expected: expectation(
      "source",
      ["   ", sourceSelection(3)],
      2,
      ["      ", sourceSelection(6)],
      1,
      ["", sourceSelection(0)]
    )
  }),
  defineEditorBehaviorCase({
    id: "empty-spaces-enter-text",
    title: "Enter after spaces creates a paragraph that accepts ordinary text",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "whitespace-only",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "empty-spaces-enter-text",
      verifiedAspects: SOURCE_SELECTION,
      contractReferences: [oracleReference("empty-spaces-enter-text")]
    }),
    initial: { source: "   ", selection: sourceSelection(3) },
    expected: expectation(
      "wysiwym",
      ["   \n\nabc", sourceSelection(8)],
      2,
      ["   \n\nabc\n\n", sourceSelection(10)],
      1,
      ["   ", sourceSelection(3)]
    )
  }),
  defineEditorBehaviorCase({
    id: "whitespace-line-enter",
    title: "Repeated Enter preserves the whitespace physical line",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "whitespace-only",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "empty-spaces-repeated-enter",
      verifiedAspects: SOURCE_SELECTION_REPEAT
    }),
    initial: { source: "   ", selection: sourceSelection(3) },
    expected: expectation(
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
    return defineEditorBehaviorCase({
      id: input.id,
      title: input.title,
      origin: "typora-oracle",
      command: "Enter",
      containerPath: DOCUMENT_PARAGRAPH,
      containerDepth: 0,
      lineContent: "content",
      cursorPlacement: input.placement,
      viewMode: "wysiwym",
      viewModeContract: "projected-geometry",
      classification: probeClassification({
        probeCaseId: input.id as "paragraph-end-enter" | "paragraph-middle-enter" | "paragraph-start-enter",
        verifiedAspects: SOURCE_SELECTION,
        contractReferences: [oracleReference(input.id)]
      }),
      initial: { source: initialSource, selection: input.initialSelection },
      expected: expectation(
        "wysiwym",
        [input.expectedSource, input.expectedSelection],
        2,
        [input.repeatSource, input.repeatSelection],
        1,
        [initialSource, input.initialSelection]
      )
    });
  }),
  defineEditorBehaviorCase({
    id: "heading-end-enter",
    title: "Enter after a heading creates a paragraph without copying the heading marker",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "heading-end-enter",
      verifiedAspects: SOURCE_SELECTION,
      contractReferences: [oracleReference("heading-end-enter")]
    }),
    initial: { source: "# Title", selection: sourceSelection(7) },
    expected: expectation(
      "wysiwym",
      ["# Title\n\n", sourceSelection(9)],
      2,
      ["# Title\n\n\n\n", sourceSelection(11)],
      1,
      ["# Title", sourceSelection(7)]
    )
  }),
  defineEditorBehaviorCase({
    id: "heading-end-repeated-enter",
    title: "Repeated Enter after a heading accumulates distinct empty paragraphs",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "heading-end-repeated-enter",
      verifiedAspects: SOURCE_SELECTION_REPEAT,
      contractReferences: [oracleReference("heading-end-repeated-enter")]
    }),
    initial: { source: "# Title", selection: sourceSelection(7) },
    expected: expectation(
      "wysiwym",
      ["# Title\n\n", sourceSelection(9)],
      3,
      ["# Title\n\n\n\n\n\n", sourceSelection(13)],
      1,
      ["# Title", sourceSelection(7)]
    )
  }),
  defineEditorBehaviorCase({
    id: "heading-empty-paragraph-space",
    title: "A space in the empty paragraph after a heading remains editable source",
    origin: "typora-oracle",
    command: "InsertText",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "heading-empty-paragraph-space",
      verifiedAspects: SOURCE_SELECTION,
      contractReferences: [oracleReference("heading-empty-paragraph-space")]
    }),
    initial: { source: "# Title\n\n", selection: sourceSelection(9) },
    expected: expectation(
      "wysiwym",
      ["# Title\n\n ", sourceSelection(10)],
      2,
      ["# Title\n\n  ", sourceSelection(11)],
      1,
      ["# Title\n\n", sourceSelection(9)]
    )
  }),
  defineEditorBehaviorCase({
    id: "heading-empty-paragraph-backspace",
    title: "Backspace from the empty paragraph below a heading rejoins the heading",
    origin: "typora-oracle",
    command: "Backspace",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "heading-empty-paragraph-backspace",
      verifiedAspects: SOURCE_SELECTION,
      contractReferences: [oracleReference("heading-empty-paragraph-backspace")]
    }),
    initial: { source: "# Title\n\n", selection: sourceSelection(9) },
    expected: expectation(
      "wysiwym",
      ["# Title", sourceSelection(7)],
      2,
      ["# Titl", sourceSelection(6)],
      1,
      ["# Title\n\n", sourceSelection(9)]
    )
  }),
  defineEditorBehaviorCase({
    id: "structural-blank-arrow-down",
    title: "ArrowDown crosses a structural separator to the next visible paragraph",
    origin: "typora-oracle",
    command: "ArrowDown",
    containerPath: DOCUMENT_PARAGRAPH,
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "structural-blank-arrow-down",
      verifiedAspects: SOURCE_SELECTION,
      contractReferences: [oracleReference("structural-blank-arrow-down")]
    }),
    initial: { source: "Paragraph one\n\nParagraph two", selection: sourceSelection(13) },
    expected: expectation(
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
  defineEditorBehaviorCase({
    id: "blockquote-raw-prefix-hidden",
    title: "Focused blockquote prefix projects hidden marker geometry",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-raw-prefix-hidden",
      verifiedAspects: ["physical-geometry", "view-mode"]
    }),
    initial: { source: "> quote", selection: sourceSelection(2) },
    expected: expectation(
      "wysiwym",
      ["> quote", sourceSelection(2)],
      2,
      ["> quote", sourceSelection(2)],
      1,
      ["> quote", sourceSelection(2)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-marker-commits-after-text",
    title: "Typing content commits a plain greater-than as a quote marker",
    origin: "fishmark-probe",
    command: "InsertText",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-marker-commits-after-text",
      verifiedAspects: [...SOURCE_SELECTION, "visible-line-roles", "view-mode"]
    }),
    initial: { source: ">", selection: sourceSelection(1) },
    expected: expectation(
      "wysiwym",
      [">quote", sourceSelection(6)],
      2,
      [">quotequote", sourceSelection(11)],
      1,
      [">", sourceSelection(1)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-marker-commits-after-selection-move",
    title: "Moving away collapses an inactive bare quote separator",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-marker-commits-after-selection-move",
      verifiedAspects: ["source", "visible-line-roles", "view-mode"]
    }),
    initial: { source: ">\n\nParagraph", selection: sourceSelection(1) },
    expected: expectation(
      "wysiwym",
      [">\n\nParagraph", sourceSelection(3)],
      2,
      [">\n\nParagraph", sourceSelection(3)],
      1,
      [">\n\nParagraph", sourceSelection(3)]
    )
  }),
  defineEditorBehaviorCase({
    id: "nested-blockquote-marker-commits-after-text",
    title: "Typing nested content commits the inner quote marker",
    origin: "fishmark-probe",
    command: "InsertText",
    containerPath: DOCUMENT_NESTED_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 2,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "nested-blockquote-marker-commits-after-text",
      verifiedAspects: [...SOURCE_SELECTION, "visible-line-roles", "view-mode"]
    }),
    initial: { source: "> >", selection: sourceSelection(3) },
    expected: expectation(
      "wysiwym",
      ["> >nested", sourceSelection(9)],
      2,
      ["> >nestednested", sourceSelection(15)],
      1,
      ["> >", sourceSelection(3)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-marker-commits-after-enter",
    title: "Enter commits a quote marker and creates the next quoted line",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-marker-commits-after-enter",
      verifiedAspects: SOURCE_SELECTION
    }),
    initial: { source: ">", selection: sourceSelection(1) },
    expected: expectation(
      "wysiwym",
      ["> \n> ", sourceSelection(5)],
      2,
      ["> \n\n", sourceSelection(4)],
      1,
      [">", sourceSelection(1)]
    )
  }),
  defineEditorBehaviorCase({
    id: "nested-blockquote-marker-commits-after-enter",
    title: "Enter commits a nested quote marker at the same quote depth",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_NESTED_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 2,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "nested-blockquote-marker-commits-after-enter",
      verifiedAspects: SOURCE_SELECTION
    }),
    initial: { source: "> >", selection: sourceSelection(3) },
    expected: expectation(
      "wysiwym",
      ["> > \n> > ", sourceSelection(9)],
      2,
      ["> > \n> \n> ", sourceSelection(10)],
      1,
      ["> >", sourceSelection(3)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-bare-separator-rendering",
    title: "Inactive bare quote separator remains structurally collapsed",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-bare-separator-rendering",
      verifiedAspects: ["visible-line-roles", "view-mode"]
    }),
    initial: {
      source: "> 1\n>\n> 222\n\nPlain paragraph",
      selection: sourceSelection(13)
    },
    expected: expectation(
      "wysiwym",
      ["> 1\n>\n> 222\n\nPlain paragraph", sourceSelection(13)],
      2,
      ["> 1\n>\n> 222\n\nPlain paragraph", sourceSelection(13)],
      1,
      ["> 1\n>\n> 222\n\nPlain paragraph", sourceSelection(13)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-structural-separator-navigation",
    title: "ArrowUp skips a quote-internal structural separator",
    origin: "fishmark-probe",
    command: "ArrowUp",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-structural-separator-navigation",
      verifiedAspects: ["selection", "visible-line-roles", "view-mode"]
    }),
    initial: { source: "> 1\n>\n> 222", selection: sourceSelection(8) },
    expected: expectation(
      "wysiwym",
      ["> 1\n>\n> 222", sourceSelection(3)],
      2,
      ["> 1\n>\n> 222", sourceSelection(3)],
      1,
      ["> 1\n>\n> 222", sourceSelection(3)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-trailing-empty-separator-backspace",
    title: "Backspace removes a trailing empty quote and its separator",
    origin: "fishmark-probe",
    command: "Backspace",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-trailing-empty-separator-backspace",
      verifiedAspects: [...SOURCE_SELECTION, "visible-line-roles"]
    }),
    initial: {
      source: "> 1111\n>\n> ",
      selection: sourceSelection("> 1111\n>\n> ".length)
    },
    expected: expectation(
      "wysiwym",
      ["> 1111", sourceSelection(6)],
      2,
      ["> 111", sourceSelection(5)],
      1,
      ["> 1111\n>\n> ", sourceSelection("> 1111\n>\n> ".length)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-list-trailing-empty-backspace",
    title: "Backspace removes trailing quote rows after a quoted list",
    origin: "fishmark-probe",
    command: "Backspace",
    containerPath: DOCUMENT_BLOCKQUOTE_LIST_PARAGRAPH,
    containerDepth: 2,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-list-trailing-empty-backspace",
      verifiedAspects: [...SOURCE_SELECTION, "visible-line-roles"]
    }),
    initial: {
      source: "> 111\n>\n> - list1\n> - list2\n>   - child list\n>\n> ",
      selection: sourceSelection("> 111\n>\n> - list1\n> - list2\n>   - child list\n>\n> ".length)
    },
    expected: expectation(
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
  defineEditorBehaviorCase({
    id: "nested-quote-list-repeated-enter-exit",
    title: "Repeated Enter exits a nested empty list into its quote depth",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: ["Document", "Blockquote", "Blockquote", "List", "ListItem", "Paragraph"],
    containerDepth: 3,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "nested-quote-list-repeated-enter-exit",
      verifiedAspects: SOURCE_SELECTION_REPEAT
    }),
    initial: {
      source: "> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> >   -",
      selection: sourceSelection("> 引用块\n>\n> > 二级引用块\n> > - List 1\n> > - List 2\n> >   - List 2.1\n> >   -".length)
    },
    expected: expectation(
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
    defineEditorBehaviorCase({
      id: input.id,
      title: input.title,
      origin: "fishmark-probe",
      command: "Tab",
      containerPath: input.path,
      containerDepth: input.depth,
      lineContent: "empty",
      cursorPlacement: "line-end",
      viewMode: "wysiwym",
      viewModeContract: "projected-geometry",
      classification: probeClassification({
        probeCaseId: input.id,
        verifiedAspects: [...SOURCE_SELECTION, "visible-line-roles"]
      }),
      initial: { source: input.initial, selection: sourceSelection(input.initial.length) },
      expected: expectation(
        "wysiwym",
        [input.expected, sourceSelection(input.expected.length)],
        2,
        [input.expected, sourceSelection(input.expected.length)],
        1,
        [input.initial, sourceSelection(input.initial.length)]
      )
    })
  ),
  defineEditorBehaviorCase({
    id: "blockquote-list-exit-trailing-separator-cleanup",
    title: "Repeated Enter exits a quoted list and removes trailing quote rows",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_BLOCKQUOTE_LIST_PARAGRAPH,
    containerDepth: 2,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-list-exit-trailing-separator-cleanup",
      verifiedAspects: SOURCE_SELECTION_REPEAT
    }),
    initial: { source: "> - List1\n> - ", selection: sourceSelection(14) },
    expected: expectation(
      "wysiwym",
      ["> - List1\n>\n> ", sourceSelection("> - List1\n>\n> ".length)],
      2,
      ["> - List1\n\n", sourceSelection("> - List1\n\n".length)],
      1,
      ["> - List1\n> - ", sourceSelection(14)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-inner-blocks-rendering-enter",
    title: "Enter creates a quoted separator while nested blocks retain semantics",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-inner-blocks-rendering-enter",
      verifiedAspects: [...SOURCE_SELECTION, "visible-line-roles", "view-mode"],
      note: "The named probe also covers nested quotes, lists, fenced code, block math, list indentation, and repeated exits."
    }),
    initial: { source: "> alpha", selection: sourceSelection(7) },
    expected: expectation(
      "wysiwym",
      ["> alpha\n>\n> ", sourceSelection(12)],
      2,
      ["> alpha\n\n", sourceSelection(9)],
      1,
      ["> alpha", sourceSelection(7)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-code-fence-input",
    title: "Enter completes a fenced code block inside a blockquote",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_BLOCKQUOTE_CODE_FENCE,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-code-fence-input",
      verifiedAspects: [...SOURCE_SELECTION, "visible-line-roles", "physical-geometry"]
    }),
    initial: { source: "> ```\n\nPlain paragraph", selection: sourceSelection(5) },
    expected: expectation(
      "wysiwym",
      ["> ```\n> \n> ```\n\nPlain paragraph", sourceSelection(8)],
      2,
      ["> ```\n> \n> \n> ```\n\nPlain paragraph", sourceSelection(11)],
      1,
      ["> ```\n\nPlain paragraph", sourceSelection(5)]
    )
  }),
  defineEditorBehaviorCase({
    id: "blockquote-table-rendering",
    title: "A table inside a blockquote retains source selection and projected geometry",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: DOCUMENT_BLOCKQUOTE_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "blockquote-table-rendering",
      verifiedAspects: ["physical-geometry", "view-mode"]
    }),
    initial: {
      source: "> Before\n>\n> | name | qty |\n> | --- | ---: |\n> | pen | 2 |\n>\n> After",
      selection: sourceSelection(49)
    },
    expected: expectation(
      "wysiwym",
      ["> Before\n>\n> | name | qty |\n> | --- | ---: |\n> | pen | 2 |\n>\n> After", sourceSelection(49)],
      2,
      ["> Before\n>\n> | name | qty |\n> | --- | ---: |\n> | pen | 2 |\n>\n> After", sourceSelection(49)],
      1,
      ["> Before\n>\n> | name | qty |\n> | --- | ---: |\n> | pen | 2 |\n>\n> After", sourceSelection(49)]
    )
  }),
  defineEditorBehaviorCase({
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
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "deep-ordered-list-repeated-enter-exit",
      verifiedAspects: ["command-plan", "source", "selection", "repeat", "physical-geometry"]
    }),
    initial: {
      source: "1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1",
      selection: sourceSelection("1. 111\n2. 222\n  1. 2.1\n    1. 2.1.1".length)
    },
    expected: expectation(
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
  defineEditorBehaviorCase({
    id: "top-level-list-item-enter-body-upgrade",
    title: "Enter at a top-level list item start upgrades it to body text",
    origin: "fishmark-probe",
    command: "Enter",
    containerPath: DOCUMENT_LIST_PARAGRAPH,
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: probeClassification({
      probeCaseId: "top-level-list-item-enter-body-upgrade",
      verifiedAspects: [...SOURCE_SELECTION, "physical-geometry"]
    }),
    initial: { source: "1. Previous\n2. Body", selection: sourceSelection(15) },
    expected: expectation(
      "wysiwym",
      ["1. Previous\n\nBody", sourceSelection(13)],
      2,
      ["1. Previous\n\n\n\nBody", sourceSelection(15)],
      1,
      ["1. Previous\n2. Body", sourceSelection(15)]
    )
  })
];
