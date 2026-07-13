import type { TestScenario } from "../scenario";

export type EditorBehaviorCommand =
  | "InsertText"
  | "Enter"
  | "Backspace"
  | "Tab"
  | "Shift+Tab"
  | "ArrowUp"
  | "ArrowDown"
  | "selection";

export type EditorBehaviorContainer =
  | "Document"
  | "Paragraph"
  | "List"
  | "ListItem"
  | "Blockquote"
  | "CodeFence"
  | "BlockMath";

export type EditorBehaviorContainerPath = readonly EditorBehaviorContainer[];

export type SourceSelection = {
  readonly anchor: number;
  readonly head: number;
};

export type VisiblePhysicalLineRole =
  | "content"
  | "empty-editing-line"
  | "whitespace-only"
  | "structural-separator"
  | "container-marker"
  | "code-fence-delimiter"
  | "code-fence-content"
  | "block-math-delimiter"
  | "block-math-content";

export type VisiblePhysicalLineExpectation = {
  /** One-based physical source line number. */
  readonly line: number;
  readonly role: VisiblePhysicalLineRole;
  readonly geometry: {
    /** Semantic container depth; independent of DOM/CSS implementation. */
    readonly containerDepth: number;
    /** Zero-based source column where editable leaf content starts. */
    readonly contentColumn: number;
    readonly visibility: "visible" | "collapsed";
  };
};

export type EditorBehaviorResult = {
  readonly source: string;
  readonly selection: SourceSelection;
  readonly visibleLines: readonly VisiblePhysicalLineExpectation[];
};

export type EditorBehaviorClassification =
  | {
      readonly kind: "desired";
      readonly currentStatus: "aligned" | "contract-only";
      readonly evidence: readonly string[];
    }
  | {
      readonly kind: "known-defect";
      readonly reason: string;
      readonly evidence: readonly string[];
      readonly observed: EditorBehaviorResult;
    };

export type EditorBehaviorCase = {
  readonly id: string;
  readonly title: string;
  readonly origin: "typora-oracle" | "fishmark-probe" | "recursive-parity";
  readonly command: EditorBehaviorCommand;
  readonly containerPath: EditorBehaviorContainerPath;
  /** Counts semantic containers (List/Blockquote), not Document, ListItem, or leaf. */
  readonly containerDepth: number;
  readonly lineContent: "empty" | "whitespace-only" | "content";
  readonly cursorPlacement: "line-start" | "line-middle" | "line-end" | "range";
  readonly viewMode: "source" | "wysiwym";
  readonly viewModeContract: "mode-independent" | "raw-source-geometry" | "projected-geometry";
  readonly classification: EditorBehaviorClassification;
  readonly initial: {
    readonly source: string;
    readonly selection: SourceSelection;
  };
  readonly expected: EditorBehaviorResult & {
    readonly repeat: EditorBehaviorResult & {
      readonly operationCount: number;
    };
    readonly undo: EditorBehaviorResult & {
      readonly operationCount: number;
    };
  };
};

export type EditorBehaviorCaseQuery = {
  readonly command?: EditorBehaviorCommand;
  readonly containerPath?: EditorBehaviorContainerPath;
};

const desiredAligned = (...evidence: string[]): EditorBehaviorClassification => ({
  kind: "desired",
  currentStatus: "aligned",
  evidence
});

const desiredContractOnly = (...evidence: string[]): EditorBehaviorClassification => ({
  kind: "desired",
  currentStatus: "contract-only",
  evidence
});

function selection(anchor: number, head = anchor): SourceSelection {
  return { anchor, head };
}

