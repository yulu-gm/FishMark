import { editorBehaviorKnownDefectObservations as historicalDefects } from "./current-observations";
import { editorBehaviorAspects } from "./model";
import { rawEditorBehaviorCases } from "./raw-cases";
import type {
  EditorBehaviorKnownDefectObservation,
  EditorBehaviorRunnerCalibration,
  EditorBehaviorRunnerVerifiedTarget
} from "./runner-protocol";

/**
 * Complete fresh RF-506 Electron calibration: 121 cases, 363 checkpoints, 2541 targets.
 * Run d46d7078-8ac3-4cf3-9a0f-0ac89953a320: 2434 exact verified, 107 unchanged historical defects,
 * zero unexpected, zero not-run. All prior pending contract targets passed exactly.
 * The active set still retains those 107 defect targets, but it is no longer 107 unchanged
 * historical objects: 103 are the identical RF-001 historical objects and 4 are explicit,
 * target-specific re-observations (editorBehaviorReObservedKnownDefects) whose exact current value
 * moved when RF-602 canonical container-prefix normalization advanced the top-of-document ArrowUp
 * fallback from the nested marker-prefix offset to the first visible content character (4 / 6).
 * The desired contract is unchanged in every case, so all 107 remain genuine retained defects.
 * Historical RF-001 values/provenance remain immutable in current-observations.ts.
 */
const retainedKnownTargetKeys = new Set<string>([
  "empty-type-hash:primary:semantic-path",
  "empty-type-hash:repeat:semantic-path",
  "empty-type-hash:undo:semantic-path",
  "empty-type-one-space:primary:semantic-path",
  "empty-type-one-space:repeat:semantic-path",
  "empty-type-one-space:undo:semantic-path",
  "empty-type-three-spaces:primary:semantic-path",
  "empty-type-three-spaces:repeat:semantic-path",
  "empty-type-three-spaces:undo:semantic-path",
  "empty-spaces-enter-text:repeat:semantic-path",
  "empty-spaces-enter-text:undo:semantic-path",
  "empty-spaces-enter-text:undo:source",
  "empty-spaces-enter-text:undo:selection",
  "empty-spaces-enter-text:undo:visible-line-roles",
  "empty-spaces-enter-text:undo:physical-geometry",
  "whitespace-line-enter:primary:semantic-path",
  "whitespace-line-enter:repeat:semantic-path",
  "whitespace-line-enter:repeat:physical-geometry",
  "whitespace-line-enter:undo:semantic-path",
  "paragraph-end-enter:primary:semantic-path",
  "paragraph-end-enter:repeat:semantic-path",
  "paragraph-end-enter:repeat:physical-geometry",
  "paragraph-middle-enter:repeat:semantic-path",
  "paragraph-middle-enter:repeat:selection",
  "paragraph-middle-enter:repeat:physical-geometry",
  "paragraph-start-enter:primary:physical-geometry",
  "paragraph-start-enter:repeat:semantic-path",
  "paragraph-start-enter:repeat:selection",
  "paragraph-start-enter:repeat:physical-geometry",
  "heading-end-enter:primary:semantic-path",
  "heading-end-enter:repeat:semantic-path",
  "heading-end-enter:repeat:physical-geometry",
  "heading-end-enter:undo:semantic-path",
  "heading-end-repeated-enter:primary:semantic-path",
  "heading-end-repeated-enter:repeat:semantic-path",
  "heading-end-repeated-enter:repeat:physical-geometry",
  "heading-end-repeated-enter:undo:semantic-path",
  "heading-empty-paragraph-space:primary:semantic-path",
  "heading-empty-paragraph-space:repeat:semantic-path",
  "heading-empty-paragraph-space:undo:semantic-path",
  "heading-empty-paragraph-space:undo:source",
  "heading-empty-paragraph-space:undo:selection",
  "heading-empty-paragraph-space:undo:visible-line-roles",
  "heading-empty-paragraph-space:undo:physical-geometry",
  "heading-empty-paragraph-backspace:primary:semantic-path",
  "heading-empty-paragraph-backspace:repeat:semantic-path",
  "heading-empty-paragraph-backspace:undo:semantic-path",
  "blockquote-marker-commits-after-text:undo:semantic-path",
  "nested-blockquote-marker-commits-after-text:undo:semantic-path",
  "blockquote-marker-commits-after-enter:primary:semantic-path",
  "blockquote-marker-commits-after-enter:repeat:semantic-path",
  "blockquote-marker-commits-after-enter:repeat:source",
  "blockquote-marker-commits-after-enter:repeat:selection",
  "blockquote-marker-commits-after-enter:repeat:visible-line-roles",
  "blockquote-marker-commits-after-enter:repeat:physical-geometry",
  "blockquote-marker-commits-after-enter:undo:semantic-path",
  "nested-blockquote-marker-commits-after-enter:primary:semantic-path",
  "nested-blockquote-marker-commits-after-enter:repeat:semantic-path",
  "nested-blockquote-marker-commits-after-enter:undo:semantic-path",
  "blockquote-bare-separator-rendering:primary:semantic-path",
  "blockquote-bare-separator-rendering:repeat:semantic-path",
  "blockquote-bare-separator-rendering:undo:semantic-path",
  "blockquote-structural-separator-navigation:repeat:selection",
  "blockquote-trailing-empty-separator-backspace:undo:semantic-path",
  "blockquote-list-trailing-empty-backspace:undo:semantic-path",
  "nested-quote-list-repeated-enter-exit:repeat:semantic-path",
  "blockquote-list-exit-trailing-separator-cleanup:primary:semantic-path",
  "blockquote-list-exit-trailing-separator-cleanup:repeat:semantic-path",
  "blockquote-inner-blocks-rendering-enter:primary:semantic-path",
  "blockquote-inner-blocks-rendering-enter:repeat:semantic-path",
  "blockquote-table-rendering:primary:semantic-path",
  "blockquote-table-rendering:repeat:semantic-path",
  "blockquote-table-rendering:undo:semantic-path",
  "deep-ordered-list-repeated-enter-exit:primary:physical-geometry",
  "deep-ordered-list-repeated-enter-exit:repeat:semantic-path",
  "deep-ordered-list-repeated-enter-exit:repeat:physical-geometry",
  "deep-ordered-list-repeated-enter-exit:undo:physical-geometry",
  "top-level-list-item-enter-body-upgrade:repeat:semantic-path",
  "top-level-list-item-enter-body-upgrade:repeat:selection",
  "top-level-list-item-enter-body-upgrade:repeat:physical-geometry",
  "blockquote-arrow-down:primary:selection",
  "blockquote-arrow-down:undo:selection",
  "nested-blockquote-arrow-up:repeat:selection",
  "list-blockquote-enter:repeat:semantic-path",
  "matrix-enter-path-1:repeat:semantic-path",
  "matrix-enter-path-1:repeat:selection",
  "matrix-enter-path-1:repeat:physical-geometry",
  "matrix-arrowup-path-1:repeat:selection",
  "matrix-arrowup-path-2:repeat:selection",
  "matrix-arrowup-path-3:repeat:selection",
  "matrix-arrowup-path-4:repeat:selection",
  "matrix-arrowup-path-5:repeat:selection",
  "matrix-arrowup-path-6:repeat:selection",
  "matrix-arrowup-path-7:repeat:selection",
  "matrix-arrowup-path-8:repeat:selection",
  "matrix-arrowup-path-9:repeat:selection",
  "matrix-arrowup-path-10:repeat:selection",
  "matrix-arrowdown-path-2:primary:selection",
  "matrix-arrowdown-path-2:undo:selection",
  "matrix-arrowdown-path-3:primary:selection",
  "matrix-arrowdown-path-3:undo:selection",
  "matrix-arrowdown-path-7:repeat:selection",
  "matrix-arrowdown-path-8:primary:selection",
  "matrix-arrowdown-path-8:undo:selection",
  "matrix-arrowdown-path-9:primary:selection",
  "matrix-arrowdown-path-9:undo:selection",
  "matrix-arrowdown-path-10:repeat:selection"
]);
const targetKey = (target: EditorBehaviorRunnerVerifiedTarget) => `${target.caseId}:${target.checkpoint}:${target.aspect}`;

