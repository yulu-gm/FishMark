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

export type EditorBehaviorOracleCoverage = "captured-exact" | "not-captured";
export type EditorBehaviorOracleResultCoverage = Readonly<
  Record<
    Exclude<EditorBehaviorAspect, "command-plan">,
    EditorBehaviorOracleCoverage
  >
>;

export type EditorBehaviorContractReference =
  | { readonly kind: "roadmap"; readonly section: string }
  | {
      readonly kind: "typora-oracle";
      readonly file: string;
      readonly capturedCheckpoint: "primary" | "repeat";
      readonly coverage: {
        readonly initial: EditorBehaviorOracleResultCoverage;
        readonly actions: EditorBehaviorOracleCoverage;
        readonly primary: EditorBehaviorOracleResultCoverage;
        readonly repeat: EditorBehaviorOracleResultCoverage;
        readonly undo: EditorBehaviorOracleResultCoverage;
      };
    }
  | { readonly kind: "repository-test"; readonly file: string; readonly testName: string };

export type EditorBehaviorEvidenceTargetIdentity = {
  readonly caseId: string;
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: EditorBehaviorAspect;
};

export type EditorBehaviorEvidenceProvenance = EditorBehaviorEvidenceTargetIdentity &
  (
    | {
      readonly kind: "fishmark-probe";
      readonly probeCaseId: string;
      readonly assertion: string;
    }
    | {
        readonly kind: "repository-test";
        readonly file: string;
        readonly testName: string;
      }
    | {
        readonly kind: "electron-manifest-runner";
        readonly manifestHash: string;
        readonly contractHash: string;
        readonly runId: string;
      }
  );

export type EditorBehaviorEvidenceState =
  | { readonly status: "gap"; readonly reason: string }
  | { readonly status: "verified"; readonly provenance: EditorBehaviorEvidenceProvenance }
  | {
      readonly status: "known-defect-observed";
      readonly provenance: EditorBehaviorEvidenceProvenance;
    };

export type EditorBehaviorCheckpointEvidence = Readonly<
  Record<EditorBehaviorAspect, EditorBehaviorEvidenceState>
>;

export type EditorBehaviorEvidence = Readonly<
  Record<EditorBehaviorCheckpointId, EditorBehaviorCheckpointEvidence>
>;

