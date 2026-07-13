import type { FishMarkNamedProbeCaseId } from "./fishmark-probe-catalog";

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
  | "code-fence-delimiter"
  | "code-fence-content"
  | "block-math-delimiter"
  | "block-math-content";

export type VisiblePhysicalLineExpectation = {
  /** One-based physical source line number. */
  readonly line: number;
  readonly role: VisiblePhysicalLineRole;
  readonly geometry: {
    /** Semantic List/Blockquote depth, independent of raw indentation. */
    readonly semanticDepth: number;
    /** Zero-based source column where editable leaf content starts. */
    readonly contentColumn: number;
    /** Zero-based source column of the innermost marker physically present on this line. */
    readonly markerColumn: number | null;
    readonly visibility: "visible" | "collapsed";
  };
};

export type EditorBehaviorResult = {
  readonly source: string;
  readonly selection: SourceSelection;
  readonly visibleLines: readonly VisiblePhysicalLineExpectation[];
};

export const editorBehaviorEvidenceAspects = [
  "command-plan",
  "semantic-path",
  "source",
  "selection",
  "visible-line-roles",
  "physical-geometry",
  "repeat",
  "undo",
  "view-mode"
] as const;

export type EditorBehaviorEvidenceAspect =
  (typeof editorBehaviorEvidenceAspects)[number];

export type EditorBehaviorContractReference =
  | { readonly kind: "roadmap"; readonly section: string }
  | { readonly kind: "typora-oracle"; readonly file: string }
  | { readonly kind: "repository-test"; readonly file: string; readonly testName: string };

export type EditorBehaviorCurrentEvidence =
  | {
      readonly kind: "verified-probe";
      readonly probeCaseId: FishMarkNamedProbeCaseId;
      readonly verifiedAspects: readonly EditorBehaviorEvidenceAspect[];
      readonly note?: string;
    }
  | {
      readonly kind: "verified-test";
      readonly file: string;
      readonly testName: string;
      readonly verifiedAspects: readonly EditorBehaviorEvidenceAspect[];
      readonly note?: string;
    }
  | {
      readonly kind: "coverage-gap";
      readonly missingAspects: readonly EditorBehaviorEvidenceAspect[];
      readonly reason: string;
    };

export type EditorBehaviorCurrentObservation =
  | { readonly kind: "planner-result"; readonly outcome: "no-transaction" }
  | {
      readonly kind: "semantic-path";
      readonly path: readonly EditorBehaviorContainer[];
    }
  | {
      readonly kind: "editor-result";
      readonly source: string;
      readonly selection: SourceSelection;
    };

export type EditorBehaviorClassification =
  | {
      readonly kind: "desired";
      readonly currentStatus: "verified" | "partially-verified" | "unverified";
      readonly contractReferences: readonly EditorBehaviorContractReference[];
      readonly currentEvidence: readonly EditorBehaviorCurrentEvidence[];
    }
  | {
      readonly kind: "known-defect";
      readonly reason: string;
      readonly contractReferences: readonly EditorBehaviorContractReference[];
      readonly currentEvidence: readonly EditorBehaviorCurrentEvidence[];
      readonly observed: EditorBehaviorCurrentObservation;
    };

export type EditorBehaviorCase = {
  readonly id: string;
  readonly title: string;
  readonly origin: "typora-oracle" | "fishmark-probe" | "recursive-parity";
  readonly command: EditorBehaviorCommand;
  readonly containerPath: EditorBehaviorContainerPath;
  /** Counts semantic List/Blockquote containers, not Document, ListItem, or leaf. */
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
    readonly repeat: EditorBehaviorResult & { readonly operationCount: number };
    readonly undo: EditorBehaviorResult & { readonly operationCount: number };
  };
};

export type EditorBehaviorCaseQuery = {
  readonly command?: EditorBehaviorCommand;
  readonly containerPath?: EditorBehaviorContainerPath;
};

export function sourceSelection(anchor: number, head = anchor): SourceSelection {
  return { anchor, head };
}

type PrefixState = {
  readonly listContinuationColumns: readonly number[];
};

type PrefixGeometry = {
  readonly semanticDepth: number;
  readonly contentColumn: number;
  readonly markerColumn: number | null;
  readonly nextState: PrefixState;
};

