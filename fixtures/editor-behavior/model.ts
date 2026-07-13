import {
  findFishMarkProbe,
  type FishMarkNamedProbeCaseId
} from "./fishmark-probe-catalog";

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
export type EditorViewMode = "source" | "wysiwym";

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
  /** Exact source text for this physical line. */
  readonly sourceText: string;
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

export type PhysicalLineGeometryObservation = Omit<
  VisiblePhysicalLineExpectation,
  "role"
>;

export type EditorBehaviorResult = {
  readonly source: string;
  readonly selection: SourceSelection;
  readonly viewMode: EditorViewMode;
  readonly semanticPath: EditorBehaviorContainerPath;
  readonly visibleLines: readonly VisiblePhysicalLineExpectation[];
};

export type EditorBehaviorKey = "Enter" | "Backspace" | "Tab" | "ArrowUp" | "ArrowDown";

export type EditorBehaviorAction =
  | {
      readonly kind: "press-key";
      readonly key: EditorBehaviorKey;
      readonly shift?: true;
    }
  | { readonly kind: "insert-text"; readonly text: string }
  | { readonly kind: "set-selection"; readonly target: SourceSelection }
  | { readonly kind: "undo" };

export const editorBehaviorCheckpointIds = ["primary", "repeat", "undo"] as const;
export type EditorBehaviorCheckpointId = (typeof editorBehaviorCheckpointIds)[number];
export type EditorBehaviorStateId = "initial" | EditorBehaviorCheckpointId;

export type EditorBehaviorCheckpoint = {
  readonly id: EditorBehaviorCheckpointId;
  readonly from: Exclude<EditorBehaviorStateId, "undo">;
  readonly actions: readonly EditorBehaviorAction[];
  readonly result: EditorBehaviorResult;
};

export type EditorBehaviorCheckpoints = readonly [
  EditorBehaviorCheckpoint & { readonly id: "primary"; readonly from: "initial" },
  EditorBehaviorCheckpoint & { readonly id: "repeat"; readonly from: "primary" },
  EditorBehaviorCheckpoint & { readonly id: "undo"; readonly from: "primary" | "repeat" }
];

export const editorBehaviorAspects = [
  "command-plan",
  "semantic-path",
  "source",
  "selection",
  "visible-line-roles",
  "physical-geometry",
  "view-mode"
] as const;

export type EditorBehaviorAspect = (typeof editorBehaviorAspects)[number];

export type EditorBehaviorContractReference =
  | { readonly kind: "roadmap"; readonly section: string }
  | { readonly kind: "typora-oracle"; readonly file: string }
  | { readonly kind: "repository-test"; readonly file: string; readonly testName: string };

export type EditorBehaviorEvidenceProvenance =
  | {
      readonly kind: "fishmark-probe";
      readonly probeCaseId: FishMarkNamedProbeCaseId;
      readonly assertion: string;
    }
  | {
      readonly kind: "repository-test";
      readonly file: string;
      readonly testName: string;
    };

export type EditorBehaviorEvidenceState =
  | { readonly status: "gap"; readonly reason: string }
  | { readonly status: "verified"; readonly provenance: EditorBehaviorEvidenceProvenance };

export type EditorBehaviorCheckpointEvidence = Readonly<
  Record<EditorBehaviorAspect, EditorBehaviorEvidenceState>
>;

export type EditorBehaviorEvidence = Readonly<
  Record<EditorBehaviorCheckpointId, EditorBehaviorCheckpointEvidence>
>;

export type EditorBehaviorEvidenceTarget = {
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: EditorBehaviorAspect;
  readonly provenance: EditorBehaviorEvidenceProvenance;
};

export type EditorBehaviorCurrentObservation =
  | { readonly kind: "planner-result"; readonly outcome: "no-transaction" }
  | { readonly kind: "semantic-path"; readonly path: readonly EditorBehaviorContainer[] }
  | {
      readonly kind: "editor-result";
      readonly source: string;
      readonly selection: SourceSelection;
    };

export type EditorBehaviorCurrentStatus = "verified" | "partially-verified" | "unverified";

type EditorBehaviorClassificationBase = {
  /** Links a modeled case to a discoverable probe even when that probe verifies no full target. */
  readonly probeCaseId?: FishMarkNamedProbeCaseId;
  readonly currentStatus: EditorBehaviorCurrentStatus;
  readonly contractReferences: readonly EditorBehaviorContractReference[];
  readonly evidence: EditorBehaviorEvidence;
};