function geometryForLine(text: string): {
  readonly containerDepth: number;
  readonly contentColumn: number;
} {
  let containerDepth = 0;
  let contentColumn = 0;

  while (contentColumn < text.length) {
    const whitespaceStart = contentColumn;
    while (text[contentColumn] === " ") {
      contentColumn += 1;
    }
    containerDepth += Math.floor((contentColumn - whitespaceStart) / 2);

    if (text[contentColumn] === ">") {
      containerDepth += 1;
      contentColumn += 1;
      if (text[contentColumn] === " ") {
        contentColumn += 1;
      }
      continue;
    }

    const listMarker = /^(?:[-+*]|\d+[.)])\s/.exec(text.slice(contentColumn));
    if (listMarker) {
      containerDepth += 1;
      contentColumn += listMarker[0].length;
      const taskMarker = /^\[[ xX]\]\s/.exec(text.slice(contentColumn));
      if (taskMarker) {
        contentColumn += taskMarker[0].length;
      }
      continue;
    }

    break;
  }

  return { containerDepth, contentColumn };
}

function roleForLine(
  text: string,
  contentColumn: number,
  index: number,
  lines: readonly string[]
): VisiblePhysicalLineRole {
  if (/^\s+$/.test(text)) {
    return "whitespace-only";
  }
  const content = text.slice(contentColumn);
  if (content.startsWith("```")) {
    return "code-fence-delimiter";
  }
  if (content === "$$") {
    return "block-math-delimiter";
  }
  if (text.length > 0 && content.length === 0) {
    return "container-marker";
  }
  if (text.length === 0) {
    return index === lines.length - 1 ? "empty-editing-line" : "structural-separator";
  }
  return "content";
}

function visibleLines(
  source: string,
  overrides: Readonly<Partial<Record<number, VisiblePhysicalLineRole>>> = {}
): readonly VisiblePhysicalLineExpectation[] {
  const lines = source.split("\n");
  let insideCodeFence = false;
  let insideBlockMath = false;
  return lines.map((text, index) => {
    const geometry = geometryForLine(text);
    const derivedRole = roleForLine(text, geometry.contentColumn, index, lines);
    let role = overrides[index + 1] ?? derivedRole;

    if (derivedRole === "code-fence-delimiter") {
      insideCodeFence = !insideCodeFence;
    } else if (derivedRole === "block-math-delimiter") {
      insideBlockMath = !insideBlockMath;
    } else if (!overrides[index + 1] && insideCodeFence) {
      role = "code-fence-content";
    } else if (!overrides[index + 1] && insideBlockMath) {
      role = "block-math-content";
    }

    return {
      line: index + 1,
      role,
      geometry: {
        ...geometry,
        visibility: "visible"
      }
    };
  });
}

type CaseInput = Omit<EditorBehaviorCase, "expected"> & {
  readonly expected: EditorBehaviorResult;
  readonly repeat: EditorBehaviorResult & { readonly operationCount?: number };
  readonly undo?: EditorBehaviorResult & { readonly operationCount?: number };
};

function behaviorCase(input: CaseInput): EditorBehaviorCase {
  return {
    ...input,
    expected: {
      ...input.expected,
      repeat: {
        ...input.repeat,
        operationCount: input.repeat.operationCount ?? 2
      },
      undo: {
        ...(input.undo ?? {
          source: input.initial.source,
          selection: input.initial.selection,
          visibleLines: visibleLines(input.initial.source)
        }),
        operationCount: input.undo?.operationCount ?? 1
      }
    }
  };
}

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

export function formatContainerPath(path: EditorBehaviorContainerPath): string {
  return path.join(" > ");
}