export type EditorBehaviorEvidenceTarget = EditorBehaviorEvidenceTargetIdentity & {
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
  readonly probeCaseId?: string;
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

type PrefixSegment =
  | { readonly kind: "blockquote" }
  | {
      readonly kind: "list";
      readonly continuationWidth: number;
    };

type PrefixGeometry = {
  readonly semanticDepth: number;
  readonly contentColumn: number;
  readonly markerColumn: number | null;
  readonly nextState: PrefixState;
  readonly signature: readonly PrefixSegment[];
};

function analyzePrefix(text: string, previous: PrefixState): PrefixGeometry {
  let cursor = 0;
  let semanticDepth = 0;
  let markerColumn: number | null = null;
  const inheritedListColumns = new Set<number>();
  const nextListColumns: number[] = [];
  const signature: PrefixSegment[] = [];

  while (cursor < text.length) {
    const segmentStart = cursor;
    let nextTokenColumn = cursor;
    while (text[nextTokenColumn] === " ") {
      nextTokenColumn += 1;
    }

    let consumedSpaceColumn = segmentStart;
    for (const continuationColumn of previous.listContinuationColumns) {
      if (
        continuationColumn > consumedSpaceColumn &&
        continuationColumn <= nextTokenColumn &&
        !inheritedListColumns.has(continuationColumn)
      ) {
        inheritedListColumns.add(continuationColumn);
        nextListColumns.push(continuationColumn);
        signature.push({
          kind: "list",
          continuationWidth: continuationColumn - consumedSpaceColumn
        });
        consumedSpaceColumn = continuationColumn;
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
      signature.push({ kind: "blockquote" });
      continue;
    }

    const listMarker = /^(?:[-+*]|\d+[.)])\s/u.exec(text.slice(cursor));
    if (listMarker) {
      markerColumn = cursor;
      semanticDepth += 1;
      const leadingSpaces = cursor - consumedSpaceColumn;
      const markerStart = cursor;
      cursor += listMarker[0].length;
      const taskMarker = /^\[[ xX]\]\s/u.exec(text.slice(cursor));
      if (taskMarker) {
        cursor += taskMarker[0].length;
      }
      const markerWidth = cursor - markerStart;
      nextListColumns.push(cursor);
      signature.push({
        kind: "list",
        continuationWidth: leadingSpaces + markerWidth
      });
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
        text.length === 0
          ? []
          : [...new Set(nextListColumns)].sort((left, right) => left - right)
    },
    signature
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
      readonly outerPrefix: readonly PrefixSegment[];
      readonly fenceCharacter: "`" | "~";
      readonly fenceLength: number;
    }
  | { readonly kind: "math"; readonly outerPrefix: readonly PrefixSegment[] };

type CodeFenceOpening = Omit<Extract<OpaqueBlock, { readonly kind: "code" }>, "outerPrefix">;

function codeFenceOpening(content: string): CodeFenceOpening | null {
  const match = /^ {0,3}(`{3,}|~{3,})/u.exec(content);
  if (!match) {
    return null;
  }
  const marker = match[1]!;
  return {
    kind: "code",
    fenceCharacter: marker[0] as "`" | "~",
    fenceLength: marker.length
  };
}

function isOpaqueClosing(content: string, opaque: OpaqueBlock): boolean {
  if (opaque.kind === "math") {
    return /^ {0,3}\$\$[\t ]*$/u.test(content);
  }
  const escaped = opaque.fenceCharacter === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}${escaped}{${opaque.fenceLength},}[\\t ]*$`, "u").test(
    content
  );
}

function isBlockMathDelimiter(content: string): boolean {
  return /^ {0,3}\$\$[\t ]*$/u.test(content);
}

type OpaquePrefixGeometry = Pick<
  PrefixGeometry,
  "semanticDepth" | "contentColumn" | "markerColumn"
> & {
  readonly matchesOuterPrefix: boolean;
};

function consumeOpaquePrefix(
  text: string,
  signature: readonly PrefixSegment[]
): OpaquePrefixGeometry {
  let cursor = 0;
  let semanticDepth = 0;
  let markerColumn: number | null = null;

  for (const segment of signature) {
    if (segment.kind === "list") {
      const continuation = text.slice(cursor, cursor + segment.continuationWidth);
      if (
        continuation.length !== segment.continuationWidth ||
        continuation !== " ".repeat(segment.continuationWidth)
      ) {
        break;
      }
      cursor += segment.continuationWidth;
      semanticDepth += 1;
      continue;
    }

    let markerColumnCandidate = cursor;
    while (
      markerColumnCandidate - cursor < 3 &&
      text[markerColumnCandidate] === " "
    ) {
      markerColumnCandidate += 1;
    }
    if (text[markerColumnCandidate] !== ">") {
      break;
    }
    const actualMarkerWidth = text[markerColumnCandidate + 1] === " " ? 2 : 1;
    markerColumn = markerColumnCandidate;
    cursor = markerColumnCandidate + actualMarkerWidth;
    semanticDepth += 1;
  }

  return {
    semanticDepth,
    contentColumn: semanticDepth > 0 ? cursor : 0,
    markerColumn,
    matchesOuterPrefix: semanticDepth === signature.length
  };
}

type OrdinaryLineAnalysis = {
  readonly geometry: PrefixGeometry;
  readonly openedOpaque: OpaqueBlock | null;
  readonly role: VisiblePhysicalLineRole;
};

function analyzeOrdinaryLine(
  text: string,
  index: number,
  lineCount: number,
  prefixState: PrefixState
): OrdinaryLineAnalysis {
  const geometry = analyzePrefix(text, prefixState);
  const content = text.slice(geometry.contentColumn);
  const openingCodeFence = codeFenceOpening(content);
  if (openingCodeFence) {
    return {
      geometry,
      openedOpaque: { ...openingCodeFence, outerPrefix: geometry.signature },
      role: "code-fence-delimiter"
    };
  }
  if (isBlockMathDelimiter(content)) {
    return {
      geometry,
      openedOpaque: { kind: "math", outerPrefix: geometry.signature },
      role: "block-math-delimiter"
    };
  }
  if (/^\s+$/u.test(text)) {
    return { geometry, openedOpaque: null, role: "whitespace-only" };
  }
  if (text.length === 0) {
    return {
      geometry,
      openedOpaque: null,
      role: index === lineCount - 1 ? "empty-editing-line" : "structural-separator"
    };
  }
  if (content.length === 0) {
    return { geometry, openedOpaque: null, role: "structural-separator" };
  }
  return { geometry, openedOpaque: null, role: "content" };
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
    let geometry: Pick<
      PrefixGeometry,
      "semanticDepth" | "contentColumn" | "markerColumn"
    >;
    let role: VisiblePhysicalLineRole;

    if (opaque) {
      const activeOpaque = opaque;
      const opaqueGeometry = consumeOpaquePrefix(text, activeOpaque.outerPrefix);
      if (opaqueGeometry.matchesOuterPrefix) {
        geometry = opaqueGeometry;
        const content = text.slice(geometry.contentColumn);
        const closing = isOpaqueClosing(content, activeOpaque);
        role = closing
          ? activeOpaque.kind === "code"
            ? "code-fence-delimiter"
            : "block-math-delimiter"
          : activeOpaque.kind === "code"
            ? "code-fence-content"
            : "block-math-content";
        if (closing) {
          opaque = null;
        }
      } else {
        const ordinary = analyzeOrdinaryLine(text, index, lines.length, prefixState);
        geometry = ordinary.geometry;
        prefixState = ordinary.geometry.nextState;
        opaque = ordinary.openedOpaque;
        role = ordinary.role;
      }
    } else {
      const ordinary = analyzeOrdinaryLine(text, index, lines.length, prefixState);
      geometry = ordinary.geometry;
      prefixState = ordinary.geometry.nextState;
      opaque = ordinary.openedOpaque;
      role = ordinary.role;
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
  target: EditorBehaviorEvidenceTargetIdentity
): void {
  assertNonEmpty(target.caseId, "Evidence case id");
  assertNonEmpty(provenance.caseId, "Provenance case id");
  if (
    provenance.caseId !== target.caseId ||
    provenance.checkpoint !== target.checkpoint ||
    provenance.aspect !== target.aspect
  ) {
    throw new Error(
      `Evidence provenance target ${provenance.caseId}:${targetKey(provenance)} does not match ${target.caseId}:${targetKey(target)}.`
    );
  }
  if (provenance.kind === "fishmark-probe") {
    assertNonEmpty(provenance.probeCaseId, "Probe case id");
    assertNonEmpty(provenance.assertion, "Probe assertion");
    return;
  }
  if (provenance.kind === "electron-manifest-runner") {
    assertNonEmpty(provenance.manifestHash, "Runner manifest hash");
    assertNonEmpty(provenance.contractHash, "Runner contract hash");
    assertNonEmpty(provenance.runId, "Runner run id");
    return;
  }
  assertNonEmpty(provenance.file, "Repository test file");
  assertNonEmpty(provenance.testName, "Repository test name");
}

function validateCaseProbeBinding(
  provenance: EditorBehaviorEvidenceProvenance,
  caseId: string,
  probeCaseId: string | undefined
): void {
  if (provenance.kind !== "fishmark-probe") {
    return;
  }
  if (probeCaseId !== provenance.probeCaseId) {
    throw new Error(
      `FishMark probe ${provenance.probeCaseId} does not match behavior case ${caseId} probe classification.`
    );
  }
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
  readonly caseId: string;
  readonly file: string;
  readonly testName: string;
  readonly verifiedTargets: readonly Pick<
    EditorBehaviorEvidenceTarget,
    "checkpoint" | "aspect"
  >[];
  readonly gapReason: string;
}): EditorBehaviorEvidence {
  return createEvidence({
    gapReason: input.gapReason,
    verifiedTargets: input.verifiedTargets.map((target) => ({
      ...target,
      caseId: input.caseId,
      provenance: {
        kind: "repository-test",
        caseId: input.caseId,
        checkpoint: target.checkpoint,
        aspect: target.aspect,
        file: input.file,
        testName: input.testName
      }
    }))
  });
}

function validateEvidence(
  evidence: EditorBehaviorEvidence,
  caseId?: string,
  probeCaseId?: string
): void {
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
      } else if (state.status === "verified" || state.status === "known-defect-observed") {
        validateProvenance(state.provenance, {
          caseId: caseId ?? state.provenance.caseId,
          checkpoint,
          aspect
        });
        if (caseId !== undefined) {
          validateCaseProbeBinding(state.provenance, caseId, probeCaseId);
        }
      } else {
        throw new Error(`Invalid evidence state for ${checkpoint}:${aspect}.`);
      }
    }
  }
}

export function statusForEvidence(evidence: EditorBehaviorEvidence): EditorBehaviorCurrentStatus {
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
  readonly probeCaseId?: string;
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
  readonly probeCaseId?: string;
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
  readonly caseId: string;
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

export function createEditorBehaviorEvidenceObservation<
  const Observation extends EditorBehaviorEvidenceObservation
>(observation: Observation): Observation {
  validateProvenance(observation.provenance, observation);
  if (observation.provenance.kind === "fishmark-probe") {
    throw new Error(
      "Catalog-owned FishMark probe provenance cannot be used for dynamic evidence observations."
    );
  }
  if (containsNonFiniteNumber(observation.observed)) {
    throw new Error("Evidence observation values must contain only finite numbers.");
  }
  return observation;
}

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

function containsNonFiniteNumber(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "number") {
    return !Number.isFinite(value);
  }
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).some((child) => containsNonFiniteNumber(child, seen));
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    left === null ||
    right === null ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameValue(leftRecord[key], rightRecord[key])
    )
  );
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
    if (observation.caseId !== behaviorCase.id) {
      throw new Error(
        `Evidence observation case ${observation.caseId} does not match behavior case ${behaviorCase.id}.`
      );
    }
    const key = targetKey(observation);
    if (keys.has(key)) {
      throw new Error(`Duplicate evidence target ${key}.`);
    }
    keys.add(key);
    createEditorBehaviorEvidenceObservation(observation);
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
  validateEvidence(
    input.classification.evidence,
    input.id,
    input.classification.probeCaseId
  );
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