export type EditorBehaviorClassification =
  | (EditorBehaviorClassificationBase & { readonly kind: "desired" })
  | (EditorBehaviorClassificationBase & {
      readonly kind: "known-defect";
      readonly reason: string;
      readonly observed: EditorBehaviorCurrentObservation;
    });

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
  readonly classification: EditorBehaviorClassification;
  readonly initial: EditorBehaviorResult;
  readonly checkpoints: EditorBehaviorCheckpoints;
};

export type EditorBehaviorCaseQuery = {
  readonly command?: EditorBehaviorCommand;
  readonly containerPath?: EditorBehaviorContainerPath;
};

export function sourceSelection(anchor: number, head = anchor): SourceSelection {
  return { anchor, head };
}

export function pressKey(
  key: EditorBehaviorKey,
  options: { readonly shift?: true } = {}
): EditorBehaviorAction {
  return { kind: "press-key", key, ...options };
}

export function insertText(text: string): EditorBehaviorAction {
  return { kind: "insert-text", text };
}

export function setSelection(target: SourceSelection): EditorBehaviorAction {
  return { kind: "set-selection", target };
}

export function undo(): EditorBehaviorAction {
  return { kind: "undo" };
}

export function repeatActions(
  actions: readonly EditorBehaviorAction[],
  count: number
): readonly EditorBehaviorAction[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Action repeat count must be a positive integer; received ${count}.`);
  }
  return Array.from({ length: count }, () => actions).flat();
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

function analyzePrefix(
  text: string,
  previous: PrefixState,
  maximumSemanticDepth?: number
): PrefixGeometry {
  if (maximumSemanticDepth === 0) {
    return {
      semanticDepth: 0,
      contentColumn: 0,
      markerColumn: null,
      nextState: { listContinuationColumns: [] }
    };
  }

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
        !inheritedListColumns.has(continuationColumn) &&
        (maximumSemanticDepth === undefined || semanticDepth < maximumSemanticDepth)
      ) {
        inheritedListColumns.add(continuationColumn);
        nextListColumns.push(continuationColumn);
        semanticDepth += 1;
      }
    }

    cursor = nextTokenColumn;
    if (maximumSemanticDepth !== undefined && semanticDepth >= maximumSemanticDepth) {
      break;
    }

    if (text[cursor] === ">") {
      markerColumn = cursor;
      semanticDepth += 1;
      cursor += 1;
      if (text[cursor] === " ") {
        cursor += 1;
      }
      if (maximumSemanticDepth !== undefined && semanticDepth >= maximumSemanticDepth) {
        break;
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
      if (maximumSemanticDepth !== undefined && semanticDepth >= maximumSemanticDepth) {
        break;
      }
      continue;
    }

    break;
  }

  return {
    semanticDepth,
    contentColumn: semanticDepth > 0 ? cursor : 0,
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

type OpaqueBlock =
  | {
      readonly kind: "code";
      readonly outerDepth: number;
      readonly fenceCharacter: "`" | "~";
      readonly fenceLength: number;
    }
  | { readonly kind: "math"; readonly outerDepth: number };

function codeFenceOpening(content: string): OpaqueBlock | null {
  const match = /^\s{0,3}(`{3,}|~{3,})/u.exec(content);
  if (!match) {
    return null;
  }
  const marker = match[1]!;
  return {
    kind: "code",
    outerDepth: 0,
    fenceCharacter: marker[0] as "`" | "~",
    fenceLength: marker.length
  };
}

function isOpaqueClosing(content: string, opaque: OpaqueBlock): boolean {
  const trimmed = content.trim();
  if (opaque.kind === "math") {
    return trimmed === "$$";
  }
  const escaped = opaque.fenceCharacter === "`" ? "`" : "~";
  return new RegExp(`^${escaped}{${opaque.fenceLength},}\\s*$`, "u").test(trimmed);
}