const oracleAndProbeCases: readonly EditorBehaviorCase[] = [
  behaviorCase({
    id: "empty-type-hash",
    title: "Typing a hash in an empty document preserves the source marker",
    origin: "typora-oracle",
    command: "InsertText",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/empty-type-hash.json",
      "FishMark probe: empty-type-hash"
    ),
    initial: { source: "", selection: selection(0) },
    expected: { source: "#", selection: selection(1), visibleLines: visibleLines("#") },
    repeat: { source: "##", selection: selection(2), visibleLines: visibleLines("##") }
  }),
  behaviorCase({
    id: "empty-type-three-spaces",
    title: "Typing spaces in an empty document preserves whitespace source",
    origin: "typora-oracle",
    command: "InsertText",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "source",
    viewModeContract: "raw-source-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/empty-type-three-spaces.json",
      "FishMark probe: empty-type-three-spaces"
    ),
    initial: { source: "", selection: selection(0) },
    expected: { source: "   ", selection: selection(3), visibleLines: visibleLines("   ") },
    repeat: { source: "      ", selection: selection(6), visibleLines: visibleLines("      ") }
  }),
  behaviorCase({
    id: "empty-type-one-space",
    title: "Typing one space in an empty document preserves one source space",
    origin: "typora-oracle",
    command: "InsertText",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/empty-type-one-space.json",
      "FishMark probe: empty-type-one-space"
    ),
    initial: { source: "", selection: selection(0) },
    expected: { source: " ", selection: selection(1), visibleLines: visibleLines(" ") },
    repeat: { source: "  ", selection: selection(2), visibleLines: visibleLines("  ") }
  }),
  behaviorCase({
    id: "empty-spaces-enter-text",
    title: "Enter after spaces creates a paragraph that accepts ordinary text",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "whitespace-only",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/empty-spaces-enter-text.json",
      "FishMark probe: empty-spaces-enter-text"
    ),
    initial: { source: "   ", selection: selection(3) },
    expected: { source: "   \n\nabc", selection: selection(8), visibleLines: visibleLines("   \n\nabc") },
    repeat: { source: "   \n\nabc\n\n", selection: selection(10), visibleLines: visibleLines("   \n\nabc\n\n") },
    undo: { source: "   \n\n", selection: selection(5), visibleLines: visibleLines("   \n\n") }
  }),
  behaviorCase({
    id: "whitespace-line-enter",
    title: "Enter on a whitespace-only line preserves the whitespace physical line",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "whitespace-only",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "FishMark probe: empty-spaces-repeated-enter",
      "Typora whitespace-line placement capture remains blocked; source contract comes from current intentional FishMark behavior"
    ),
    initial: { source: "   ", selection: selection(3) },
    expected: { source: "   \n\n", selection: selection(5), visibleLines: visibleLines("   \n\n") },
    repeat: { source: "   \n\n\n\n", selection: selection(7), visibleLines: visibleLines("   \n\n\n\n") }
  }),
  behaviorCase({
    id: "paragraph-end-enter",
    title: "Enter at paragraph end creates a visible empty paragraph",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/paragraph-end-enter.json",
      "FishMark probe: paragraph-end-enter"
    ),
    initial: { source: "Paragraph", selection: selection(9) },
    expected: { source: "Paragraph\n\n", selection: selection(11), visibleLines: visibleLines("Paragraph\n\n") },
    repeat: { source: "Paragraph\n\n\n\n", selection: selection(13), visibleLines: visibleLines("Paragraph\n\n\n\n") }
  }),
  behaviorCase({
    id: "paragraph-middle-enter",
    title: "Enter in paragraph content splits at the source selection",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-middle",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/paragraph-middle-enter.json",
      "FishMark probe: paragraph-middle-enter"
    ),
    initial: { source: "AlphaBeta", selection: selection(5) },
    expected: { source: "Alpha\n\nBeta", selection: selection(7), visibleLines: visibleLines("Alpha\n\nBeta") },
    repeat: { source: "Alpha\n\n\n\nBeta", selection: selection(9), visibleLines: visibleLines("Alpha\n\n\n\nBeta") }
  }),
  behaviorCase({
    id: "paragraph-start-enter",
    title: "Enter at paragraph start creates a visible empty paragraph above",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-start",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/paragraph-start-enter.json",
      "FishMark probe: paragraph-start-enter"
    ),
    initial: { source: "Paragraph", selection: selection(0) },
    expected: { source: "\n\nParagraph", selection: selection(2), visibleLines: visibleLines("\n\nParagraph") },
    repeat: { source: "\n\n\n\nParagraph", selection: selection(4), visibleLines: visibleLines("\n\n\n\nParagraph") }
  }),
  behaviorCase({
    id: "heading-end-repeated-enter",
    title: "Repeated Enter after a heading accumulates distinct empty paragraphs",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/heading-end-repeated-enter.json",
      "FishMark probe: heading-end-repeated-enter (fresh RF-001 preflight aligned)"
    ),
    initial: { source: "# Title", selection: selection(7) },
    expected: { source: "# Title\n\n", selection: selection(9), visibleLines: visibleLines("# Title\n\n") },
    repeat: {
      operationCount: 3,
      source: "# Title\n\n\n\n\n\n",
      selection: selection(13),
      visibleLines: visibleLines("# Title\n\n\n\n\n\n")
    }
  }),
  behaviorCase({
    id: "heading-end-enter",
    title: "Enter after a heading creates a paragraph without copying the heading marker",
    origin: "typora-oracle",
    command: "Enter",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/heading-end-enter.json",
      "FishMark probe: heading-end-enter"
    ),
    initial: { source: "# Title", selection: selection(7) },
    expected: { source: "# Title\n\n", selection: selection(9), visibleLines: visibleLines("# Title\n\n") },
    repeat: { source: "# Title\n\n\n\n", selection: selection(11), visibleLines: visibleLines("# Title\n\n\n\n") }
  }),
  behaviorCase({
    id: "heading-empty-paragraph-space",
    title: "A space in the empty paragraph after a heading remains editable source",
    origin: "typora-oracle",
    command: "InsertText",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/heading-empty-paragraph-space.json",
      "FishMark probe: heading-empty-paragraph-space"
    ),
    initial: { source: "# Title\n\n", selection: selection(9) },
    expected: { source: "# Title\n\n ", selection: selection(10), visibleLines: visibleLines("# Title\n\n ") },
    repeat: { source: "# Title\n\n  ", selection: selection(11), visibleLines: visibleLines("# Title\n\n  ") }
  }),
  behaviorCase({
    id: "heading-empty-paragraph-backspace",
    title: "Backspace from the empty paragraph below a heading rejoins the heading",
    origin: "typora-oracle",
    command: "Backspace",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "empty",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/heading-empty-paragraph-backspace.json",
      "FishMark probe: heading-empty-paragraph-backspace"
    ),
    initial: { source: "# Title\n\n", selection: selection(9) },
    expected: { source: "# Title", selection: selection(7), visibleLines: visibleLines("# Title") },
    repeat: { source: "# Titl", selection: selection(6), visibleLines: visibleLines("# Titl") }
  }),
  behaviorCase({
    id: "structural-blank-arrow-down",
    title: "ArrowDown crosses a structural separator to the next visible paragraph",
    origin: "typora-oracle",
    command: "ArrowDown",
    containerPath: requiredEditorBehaviorContainerPaths[0],
    containerDepth: 0,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredAligned(
      "Typora 1.13.4 oracle: docs/plans/typora-like-editor/oracle/structural-blank-arrow-down.json",
      "FishMark probe: structural-blank-arrow-down (fresh RF-001 preflight aligned)"
    ),
    initial: { source: "Paragraph one\n\nParagraph two", selection: selection(13) },
    expected: {
      source: "Paragraph one\n\nParagraph two",
      selection: selection(28),
      visibleLines: visibleLines("Paragraph one\n\nParagraph two")
    },
    repeat: {
      source: "Paragraph one\n\nParagraph two",
      selection: selection(28),
      visibleLines: visibleLines("Paragraph one\n\nParagraph two")
    },
    undo: {
      source: "Paragraph one\n\nParagraph two",
      selection: selection(28),
      visibleLines: visibleLines("Paragraph one\n\nParagraph two")
    }
  })
];