function analyzePrefix(text: string, previous: PrefixState): PrefixGeometry {
  let cursor = 0;
  let semanticDepth = 0;
  let markerColumn: number | null = null;
  const inheritedListColumns = new Set<number>();
  const nextListColumns: number[] = [];

  while (cursor < text.length) {
    let nextTokenColumn = cursor;
    while (text[nextTokenColumn] === " ") {
      nextTokenColumn += 1;
    }

    for (const continuationColumn of previous.listContinuationColumns) {
      if (
        continuationColumn > cursor &&
        continuationColumn <= nextTokenColumn &&
        !inheritedListColumns.has(continuationColumn)
      ) {
        inheritedListColumns.add(continuationColumn);
        nextListColumns.push(continuationColumn);
        semanticDepth += 1;
      }
    }

    cursor = nextTokenColumn;

    if (text[cursor] === ">") {
      markerColumn = cursor;
      semanticDepth += 1;
      cursor += 1;
      if (text[cursor] === " ") {
        cursor += 1;
      }
      continue;
    }

    const listMarker = /^(?:[-+*]|\d+[.)])\s/u.exec(text.slice(cursor));
    if (listMarker) {
      markerColumn = cursor;
      semanticDepth += 1;
      cursor += listMarker[0].length;
      const taskMarker = /^\[[ xX]\]\s/u.exec(text.slice(cursor));
      if (taskMarker) {
        cursor += taskMarker[0].length;
      }
      nextListColumns.push(cursor);
      continue;
    }

    break;
  }

  const hasSemanticPrefix = semanticDepth > 0;
  return {
    semanticDepth,
    contentColumn: hasSemanticPrefix ? cursor : 0,
    markerColumn,
    nextState: {
      listContinuationColumns:
        text.length === 0 ? [] : [...new Set(nextListColumns)].sort((left, right) => left - right)
    }
  };
}

function activePhysicalLine(source: string, selection: SourceSelection): number {
  const offset = Math.max(0, Math.min(source.length, selection.head));
  return source.slice(0, offset).split("\n").length;
}

export type VisibleLineOptions = {
  readonly roleOverrides?: Readonly<Partial<Record<number, VisiblePhysicalLineRole>>>;
};

export function physicalLineExpectations(
  source: string,
  selection: SourceSelection,
  viewMode: "source" | "wysiwym",
  options: VisibleLineOptions = {}
): readonly VisiblePhysicalLineExpectation[] {
  const lines = source.split("\n");
  const activeLine = activePhysicalLine(source, selection);
  let prefixState: PrefixState = { listContinuationColumns: [] };
  let insideCodeFence = false;
  let insideBlockMath = false;

  return lines.map((text, index) => {
    const geometry = analyzePrefix(text, prefixState);
    prefixState = geometry.nextState;
    const content = text.slice(geometry.contentColumn);
    let role: VisiblePhysicalLineRole;

    if (/^\s+$/u.test(text)) {
      role = "whitespace-only";
    } else if (content.startsWith("```")) {
      role = "code-fence-delimiter";
    } else if (content === "$$") {
      role = "block-math-delimiter";
    } else if (insideCodeFence) {
      role = "code-fence-content";
    } else if (insideBlockMath) {
      role = "block-math-content";
    } else if (text.length === 0) {
      role = index === lines.length - 1 ? "empty-editing-line" : "structural-separator";
    } else if (content.length === 0) {
      role = "structural-separator";
    } else {
      role = "content";
    }

    role = options.roleOverrides?.[index + 1] ?? role;

    const line = index + 1;
    const visibility =
      viewMode === "wysiwym" && role === "structural-separator" && line !== activeLine
        ? "collapsed"
        : "visible";

    if (content.startsWith("```")) {
      insideCodeFence = !insideCodeFence;
    } else if (content === "$$") {
      insideBlockMath = !insideBlockMath;
    }

    return {
      line,
      role,
      geometry: {
        semanticDepth: geometry.semanticDepth,
        contentColumn: geometry.contentColumn,
        markerColumn: geometry.markerColumn,
        visibility
      }
    };
  });
}

export function editorBehaviorResult(
  source: string,
  selection: SourceSelection,
  viewMode: "source" | "wysiwym",
  options: VisibleLineOptions = {}
): EditorBehaviorResult {
  return {
    source,
    selection,
    visibleLines: physicalLineExpectations(source, selection, viewMode, options)
  };
}

export function operationResult(
  operationCount: number,
  result: EditorBehaviorResult
): EditorBehaviorResult & { readonly operationCount: number } {
  if (!Number.isInteger(operationCount) || operationCount < 1) {
    throw new Error(`operationCount must be a positive integer; received ${operationCount}.`);
  }
  return { ...result, operationCount };
}

function missingEvidenceAspects(
  verifiedAspects: readonly EditorBehaviorEvidenceAspect[]
): readonly EditorBehaviorEvidenceAspect[] {
  const verified = new Set(verifiedAspects);
  return editorBehaviorEvidenceAspects.filter((aspect) => !verified.has(aspect));
}

