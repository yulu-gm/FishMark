export const fishMarkNamedProbeCatalog = [
  { caseId: "empty-type-hash", group: "empty-document" },
  { caseId: "empty-type-one-space", group: "empty-document" },
  { caseId: "empty-type-three-spaces", group: "empty-document" },
  { caseId: "empty-spaces-enter-text", group: "empty-document" },
  { caseId: "empty-spaces-repeated-enter", group: "empty-document" },
  { caseId: "paragraph-end-enter", group: "paragraph" },
  { caseId: "paragraph-middle-enter", group: "paragraph" },
  { caseId: "paragraph-start-enter", group: "paragraph" },
  { caseId: "heading-end-enter", group: "heading" },
  { caseId: "heading-end-repeated-enter", group: "heading" },
  { caseId: "heading-empty-paragraph-space", group: "heading" },
  { caseId: "heading-empty-paragraph-backspace", group: "heading" },
  { caseId: "structural-blank-arrow-down", group: "structural-blank" },
  { caseId: "blockquote-raw-prefix-hidden", group: "blockquote" },
  { caseId: "blockquote-marker-commits-after-text", group: "blockquote" },
  { caseId: "blockquote-marker-commits-after-selection-move", group: "blockquote" },
  { caseId: "nested-blockquote-marker-commits-after-text", group: "blockquote" },
  { caseId: "blockquote-marker-commits-after-enter", group: "blockquote" },
  { caseId: "nested-blockquote-marker-commits-after-enter", group: "blockquote" },
  { caseId: "blockquote-bare-separator-rendering", group: "blockquote" },
  { caseId: "blockquote-structural-separator-navigation", group: "blockquote" },
  { caseId: "blockquote-trailing-empty-separator-backspace", group: "blockquote" },
  { caseId: "blockquote-list-trailing-empty-backspace", group: "blockquote" },
  { caseId: "nested-quote-list-repeated-enter-exit", group: "blockquote" },
  { caseId: "blockquote-bare-list-marker-tab", group: "blockquote" },
  { caseId: "blockquote-padded-empty-list-item-tab", group: "blockquote" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", group: "blockquote" },
  { caseId: "blockquote-list-tab-after-residual-separator", group: "blockquote" },
  { caseId: "blockquote-inner-blocks-rendering-enter", group: "blockquote" },
  { caseId: "blockquote-code-fence-input", group: "blockquote" },
  { caseId: "blockquote-table-rendering", group: "blockquote" },
  { caseId: "deep-ordered-list-repeated-enter-exit", group: "list" },
  { caseId: "top-level-list-item-enter-body-upgrade", group: "list" }
] as const;

export type FishMarkNamedProbeCaseId =
  (typeof fishMarkNamedProbeCatalog)[number]["caseId"];

export type FishMarkNamedProbeGroup =
  (typeof fishMarkNamedProbeCatalog)[number]["group"];

export type FishMarkNamedProbeRegistryEntry = {
  readonly caseId: FishMarkNamedProbeCaseId;
  readonly group: FishMarkNamedProbeGroup;
};

/**
 * Keeps the executable probe registry and the typed behavior corpus on the
 * same stable set of case identifiers without importing the DOM probe module.
 */
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