const parityCases: readonly EditorBehaviorCase[] = [
  behaviorCase({
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
    classification: desiredAligned(
      'packages/editor-core/src/commands/list-edits.test.ts: "removes an unordered list marker at the current item content start on Backspace"'
    ),
    initial: { source: "- item", selection: selection(2) },
    expected: { source: "item", selection: selection(0), visibleLines: visibleLines("item") },
    repeat: { source: "item", selection: selection(0), visibleLines: visibleLines("item") }
  }),
  behaviorCase({
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
    classification: desiredAligned(
      'src/renderer/code-editor.test.ts: "indents a second-level unordered item into a third-level child list when Tab is pressed"'
    ),
    initial: { source: "- parent\n  - child\n  - target", selection: selection(25) },
    expected: {
      source: "- parent\n  - child\n    - target",
      selection: selection(27),
      visibleLines: visibleLines("- parent\n  - child\n    - target")
    },
    repeat: {
      source: "- parent\n  - child\n    - target",
      selection: selection(27),
      visibleLines: visibleLines("- parent\n  - child\n    - target")
    }
  }),
  behaviorCase({
    id: "blockquote-arrow-down",
    title: "ArrowDown preserves the visual column across quoted paragraphs",
    origin: "fishmark-probe",
    command: "ArrowDown",
    containerPath: requiredEditorBehaviorContainerPaths[3],
    containerDepth: 1,
    lineContent: "content",
    cursorPlacement: "line-end",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredContractOnly(
      "Recursive parity contract; current blockquote structural-separator probe covers ArrowUp and Backspace, not this ArrowDown source"
    ),
    initial: { source: "> first\n>\n> second", selection: selection(7) },
    expected: { source: "> first\n>\n> second", selection: selection(18), visibleLines: visibleLines("> first\n>\n> second") },
    repeat: { source: "> first\n>\n> second", selection: selection(18), visibleLines: visibleLines("> first\n>\n> second") },
    undo: { source: "> first\n>\n> second", selection: selection(18), visibleLines: visibleLines("> first\n>\n> second") }
  }),
  behaviorCase({
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
    classification: desiredContractOnly("Recursive parity contract; current named probe covers quote navigation at one depth"),
    initial: { source: "> > first\n> > second", selection: selection(20) },
    expected: { source: "> > first\n> > second", selection: selection(9), visibleLines: visibleLines("> > first\n> > second") },
    repeat: { source: "> > first\n> > second", selection: selection(9), visibleLines: visibleLines("> > first\n> > second") },
    undo: { source: "> > first\n> > second", selection: selection(9), visibleLines: visibleLines("> > first\n> > second") }
  }),
  behaviorCase({
    id: "blockquote-list-shift-tab",
    title: "Shift+Tab outdents one quoted list level without leaving the quote",
    origin: "fishmark-probe",
    command: "Shift+Tab",
    containerPath: requiredEditorBehaviorContainerPaths[5],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "line-middle",
    viewMode: "wysiwym",
    viewModeContract: "projected-geometry",
    classification: desiredContractOnly(
      "Recursive parity contract; current quoted-list probes do not execute Shift+Tab on this source"
    ),
    initial: { source: "> - first\n>   - second", selection: selection(17) },
    expected: { source: "> - first\n> - second", selection: selection(15), visibleLines: visibleLines("> - first\n> - second") },
    repeat: { source: "> - first\n> - second", selection: selection(15), visibleLines: visibleLines("> - first\n> - second") }
  }),
  behaviorCase({
    id: "blockquote-list-code-fence-selection",
    title: "Range selection maps to quoted fenced-code source offsets",
    origin: "fishmark-probe",
    command: "selection",
    containerPath: requiredEditorBehaviorContainerPaths[6],
    containerDepth: 2,
    lineContent: "content",
    cursorPlacement: "range",
    viewMode: "source",
    viewModeContract: "raw-source-geometry",
    classification: desiredContractOnly(
      "Roadmap 7.7 requires range-selection mapping at Document > Blockquote > List > ListItem > CodeFence; no current named probe executes this exact selection contract"
    ),
    initial: { source: "> - ```ts\n>   code\n>   ```", selection: selection(15, 19) },
    expected: {
      source: "> - ```ts\n>   code\n>   ```",
      selection: selection(15, 19),
      visibleLines: visibleLines("> - ```ts\n>   code\n>   ```", {
        1: "code-fence-delimiter",
        2: "code-fence-content",
        3: "code-fence-delimiter"
      })
    },
    repeat: {
      source: "> - ```ts\n>   code\n>   ```",
      selection: selection(15, 19),
      visibleLines: visibleLines("> - ```ts\n>   code\n>   ```", {
        1: "code-fence-delimiter",
        2: "code-fence-content",
        3: "code-fence-delimiter"
      })
    },
    undo: {
      source: "> - ```ts\n>   code\n>   ```",
      selection: selection(15, 19),
      visibleLines: visibleLines("> - ```ts\n>   code\n>   ```", {
        1: "code-fence-delimiter",
        2: "code-fence-content",
        3: "code-fence-delimiter"
      })
    }
  }),
  behaviorCase({
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
    classification: desiredContractOnly("Required recursive parity path; current scenario driver has no parameterized matrix execution"),
    initial: { source: "- > quote", selection: selection(9) },
    expected: { source: "- > quote\n  > ", selection: selection(14), visibleLines: visibleLines("- > quote\n  > ") },
    repeat: { source: "- > quote\n  \n", selection: selection(13), visibleLines: visibleLines("- > quote\n  \n") }
  }),
  behaviorCase({
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
    classification: {
      kind: "known-defect",
      reason: "Current block-path resolution recurses through blockquotes but not list children, so the full semantic path and depth are lost.",
      evidence: [
        'packages/editor-core/src/commands/list-edits.test.ts: "documents the current list-blockquote-list indent limitation"',
        'packages/editor-core/src/context/block-path.test.ts: "documents current mixed-container paths stopping at list blocks"'
      ],
      observed: {
        source: "- > - first\n  > - second\n  > - target",
        selection: selection(32),
        visibleLines: visibleLines("- > - first\n  > - second\n  > - target")
      }
    },
    initial: { source: "- > - first\n  > - second\n  > - target", selection: selection(32) },
    expected: {
      source: "- > - first\n  > - second\n  >   - target",
      selection: selection(34),
      visibleLines: visibleLines("- > - first\n  > - second\n  >   - target")
    },
    repeat: {
      source: "- > - first\n  > - second\n  >   - target",
      selection: selection(34),
      visibleLines: visibleLines("- > - first\n  > - second\n  >   - target")
    }
  }),
  behaviorCase({
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
    classification: {
      kind: "known-defect",
      reason: "The current block-path adapter cannot represent List/ListItem descendants in this mixed path, so projected geometry is truncated before BlockMath.",
      evidence: [
        'packages/editor-core/src/context/block-path.test.ts: "documents current mixed-container paths stopping at list blocks"',
        "No current named editing-experience probe asserts selection geometry for the required double-quote/list/block-math path"
      ],
      observed: {
        source: "> > - $$\n> >   x + y\n> >   $$",
        selection: selection(17, 22),
        visibleLines: visibleLines("> > - $$\n> >   x + y\n> >   $$", {
          1: "block-math-delimiter",
          2: "content",
          3: "block-math-delimiter"
        })
      }
    },
    initial: { source: "> > - $$\n> >   x + y\n> >   $$", selection: selection(17, 22) },
    expected: {
      source: "> > - $$\n> >   x + y\n> >   $$",
      selection: selection(17, 22),
      visibleLines: visibleLines("> > - $$\n> >   x + y\n> >   $$", {
        1: "block-math-delimiter",
        2: "block-math-content",
        3: "block-math-delimiter"
      })
    },
    repeat: {
      source: "> > - $$\n> >   x + y\n> >   $$",
      selection: selection(17, 22),
      visibleLines: visibleLines("> > - $$\n> >   x + y\n> >   $$", {
        1: "block-math-delimiter",
        2: "block-math-content",
        3: "block-math-delimiter"
      })
    },
    undo: {
      source: "> > - $$\n> >   x + y\n> >   $$",
      selection: selection(17, 22),
      visibleLines: visibleLines("> > - $$\n> >   x + y\n> >   $$", {
        1: "block-math-delimiter",
        2: "block-math-content",
        3: "block-math-delimiter"
      })
    }
  })
];

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