const reObservationProvenance =
  "Re-observed exactly in the clean exclusive probe run e6e5abb8-19fa-4b5a-a645-03772d227b69 " +
  "(quiet tree, 8994 ms, verified-existing=79, verified-runner=2363, known-defect-observed=95, " +
  "unexpected-mismatch=4, not-run=0), which excludes the concurrent-probe false positive that run " +
  "e5630ba7-9bb2-4e35-b9e6-df42038c1e42 reported at matrix-enter-path-1:repeat:physical-geometry.";

/**
 * Exact re-observations of retained defects whose current value moved while the desired contract
 * stayed the same. RF-602 canonical container-prefix normalization moved the line-visibility caret
 * normalizer from inside a nested multi-segment marker prefix to the first visible content
 * character, so the `repeat` ArrowUp checkpoint of these nested container paths no longer matches
 * the immutable RF-001 record. The historical baseline in current-observations.ts stays
 * byte-identical; each entry below replaces the RF-001 value of exactly one retained target.
 */
export const editorBehaviorReObservedKnownDefects = [
  {
    caseId: "matrix-arrowup-path-3",
    checkpoint: "repeat",
    aspect: "selection",
    observed: { anchor: 4, head: 4 },
    reason:
      "Retained defect, desired contract unchanged at {anchor:9,head:9}: RF-602 canonical " +
      "container-prefix normalization advanced the top-of-document ArrowUp fallback from the " +
      "nested '- - alpha' marker-prefix offset 2 to the first visible content character (offset 4), " +
      "so the repeat checkpoint observes {anchor:4,head:4} rather than the immutable RF-001 value " +
      "{anchor:2,head:2}. " + reObservationProvenance
  },
  {
    caseId: "matrix-arrowup-path-6",
    checkpoint: "repeat",
    aspect: "selection",
    observed: { anchor: 4, head: 4 },
    reason:
      "Retained defect, desired contract unchanged at {anchor:9,head:9}: RF-602 canonical " +
      "container-prefix normalization advanced the top-of-document ArrowUp fallback from the " +
      "nested '> - alpha' marker-prefix offset 2 to the first visible content character (offset 4), " +
      "so the repeat checkpoint observes {anchor:4,head:4} rather than the immutable RF-001 value " +
      "{anchor:2,head:2}. " + reObservationProvenance
  },
  {
    caseId: "matrix-arrowup-path-8",
    checkpoint: "repeat",
    aspect: "selection",
    observed: { anchor: 4, head: 4 },
    reason:
      "Retained defect, desired contract unchanged at {anchor:9,head:9}: RF-602 canonical " +
      "container-prefix normalization advanced the top-of-document ArrowUp fallback from the " +
      "nested '- > alpha' marker-prefix offset 2 to the first visible content character (offset 4), " +
      "so the repeat checkpoint observes {anchor:4,head:4} rather than the immutable RF-001 value " +
      "{anchor:2,head:2}. " + reObservationProvenance
  },
  {
    caseId: "matrix-arrowup-path-9",
    checkpoint: "repeat",
    aspect: "selection",
    observed: { anchor: 6, head: 6 },
    reason:
      "Retained defect, desired contract unchanged at {anchor:11,head:11}: RF-602 canonical " +
      "container-prefix normalization advanced the top-of-document ArrowUp fallback from the " +
      "nested '- > - alpha' marker-prefix offset 2 to the first visible content character " +
      "(offset 6), so the repeat checkpoint observes {anchor:6,head:6} rather than the immutable " +
      "RF-001 value {anchor:2,head:2}. " + reObservationProvenance
  }
] as const satisfies readonly EditorBehaviorKnownDefectObservation[];