export function physicalLineExpectations(
  source: string,
  selection: SourceSelection,
  viewMode: EditorViewMode,
  options: VisibleLineOptions = {}
): readonly VisiblePhysicalLineExpectation[] {
  const lines = source.split("\n");
  const activeLine = activePhysicalLine(source, selection);
  let prefixState: PrefixState = { listContinuationColumns: [] };
  let opaque: OpaqueBlock | null = null;

  return lines.map((text, index) => {
    const geometry = analyzePrefix(text, prefixState, opaque?.outerDepth);
    prefixState = geometry.nextState;
    const content = text.slice(geometry.contentColumn);
    let role: VisiblePhysicalLineRole;

    if (opaque) {
      const closing = isOpaqueClosing(content, opaque);
      role = closing
        ? opaque.kind === "code"
          ? "code-fence-delimiter"
          : "block-math-delimiter"
        : opaque.kind === "code"
          ? "code-fence-content"
          : "block-math-content";
      if (closing) {
        opaque = null;
      }
    } else {
      const openingCodeFence = codeFenceOpening(content);
      if (openingCodeFence) {
        role = "code-fence-delimiter";
        opaque = { ...openingCodeFence, outerDepth: geometry.semanticDepth };
      } else if (content.trim() === "$$") {
        role = "block-math-delimiter";
        opaque = { kind: "math", outerDepth: geometry.semanticDepth };
      } else if (/^\s+$/u.test(text)) {
        role = "whitespace-only";
      } else if (text.length === 0) {
        role = index === lines.length - 1 ? "empty-editing-line" : "structural-separator";
      } else if (content.length === 0) {
        role = "structural-separator";
      } else {
        role = "content";
      }
    }

    role = options.roleOverrides?.[index + 1] ?? role;
    const line = index + 1;
    const visibility =
      viewMode === "wysiwym" && role === "structural-separator" && line !== activeLine
        ? "collapsed"
        : "visible";

    return {
      line,
      sourceText: text,
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
  viewMode: EditorViewMode,
  semanticPath: EditorBehaviorContainerPath,
  options: VisibleLineOptions = {}
): EditorBehaviorResult {
  return {
    source,
    selection,
    viewMode,
    semanticPath,
    visibleLines: physicalLineExpectations(source, selection, viewMode, options)
  };
}

function targetKey(target: Pick<EditorBehaviorEvidenceTarget, "checkpoint" | "aspect">): string {
  return `${target.checkpoint}:${target.aspect}`;
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim() === "") {
    throw new Error(`${label} must not be empty.`);
  }
}

function validateProvenance(
  provenance: EditorBehaviorEvidenceProvenance,
  target: Pick<EditorBehaviorEvidenceTarget, "checkpoint" | "aspect">
): void {
  if (provenance.kind === "fishmark-probe") {
    assertNonEmpty(provenance.probeCaseId, "Probe case id");
    assertNonEmpty(provenance.assertion, "Probe assertion");
    const probe = findFishMarkProbe(provenance.probeCaseId);
    const capability = probe.capabilities.find(
      (candidate) =>
        candidate.checkpoint === target.checkpoint && candidate.aspect === target.aspect
    );
    if (!capability) {
      throw new Error(
        `Probe ${provenance.probeCaseId} does not declare capability ${targetKey(target)}.`
      );
    }
    const expectedAssertion = `${probe.probe.file}:${probe.probe.functionName}: ${capability.assertion}`;
    if (provenance.assertion !== expectedAssertion) {
      throw new Error(
        `Probe provenance assertion does not match catalog capability ${targetKey(target)}.`
      );
    }
    return;
  }
  assertNonEmpty(provenance.file, "Repository test file");
  assertNonEmpty(provenance.testName, "Repository test name");
}

export function createEvidence(input: {
  readonly gapReason: string;
  readonly verifiedTargets?: readonly EditorBehaviorEvidenceTarget[];
}): EditorBehaviorEvidence {
  assertNonEmpty(input.gapReason, "Evidence gap reason");
  const verified = new Map<string, EditorBehaviorEvidenceProvenance>();
  for (const target of input.verifiedTargets ?? []) {
    const key = targetKey(target);
    if (verified.has(key)) {
      throw new Error(`Duplicate evidence target ${key}.`);
    }
    validateProvenance(target.provenance, target);
    verified.set(key, target.provenance);
  }

  return Object.fromEntries(
    editorBehaviorCheckpointIds.map((checkpoint) => [
      checkpoint,
      Object.fromEntries(
        editorBehaviorAspects.map((aspect) => {
          const provenance = verified.get(`${checkpoint}:${aspect}`);
          return [
            aspect,
            provenance
              ? ({ status: "verified", provenance } satisfies EditorBehaviorEvidenceState)
              : ({ status: "gap", reason: input.gapReason } satisfies EditorBehaviorEvidenceState)
          ];
        })
      ) as Record<EditorBehaviorAspect, EditorBehaviorEvidenceState>
    ])
  ) as Record<EditorBehaviorCheckpointId, EditorBehaviorCheckpointEvidence>;
}

export function unverifiedEvidence(reason: string): EditorBehaviorEvidence {
  return createEvidence({ gapReason: reason });
}

export function repositoryTestEvidence(input: {
  readonly file: string;
  readonly testName: string;
  readonly verifiedTargets: readonly Omit<EditorBehaviorEvidenceTarget, "provenance">[];
  readonly gapReason: string;
}): EditorBehaviorEvidence {
  return createEvidence({
    gapReason: input.gapReason,
    verifiedTargets: input.verifiedTargets.map((target) => ({
      ...target,
      provenance: {
        kind: "repository-test",
        file: input.file,
        testName: input.testName
      }
    }))
  });
}

function validateEvidence(evidence: EditorBehaviorEvidence): void {
  if (
    Object.keys(evidence).length !== editorBehaviorCheckpointIds.length ||
    editorBehaviorCheckpointIds.some((checkpoint) => !(checkpoint in evidence))
  ) {
    throw new Error("Evidence must account for every checkpoint exactly once.");
  }
  for (const checkpoint of editorBehaviorCheckpointIds) {
    const checkpointEvidence = evidence[checkpoint];
    if (!checkpointEvidence) {
      throw new Error(`Evidence omits checkpoint ${checkpoint}.`);
    }
    const actualAspects = Object.keys(checkpointEvidence);
    if (
      actualAspects.length !== editorBehaviorAspects.length ||
      editorBehaviorAspects.some((aspect) => !(aspect in checkpointEvidence))
    ) {
      throw new Error(`Evidence checkpoint ${checkpoint} must account for every aspect exactly once.`);
    }
    for (const aspect of editorBehaviorAspects) {
      const state = checkpointEvidence[aspect];
      if (state.status === "gap") {
        assertNonEmpty(state.reason, `${checkpoint}:${aspect} gap reason`);
      } else if (state.status === "verified") {
        validateProvenance(state.provenance, { checkpoint, aspect });
      } else {
        throw new Error(`Invalid evidence state for ${checkpoint}:${aspect}.`);
      }
    }
  }
}

function statusForEvidence(evidence: EditorBehaviorEvidence): EditorBehaviorCurrentStatus {
  const states = editorBehaviorCheckpointIds.flatMap((checkpoint) =>
    editorBehaviorAspects.map((aspect) => evidence[checkpoint][aspect])
  );
  const verifiedCount = states.filter((state) => state.status === "verified").length;
  return verifiedCount === 0
    ? "unverified"
    : verifiedCount === states.length
      ? "verified"
      : "partially-verified";
}

export function desiredClassification(input: {
  readonly probeCaseId?: FishMarkNamedProbeCaseId;
  readonly contractReferences: readonly EditorBehaviorContractReference[];
  readonly evidence: EditorBehaviorEvidence;
}): EditorBehaviorClassification {
  validateEvidence(input.evidence);
  return {
    kind: "desired",
    currentStatus: statusForEvidence(input.evidence),
    ...input
  };
}

export function knownDefectClassification(input: {
  readonly probeCaseId?: FishMarkNamedProbeCaseId;
  readonly reason: string;
  readonly contractReferences: readonly EditorBehaviorContractReference[];
  readonly evidence: EditorBehaviorEvidence;
  readonly observed: EditorBehaviorCurrentObservation;
}): EditorBehaviorClassification {
  validateEvidence(input.evidence);
  return {
    kind: "known-defect",
    currentStatus: statusForEvidence(input.evidence),
    ...input
  };
}

type EvidenceObservationBase = {
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly provenance: EditorBehaviorEvidenceProvenance;
};

export type EditorBehaviorEvidenceObservation = EvidenceObservationBase &
  (
    | { readonly aspect: "command-plan"; readonly observed: readonly EditorBehaviorAction[] }
    | { readonly aspect: "semantic-path"; readonly observed: EditorBehaviorContainerPath }
    | { readonly aspect: "source"; readonly observed: string }
    | { readonly aspect: "selection"; readonly observed: SourceSelection }
    | {
        readonly aspect: "visible-line-roles";
        readonly observed: readonly VisiblePhysicalLineRole[];
      }
    | {
        readonly aspect: "physical-geometry";
        readonly observed: readonly PhysicalLineGeometryObservation[];
      }
    | { readonly aspect: "view-mode"; readonly observed: EditorViewMode }
  );

function checkpointFor(
  behaviorCase: EditorBehaviorCase,
  checkpointId: EditorBehaviorCheckpointId
): EditorBehaviorCheckpoint {
  const checkpoint = behaviorCase.checkpoints.find(({ id }) => id === checkpointId);
  if (!checkpoint) {
    throw new Error(`${behaviorCase.id} omits checkpoint ${checkpointId}.`);
  }
  return checkpoint;
}

function expectedObservation(
  behaviorCase: EditorBehaviorCase,
  observation: EditorBehaviorEvidenceObservation
): unknown {
  const checkpoint = checkpointFor(behaviorCase, observation.checkpoint);
  switch (observation.aspect) {
    case "command-plan":
      return checkpoint.actions;
    case "semantic-path":
      return checkpoint.result.semanticPath;
    case "source":
      return checkpoint.result.source;
    case "selection":
      return checkpoint.result.selection;
    case "visible-line-roles":
      return checkpoint.result.visibleLines.map(({ role }) => role);
    case "physical-geometry":
      return checkpoint.result.visibleLines.map(({ line, sourceText, geometry }) => ({
        line,
        sourceText,
        geometry
      }));
    case "view-mode":
      return checkpoint.result.viewMode;
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function replaceEvidenceGaps(
  behaviorCase: EditorBehaviorCase,
  observations: readonly EditorBehaviorEvidenceObservation[]
): EditorBehaviorCase {
  if (observations.length === 0) {
    throw new Error("At least one typed evidence observation is required.");
  }

  const keys = new Set<string>();
  for (const observation of observations) {
    const key = targetKey(observation);
    if (keys.has(key)) {
      throw new Error(`Duplicate evidence target ${key}.`);
    }
    keys.add(key);
    validateProvenance(observation.provenance, observation);
    if (behaviorCase.classification.evidence[observation.checkpoint][observation.aspect].status !== "gap") {
      throw new Error(`Evidence target ${key} is already verified.`);
    }
    if (!sameValue(observation.observed, expectedObservation(behaviorCase, observation))) {
      throw new Error(`Observation does not match the expected ${key} value.`);
    }
  }

  const mutableEvidence = Object.fromEntries(
    editorBehaviorCheckpointIds.map((checkpoint) => [checkpoint, { ...behaviorCase.classification.evidence[checkpoint] }])
  ) as Record<EditorBehaviorCheckpointId, Record<EditorBehaviorAspect, EditorBehaviorEvidenceState>>;
  for (const observation of observations) {
    mutableEvidence[observation.checkpoint][observation.aspect] = {
      status: "verified",
      provenance: observation.provenance
    };
  }

  return {
    ...behaviorCase,
    classification: {
      ...behaviorCase.classification,
      evidence: mutableEvidence,
      currentStatus: statusForEvidence(mutableEvidence)
    }
  };
}

function validateSelection(source: string, selection: SourceSelection, label: string): void {
  if (
    !Number.isInteger(selection.anchor) ||
    !Number.isInteger(selection.head) ||
    selection.anchor < 0 ||
    selection.head < 0 ||
    selection.anchor > source.length ||
    selection.head > source.length
  ) {
    throw new Error(`${label} selection is outside its source.`);
  }
}

function validatePhysicalLines(result: EditorBehaviorResult, label: string): void {
  const sourceLines = result.source.split("\n");
  if (result.visibleLines.length !== sourceLines.length) {
    throw new Error(`${label} must describe every physical source line.`);
  }

  result.visibleLines.forEach((line, index) => {
    const expectedLine = index + 1;
    if (line.line !== expectedLine) {
      throw new Error(`${label} physical lines must be ordered from one without gaps.`);
    }
    const sourceText = sourceLines[index]!;
    if (line.sourceText !== sourceText) {
      throw new Error(`${label} line ${expectedLine} source text does not match its source.`);
    }
    const { semanticDepth, contentColumn, markerColumn } = line.geometry;
    if (!Number.isInteger(semanticDepth) || semanticDepth < 0) {
      throw new Error(`${label} line ${expectedLine} semantic depth must be nonnegative.`);
    }
    if (!Number.isInteger(contentColumn) || contentColumn < 0 || contentColumn > sourceText.length) {
      throw new Error(`${label} line ${expectedLine} content column is outside its source line.`);
    }
    if (
      markerColumn !== null &&
      (!Number.isInteger(markerColumn) || markerColumn < 0 || markerColumn >= contentColumn)
    ) {
      throw new Error(`${label} line ${expectedLine} marker column must precede content.`);
    }
    if (markerColumn !== null && !/[>+*\-\d]/u.test(sourceText[markerColumn] ?? "")) {
      throw new Error(`${label} line ${expectedLine} marker column does not point at a marker.`);
    }
  });
}

function validateResult(result: EditorBehaviorResult, label: string): void {
  if (result.semanticPath.length < 2 || result.semanticPath[0] !== "Document") {
    throw new Error(`${label} semantic path must start at Document and contain a leaf.`);
  }
  validateSelection(result.source, result.selection, label);
  validatePhysicalLines(result, label);
}

function actionMatchesCommand(action: EditorBehaviorAction, command: EditorBehaviorCommand): boolean {
  switch (command) {
    case "InsertText":
      return action.kind === "insert-text";
    case "Enter":
    case "Backspace":
    case "ArrowUp":
    case "ArrowDown":
      return action.kind === "press-key" && action.key === command && action.shift !== true;
    case "Tab":
      return action.kind === "press-key" && action.key === "Tab" && action.shift !== true;
    case "Shift+Tab":
      return action.kind === "press-key" && action.key === "Tab" && action.shift === true;
    case "selection":
      return action.kind === "set-selection";
  }
}

function validateActions(
  behaviorCase: EditorBehaviorCase,
  checkpoint: EditorBehaviorCheckpoint,
  fromSource: string
): void {
  if (checkpoint.actions.length === 0) {
    throw new Error(`${behaviorCase.id} ${checkpoint.id} must include executable actions.`);
  }
  for (const action of checkpoint.actions) {
    if (action.kind === "insert-text") {
      if (action.text.length === 0) {
        throw new Error(`${behaviorCase.id} inserted text payload must not be empty.`);
      }
    } else if (action.kind === "set-selection") {
      validateSelection(
        fromSource,
        action.target,
        `${behaviorCase.id} ${checkpoint.id} selection action`
      );
    }
  }
  if (checkpoint.id === "undo") {
    if (!checkpoint.actions.some((action) => action.kind === "undo")) {
      throw new Error(`${behaviorCase.id} undo must include an undo action.`);
    }
    return;
  }
  if (checkpoint.actions.some((action) => action.kind === "undo")) {
    throw new Error(`${behaviorCase.id} ${checkpoint.id} cannot contain undo.`);
  }
  if (!checkpoint.actions.some((action) => actionMatchesCommand(action, behaviorCase.command))) {
    throw new Error(`${behaviorCase.id} ${checkpoint.id} actions do not match ${behaviorCase.command}.`);
  }
}

export function defineEditorBehaviorCase(input: EditorBehaviorCase): EditorBehaviorCase {
  validateEvidence(input.classification.evidence);
  validateResult(input.initial, `${input.id} initial`);
  if (
    input.checkpoints[0].id !== "primary" ||
    input.checkpoints[0].from !== "initial" ||
    input.checkpoints[1].id !== "repeat" ||
    input.checkpoints[1].from !== "primary" ||
    input.checkpoints[2].id !== "undo" ||
    !["primary", "repeat"].includes(input.checkpoints[2].from)
  ) {
    throw new Error(`${input.id} checkpoints must be ordered primary, repeat, undo with explicit ancestry.`);
  }
  for (const checkpoint of input.checkpoints) {
    validateResult(checkpoint.result, `${input.id} ${checkpoint.id}`);
    const fromSource =
      checkpoint.from === "initial"
        ? input.initial.source
        : input.checkpoints.find(({ id }) => id === checkpoint.from)!.result.source;
    validateActions(input, checkpoint, fromSource);
  }
  return input;
}

export function formatContainerPath(path: EditorBehaviorContainerPath): string {
  return path.join(" > ");
}