const recursiveParityCommands = [
  "Enter",
  "Backspace",
  "Tab",
  "Shift+Tab",
  "ArrowUp",
  "ArrowDown",
  "selection"
] as const satisfies readonly EditorBehaviorCommand[];

function layersForPath(path: EditorBehaviorContainerPath): NestedLayer[] {
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

function leafSourceForPath(path: EditorBehaviorContainerPath, content: string): string {
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
  return wrapLeafSource(layers, leafSourceForPath(path, content));
}

function resultAtText(
  source: string,
  text: string,
  placement: "start" | "end" | "range"
): EditorBehaviorResult {
  const start = source.indexOf(text);
  const selectionResult =
    placement === "start"
      ? selection(start)
      : placement === "range"
        ? selection(start, start + text.length)
        : selection(start + text.length);
  return { source, selection: selectionResult, visibleLines: visibleLines(source) };
}

function withoutDeepestList(layers: readonly NestedLayer[]): NestedLayer[] {
  const index = layers.lastIndexOf("List");
  return index < 0 ? [...layers] : layers.filter((_, layerIndex) => layerIndex !== index);
}

function recursiveParityCase(
  command: (typeof recursiveParityCommands)[number],
  containerPath: EditorBehaviorContainerPath,
  pathIndex: number
): EditorBehaviorCase {
  const layers = layersForPath(containerPath);
  const leaf = containerPath[containerPath.length - 1];
  const id = `matrix-${command.toLowerCase().replace("+", "-")}-path-${pathIndex + 1}`;
  const initialSingleSource = sourceForPath(containerPath, "alpha", layers);
  const initialSingle = resultAtText(initialSingleSource, "alpha", "end");
  const classification = desiredContractOnly(
    `Roadmap 7.7 recursive parity contract for ${command} at ${formatContainerPath(containerPath)}`
  );
  const common = {
    id,
    title: `${command} contract at ${formatContainerPath(containerPath)}`,
    origin: "recursive-parity" as const,
    command,
    containerPath,
    containerDepth: layers.length,
    lineContent: "content" as const,
    viewMode: "wysiwym" as const,
    viewModeContract: "projected-geometry" as const,
    classification
  };

  if (command === "Enter") {
    const separator = leaf === "Paragraph" ? "\n\n" : "\n";
    const expectedSource = sourceForPath(containerPath, `al${separator}pha`, layers);
    const repeatSource = sourceForPath(containerPath, `al${separator}${separator}pha`, layers);
    return behaviorCase({
      ...common,
      cursorPlacement: "line-middle",
      initial: {
        source: initialSingle.source,
        selection: selection(initialSingle.source.indexOf("alpha") + 2)
      },
      expected: resultAtText(expectedSource, "pha", "start"),
      repeat: resultAtText(repeatSource, "pha", "start")
    });
  }

  if (command === "Backspace") {
    const expectedSource = sourceForPath(containerPath, "alph", layers);
    const repeatSource = sourceForPath(containerPath, "alp", layers);
    return behaviorCase({
      ...common,
      cursorPlacement: "line-end",
      initial: { source: initialSingle.source, selection: initialSingle.selection },
      expected: resultAtText(expectedSource, "alph", "end"),
      repeat: resultAtText(repeatSource, "alp", "end")
    });
  }

  if (command === "Tab") {
    return behaviorCase({
      ...common,
      title: `Invalid Tab is a no-op at ${formatContainerPath(containerPath)}`,
      cursorPlacement: "line-middle",
      initial: {
        source: initialSingle.source,
        selection: selection(initialSingle.source.indexOf("alpha") + 2)
      },
      expected: {
        ...initialSingle,
        selection: selection(initialSingle.source.indexOf("alpha") + 2)
      },
      repeat: {
        ...initialSingle,
        selection: selection(initialSingle.source.indexOf("alpha") + 2)
      },
      undo: {
        ...initialSingle,
        selection: selection(initialSingle.source.indexOf("alpha") + 2)
      }
    });
  }

  if (command === "Shift+Tab") {
    const adapterOwnsTab = leaf === "CodeFence" || leaf === "BlockMath";
    const expectedLayers = adapterOwnsTab ? layers : withoutDeepestList(layers);
    const repeatLayers = adapterOwnsTab ? layers : withoutDeepestList(expectedLayers);
    const expected = resultAtText(sourceForPath(containerPath, "alpha", expectedLayers), "alpha", "end");
    const repeat = resultAtText(sourceForPath(containerPath, "alpha", repeatLayers), "alpha", "end");
    return behaviorCase({
      ...common,
      cursorPlacement: "line-middle",
      initial: { source: initialSingle.source, selection: initialSingle.selection },
      expected,
      repeat,
      undo: initialSingle
    });
  }

  if (command === "ArrowUp" || command === "ArrowDown") {
    const source = sourceForPath(containerPath, "alpha\nomega", layers);
    const initialText = command === "ArrowUp" ? "omega" : "alpha";
    const targetText = command === "ArrowUp" ? "alpha" : "omega";
    const expected = resultAtText(source, targetText, "end");
    return behaviorCase({
      ...common,
      cursorPlacement: "line-end",
      initial: { source, selection: resultAtText(source, initialText, "end").selection },
      expected,
      repeat: expected,
      undo: expected
    });
  }

  const selectionResult = resultAtText(initialSingle.source, "alpha", "range");
  return behaviorCase({
    ...common,
    cursorPlacement: "range",
    initial: { source: selectionResult.source, selection: selectionResult.selection },
    expected: selectionResult,
    repeat: selectionResult,
    undo: selectionResult
  });
}

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
    const from = source.indexOf("leaf");
    const result: EditorBehaviorResult = {
      source,
      selection: selection(from, from + 4),
      visibleLines: visibleLines(source)
    };

    return behaviorCase({
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
      classification: desiredContractOnly(
        `Generated recursive parity contract for semantic container depth ${depth}`
      ),
      initial: { source, selection: selection(from, from + 4) },
      expected: result,
      repeat: result,
      undo: result
    });
  });
}