export function probeCurrentEvidence(
  probeCaseId: FishMarkNamedProbeCaseId,
  verifiedAspects: readonly EditorBehaviorEvidenceAspect[],
  gapReason: string,
  note?: string
): readonly EditorBehaviorCurrentEvidence[] {
  const missingAspects = missingEvidenceAspects(verifiedAspects);
  return [
    { kind: "verified-probe", probeCaseId, verifiedAspects, ...(note ? { note } : {}) },
    ...(missingAspects.length > 0
      ? [{ kind: "coverage-gap" as const, missingAspects, reason: gapReason }]
      : [])
  ];
}

export function testCurrentEvidence(input: {
  readonly file: string;
  readonly testName: string;
  readonly verifiedAspects: readonly EditorBehaviorEvidenceAspect[];
  readonly gapReason: string;
  readonly note?: string;
}): readonly EditorBehaviorCurrentEvidence[] {
  const missingAspects = missingEvidenceAspects(input.verifiedAspects);
  return [
    {
      kind: "verified-test",
      file: input.file,
      testName: input.testName,
      verifiedAspects: input.verifiedAspects,
      ...(input.note ? { note: input.note } : {})
    },
    ...(missingAspects.length > 0
      ? [{ kind: "coverage-gap" as const, missingAspects, reason: input.gapReason }]
      : [])
  ];
}

export function unverifiedCurrentEvidence(
  reason: string
): readonly EditorBehaviorCurrentEvidence[] {
  return [{ kind: "coverage-gap", missingAspects: editorBehaviorEvidenceAspects, reason }];
}

function validateEvidenceCoverage(evidence: readonly EditorBehaviorCurrentEvidence[]): void {
  const accounted = new Set<EditorBehaviorEvidenceAspect>();
  for (const item of evidence) {
    const aspects = item.kind === "coverage-gap" ? item.missingAspects : item.verifiedAspects;
    for (const aspect of aspects) {
      accounted.add(aspect);
    }
  }

  const unaccounted = editorBehaviorEvidenceAspects.filter((aspect) => !accounted.has(aspect));
  if (unaccounted.length > 0) {
    throw new Error(`Current evidence omits aspects: ${unaccounted.join(", ")}.`);
  }
}

export function desiredClassification(input: {
  readonly contractReferences: readonly EditorBehaviorContractReference[];
  readonly currentEvidence: readonly EditorBehaviorCurrentEvidence[];
}): EditorBehaviorClassification {
  validateEvidenceCoverage(input.currentEvidence);
  const hasVerified = input.currentEvidence.some((entry) => entry.kind !== "coverage-gap");
  const hasGap = input.currentEvidence.some((entry) => entry.kind === "coverage-gap");
  return {
    kind: "desired",
    currentStatus: !hasVerified ? "unverified" : hasGap ? "partially-verified" : "verified",
    ...input
  };
}

export function knownDefectClassification(input: {
  readonly reason: string;
  readonly contractReferences: readonly EditorBehaviorContractReference[];
  readonly currentEvidence: readonly EditorBehaviorCurrentEvidence[];
  readonly observed: EditorBehaviorCurrentObservation;
}): EditorBehaviorClassification {
  validateEvidenceCoverage(input.currentEvidence);
  return { kind: "known-defect", ...input };
}

function validateSelection(source: string, selection: SourceSelection, label: string): void {
  if (
    selection.anchor < 0 ||
    selection.head < 0 ||
    selection.anchor > source.length ||
    selection.head > source.length
  ) {
    throw new Error(`${label} selection is outside its source.`);
  }
}

export function defineEditorBehaviorCase(input: EditorBehaviorCase): EditorBehaviorCase {
  if (input.expected.repeat.operationCount < 2) {
    throw new Error(`${input.id} must explicitly describe at least two repeated operations.`);
  }
  if (input.expected.undo.operationCount < 1) {
    throw new Error(`${input.id} must explicitly describe at least one undo operation.`);
  }

  validateEvidenceCoverage(input.classification.currentEvidence);
  validateSelection(input.initial.source, input.initial.selection, `${input.id} initial`);
  for (const [label, result] of [
    ["expected", input.expected],
    ["repeat", input.expected.repeat],
    ["undo", input.expected.undo]
  ] as const) {
    validateSelection(result.source, result.selection, `${input.id} ${label}`);
    if (result.visibleLines.length !== result.source.split("\n").length) {
      throw new Error(`${input.id} ${label} must describe every physical source line.`);
    }
  }

  return input;
}

export function formatContainerPath(path: EditorBehaviorContainerPath): string {
  return path.join(" > ");
}
