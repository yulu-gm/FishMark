import {
  editorBehaviorAspects,
  editorBehaviorCheckpointIds,
  type EditorBehaviorCase,
  type EditorBehaviorAspect,
  type EditorBehaviorCheckpointId,
  type EditorBehaviorEvidenceProvenance,
  type EditorBehaviorEvidenceTargetIdentity
} from "./model";

export type FishMarkProbeCapability = {
  readonly checkpoint: EditorBehaviorCheckpointId;
  readonly aspect: EditorBehaviorAspect;
  readonly assertion: string;
};

const PROBE_FILE = "src/renderer/markdown-editing-experience-probe.ts";

function capabilities(
  checkpoint: EditorBehaviorCheckpointId,
  aspects: readonly EditorBehaviorAspect[]
): readonly FishMarkProbeCapability[] {
  return aspects.map((aspect) => ({
    checkpoint,
    aspect,
    assertion:
      aspect === "source"
        ? "The probe pass condition compares the complete document source with this checkpoint."
        : aspect === "selection"
          ? "The probe pass condition compares the complete editor selection with this checkpoint."
          : "The probe pass condition checks the visible role oracle for every physical line in this checkpoint."
  }));
}

function entry<
  const CaseId extends string,
  const Group extends string
>(
  caseId: CaseId,
  group: Group,
  functionName: string,
  verifiedCapabilities: readonly FishMarkProbeCapability[]
) {
  return {
    caseId,
    group,
    probe: { file: PROBE_FILE, functionName },
    capabilities: verifiedCapabilities
  } as const;
}

const SOURCE_SELECTION_ROLES = ["source", "selection", "visible-line-roles"] as const;
const SOURCE_SELECTION = ["source", "selection"] as const;

/**
 * Canonical metadata for the named renderer probes.
 *
 * A capability is present only when the probe's `pass` expression directly
 * asserts the complete typed checkpoint target. Empty capability arrays are
 * intentional: the probe remains discoverable without manufacturing evidence.
 */