// Fail closed: every retained key must resolve to exactly one active exact observation, and every
// re-observed key must be one of the retained keys. A silent hole here would let the runner report
// an unexpected mismatch instead of the retained defect.
const reObservedKnownDefectByKey = new Map<string, EditorBehaviorKnownDefectObservation>();
for (const defect of editorBehaviorReObservedKnownDefects) {
  const key = targetKey(defect);
  if (reObservedKnownDefectByKey.has(key)) {
    throw new Error(`Re-observed known-defect target ${key} is declared more than once.`);
  }
  if (!retainedKnownTargetKeys.has(key)) {
    throw new Error(`Re-observed known-defect target ${key} is not a retained known-defect target.`);
  }
  reObservedKnownDefectByKey.set(key, defect);
}

export const editorBehaviorKnownDefectObservations: readonly EditorBehaviorKnownDefectObservation[] =
  historicalDefects
    .filter((target) => retainedKnownTargetKeys.has(targetKey(target)))
    .map((target) => reObservedKnownDefectByKey.get(targetKey(target)) ?? target);

const activeKnownDefectByKey = new Map<string, EditorBehaviorKnownDefectObservation>();
for (const defect of editorBehaviorKnownDefectObservations) {
  const key = targetKey(defect);
  if (activeKnownDefectByKey.has(key)) {
    throw new Error(`Active known-defect calibration lists target ${key} more than once.`);
  }
  activeKnownDefectByKey.set(key, defect);
}
for (const key of retainedKnownTargetKeys) {
  if (!activeKnownDefectByKey.has(key)) {
    throw new Error(`Retained known-defect target ${key} has no active exact observation.`);
  }
}
for (const [key, defect] of reObservedKnownDefectByKey) {
  if (activeKnownDefectByKey.get(key) !== defect) {
    throw new Error(`Retained known-defect target ${key} does not carry its re-observed exact value.`);
  }
}

// The complete fresh run verified every other target. Fixed execution/contract
// hashes below reject additions or authoring changes without another calibration.
export const editorBehaviorRunnerVerifiedTargets = rawEditorBehaviorCases.flatMap((behaviorCase) =>
  behaviorCase.checkpoints.flatMap((checkpoint) => editorBehaviorAspects.map((aspect) => ({ caseId: behaviorCase.id, checkpoint: checkpoint.id, aspect })))
).filter((target) => !retainedKnownTargetKeys.has(targetKey(target)));
export const editorBehaviorRunnerCalibration = {
  "manifestHash": "fnv1a32-c3f2d4a4",
  "contractHash": "fnv1a32-c680cf8b",
  "runId": "d46d7078-8ac3-4cf3-9a0f-0ac89953a320",
  "calibrationHash": "fnv1a32-ec70a8b9"
} as const satisfies EditorBehaviorRunnerCalibration;