export const representativeDepthCases = createRepresentativeDepthCases();

export const editorBehaviorCases: readonly EditorBehaviorCase[] = [
  ...oracleAndProbeCases,
  ...parityCases,
  ...recursiveParityMatrixCases,
  ...representativeDepthCases
];

export function filterEditorBehaviorCases(
  query: EditorBehaviorCaseQuery = {}
): readonly EditorBehaviorCase[] {
  const requestedPath = query.containerPath ? formatContainerPath(query.containerPath) : null;

  return editorBehaviorCases.filter((behaviorCase) => {
    if (query.command && behaviorCase.command !== query.command) {
      return false;
    }
    if (requestedPath && formatContainerPath(behaviorCase.containerPath) !== requestedPath) {
      return false;
    }
    return true;
  });
}

export function createEditorBehaviorMatrixScenario(
  query: EditorBehaviorCaseQuery = {}
): TestScenario {
  const selectedCases = filterEditorBehaviorCases(query);
  const filters = [
    query.command ? `command=${query.command}` : null,
    query.containerPath ? `containerPath=${formatContainerPath(query.containerPath)}` : null
  ].filter((value): value is string => value !== null);

  return {
    id: "editor-behavior-matrix",
    title: "Editor behavior contract matrix",
    summary:
      filters.length > 0
        ? `Describes ${selectedCases.length} typed behavior contracts filtered by ${filters.join(", ")}.`
        : `Describes all ${selectedCases.length} typed source, selection, geometry, repeat, and undo contracts.`,
    surface: "editor",
    tags: ["editor", "rendering"],
    preconditions: [
      "Typed behavior manifest is the contract source; generated screenshots and runtime artifacts remain external.",
      "RF-001 scenario steps describe contracts only; later driver work executes geometry and undo assertions."
    ],
    steps: selectedCases.map((behaviorCase) => ({
      id: behaviorCase.id,
      title: behaviorCase.title,
      kind: "assertion" as const,
      description: [
        `command=${behaviorCase.command}`,
        `containerPath=${formatContainerPath(behaviorCase.containerPath)}`,
        `classification=${behaviorCase.classification.kind}`
      ].join("; ")
    }))
  };
}

export const editorBehaviorMatrixScenario = createEditorBehaviorMatrixScenario();