export const fishMarkNamedProbeCatalog = [
  entry("empty-type-hash", "empty-document", "runEmptyTypeHashCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("empty-type-one-space", "empty-document", "runEmptyDocumentSpaceCaretCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("empty-type-three-spaces", "empty-document", "runEmptyTypeThreeSpacesCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("empty-spaces-enter-text", "empty-document", "runEmptySpacesEnterTextCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("empty-spaces-repeated-enter", "empty-document", "runEmptySpacesRepeatedEnterCase", capabilities("repeat", SOURCE_SELECTION_ROLES)),
  entry("paragraph-end-enter", "paragraph", "runParagraphEndEnterCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("paragraph-middle-enter", "paragraph", "runParagraphMiddleEnterCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("paragraph-start-enter", "paragraph", "runParagraphStartEnterCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("heading-end-enter", "heading", "runHeadingEndEnterCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("heading-end-repeated-enter", "heading", "runHeadingEndRepeatedEnterCase", capabilities("repeat", SOURCE_SELECTION_ROLES)),
  entry("heading-empty-paragraph-space", "heading", "runHeadingEnterSpaceCaretCase", capabilities("primary", SOURCE_SELECTION)),
  entry("heading-empty-paragraph-backspace", "heading", "runHeadingEmptyParagraphBackspaceCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("structural-blank-arrow-down", "structural-blank", "runStructuralBlankArrowDownCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("blockquote-raw-prefix-hidden", "blockquote", "runBlockquoteRawPrefixCase", []),
  entry("blockquote-marker-commits-after-text", "blockquote", "runBlockquoteMarkerCommitInputCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("blockquote-marker-commits-after-selection-move", "blockquote", "runBlockquoteMarkerCommitOnSelectionMoveCase", capabilities("primary", ["source"])),
  entry("nested-blockquote-marker-commits-after-text", "blockquote", "runNestedBlockquoteMarkerCommitInputCase", capabilities("primary", SOURCE_SELECTION_ROLES)),
  entry("blockquote-marker-commits-after-enter", "blockquote", "runBlockquoteMarkerCommitOnEnterInputCase", capabilities("primary", SOURCE_SELECTION)),
  entry("nested-blockquote-marker-commits-after-enter", "blockquote", "runNestedBlockquoteMarkerCommitOnEnterInputCase", capabilities("primary", SOURCE_SELECTION)),
  entry("blockquote-bare-separator-rendering", "blockquote", "runBlockquoteBareSeparatorRenderingCase", []),
  entry("blockquote-structural-separator-navigation", "blockquote", "runBlockquoteStructuralSeparatorNavigationCase", capabilities("primary", ["selection"])),
  entry("blockquote-trailing-empty-separator-backspace", "blockquote", "runBlockquoteTrailingEmptySeparatorBackspaceCase", capabilities("primary", SOURCE_SELECTION)),
  entry("blockquote-list-trailing-empty-backspace", "blockquote", "runBlockquoteListTrailingEmptyBackspaceCase", capabilities("primary", SOURCE_SELECTION)),
  entry(
    "nested-quote-list-repeated-enter-exit",
    "blockquote",
    "runNestedQuoteListRepeatedEnterExitCase",
    [...capabilities("primary", SOURCE_SELECTION), ...capabilities("repeat", SOURCE_SELECTION)]
  ),
  entry("blockquote-bare-list-marker-tab", "blockquote", "runBlockquoteBareListMarkerTabCase", capabilities("primary", SOURCE_SELECTION)),
  entry("blockquote-padded-empty-list-item-tab", "blockquote", "runBlockquotePaddedEmptyListItemTabCase", capabilities("primary", SOURCE_SELECTION)),
  entry(
    "blockquote-list-exit-trailing-separator-cleanup",
    "blockquote",
    "runBlockquoteListExitTrailingSeparatorCleanupCase",
    [...capabilities("primary", ["source"]), ...capabilities("repeat", SOURCE_SELECTION)]
  ),
  entry("blockquote-list-tab-after-residual-separator", "blockquote", "runBlockquoteListTabAfterResidualSeparatorCase", capabilities("primary", SOURCE_SELECTION)),
  entry("blockquote-inner-blocks-rendering-enter", "blockquote", "runBlockquoteInnerBlocksRenderingAndEnterCase", capabilities("primary", SOURCE_SELECTION)),
  entry("blockquote-code-fence-input", "blockquote", "runBlockquoteCodeFenceInputCase", capabilities("primary", SOURCE_SELECTION)),
  entry("blockquote-table-rendering", "blockquote", "runBlockquoteTableRenderingCase", []),
  entry("deep-ordered-list-repeated-enter-exit", "list", "runDeepOrderedListRepeatedEnterExitCase", capabilities("repeat", SOURCE_SELECTION)),
  entry("top-level-list-item-enter-body-upgrade", "list", "runTopLevelListItemEnterBodyUpgradeCase", capabilities("primary", SOURCE_SELECTION))
] as const;

export type FishMarkNamedProbeCaseId =
  (typeof fishMarkNamedProbeCatalog)[number]["caseId"];

export type FishMarkNamedProbeGroup =
  (typeof fishMarkNamedProbeCatalog)[number]["group"];

export type FishMarkNamedProbeRegistryEntry = {
  readonly caseId: FishMarkNamedProbeCaseId;
  readonly group: FishMarkNamedProbeGroup;
  readonly run: (...args: never[]) => unknown;
};

type FishMarkProbeProvenance = Extract<
  EditorBehaviorEvidenceProvenance,
  { readonly kind: "fishmark-probe" }
>;

export function findFishMarkProbe(caseId: string) {
  const entry = fishMarkNamedProbeCatalog.find((candidate) => candidate.caseId === caseId);
  if (!entry) {
    throw new Error(`Unknown FishMark probe ${caseId}.`);
  }
  return entry;
}

function capabilityFor(
  caseId: FishMarkNamedProbeCaseId,
  checkpoint: EditorBehaviorCheckpointId,
  aspect: EditorBehaviorAspect
) {
  const probe = findFishMarkProbe(caseId);
  const capability = probe.capabilities.find(
    (candidate) => candidate.checkpoint === checkpoint && candidate.aspect === aspect
  );
  if (!capability) {
    throw new Error(
      `Probe ${caseId} does not declare capability ${checkpoint}:${aspect}.`
    );
  }
  return { capability, probe };
}

export function createFishMarkProbeProvenance(
  target: EditorBehaviorEvidenceTargetIdentity & {
    readonly probeCaseId: FishMarkNamedProbeCaseId;
  }
): FishMarkProbeProvenance {
  const { capability, probe } = capabilityFor(
    target.probeCaseId,
    target.checkpoint,
    target.aspect
  );
  return {
    kind: "fishmark-probe",
    caseId: target.caseId,
    checkpoint: target.checkpoint,
    aspect: target.aspect,
    probeCaseId: target.probeCaseId,
    assertion: `${probe.probe.file}:${probe.probe.functionName}: ${capability.assertion}`
  };
}

export function assertFishMarkProbeProvenance(
  target: EditorBehaviorEvidenceTargetIdentity,
  provenance: EditorBehaviorEvidenceProvenance
): void {
  if (provenance.kind !== "fishmark-probe") {
    throw new Error(`Evidence ${target.caseId}:${target.checkpoint}:${target.aspect} is not probe provenance.`);
  }
  const expected = createFishMarkProbeProvenance({
    ...target,
    probeCaseId: provenance.probeCaseId as FishMarkNamedProbeCaseId
  });
  if (
    provenance.caseId !== expected.caseId ||
    provenance.checkpoint !== expected.checkpoint ||
    provenance.aspect !== expected.aspect ||
    provenance.probeCaseId !== expected.probeCaseId ||
    provenance.assertion !== expected.assertion
  ) {
    throw new Error(
      `Probe provenance does not match catalog capability ${target.caseId}:${target.checkpoint}:${target.aspect}.`
    );
  }
}

export function assertFishMarkProbeCaseBindings(
  behaviorCases: readonly EditorBehaviorCase[]
): readonly EditorBehaviorCase[] {
  for (const behaviorCase of behaviorCases) {
    const classifiedProbeCaseId = behaviorCase.classification.probeCaseId;
    if (classifiedProbeCaseId !== undefined) {
      findFishMarkProbe(classifiedProbeCaseId);
    }
    for (const checkpoint of editorBehaviorCheckpointIds) {
      for (const aspect of editorBehaviorAspects) {
        const evidence = behaviorCase.classification.evidence[checkpoint][aspect];
        if (evidence.status !== "verified" || evidence.provenance.kind !== "fishmark-probe") {
          continue;
        }
        if (classifiedProbeCaseId !== evidence.provenance.probeCaseId) {
          throw new Error(
            `Behavior case ${behaviorCase.id} probe classification does not match its verified provenance.`
          );
        }
        assertFishMarkProbeProvenance(
          { caseId: behaviorCase.id, checkpoint, aspect },
          evidence.provenance
        );
      }
    }
  }
  return [...behaviorCases];
}

/** Keeps the executable probe registry on the same stable ordered id/group/function set. */
export function assertCompleteFishMarkProbeRegistry<
  T extends FishMarkNamedProbeRegistryEntry
>(entries: readonly T[]): readonly T[] {
  const expected = fishMarkNamedProbeCatalog.map(
    ({ caseId, group, probe }) => `${group}:${caseId}:${probe.functionName}`
  );
  const actual = entries.map(({ caseId, group, run }) => `${group}:${caseId}:${run.name}`);

  if (new Set(actual).size !== actual.length || actual.join("\n") !== expected.join("\n")) {
    throw new Error(
      [
        "Named FishMark probe registry does not match the typed catalog.",
        `Expected: ${expected.join(", ")}`,
        `Actual: ${actual.join(", ")}`
      ].join("\n")
    );
  }

  return [...entries];
}
