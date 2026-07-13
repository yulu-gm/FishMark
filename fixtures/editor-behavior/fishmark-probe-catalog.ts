import type {
  EditorBehaviorAspect,
  EditorBehaviorCheckpointId
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
};

export function findFishMarkProbe(caseId: FishMarkNamedProbeCaseId) {
  const entry = fishMarkNamedProbeCatalog.find((candidate) => candidate.caseId === caseId);
  if (!entry) {
    throw new Error(`Unknown FishMark probe ${caseId}.`);
  }
  return entry;
}

/** Keeps the executable probe registry on the same stable ordered id/group set. */
export function assertCompleteFishMarkProbeRegistry<
  T extends FishMarkNamedProbeRegistryEntry
>(entries: readonly T[]): readonly T[] {
  const expected = fishMarkNamedProbeCatalog.map(({ caseId, group }) => `${group}:${caseId}`);
  const actual = entries.map(({ caseId, group }) => `${group}:${caseId}`);

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
