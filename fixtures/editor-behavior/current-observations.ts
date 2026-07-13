import type {
  EditorBehaviorKnownDefectObservation,
  EditorBehaviorRunnerVerifiedTarget
} from "./runner-protocol";

/**
 * Exact per-target observations from the complete RF-001 Electron calibration.
 * Execution manifest: fnv1a32-75bf1f50; desired contract: fnv1a32-4af00b7a.
 * Targets: 2541; verified: 2001; known defects: 540.
 * Values are structural baselines, never case-wide allowlists.
 */
export const editorBehaviorRunnerCalibration = {
  manifestHash: "fnv1a32-75bf1f50",
  contractHash: "fnv1a32-4af00b7a",
  runId: "ecde846c-8dfb-468a-94a9-7fd98fd44e61"
} as const;

export const editorBehaviorRunnerVerifiedTargets = [
  { caseId: "empty-type-hash", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "empty-type-hash", checkpoint: "primary", aspect: "source" },
  { caseId: "empty-type-hash", checkpoint: "primary", aspect: "selection" },
  { caseId: "empty-type-hash", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "empty-type-hash", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "empty-type-hash", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "empty-type-hash", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "empty-type-hash", checkpoint: "repeat", aspect: "source" },
  { caseId: "empty-type-hash", checkpoint: "repeat", aspect: "selection" },
  { caseId: "empty-type-hash", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "empty-type-hash", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "empty-type-hash", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "empty-type-hash", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "empty-type-hash", checkpoint: "undo", aspect: "source" },
  { caseId: "empty-type-hash", checkpoint: "undo", aspect: "selection" },
  { caseId: "empty-type-hash", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "empty-type-hash", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "empty-type-hash", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "empty-type-one-space", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "empty-type-one-space", checkpoint: "primary", aspect: "source" },
  { caseId: "empty-type-one-space", checkpoint: "primary", aspect: "selection" },
  { caseId: "empty-type-one-space", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "empty-type-one-space", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "empty-type-one-space", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "empty-type-one-space", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "empty-type-one-space", checkpoint: "repeat", aspect: "source" },
  { caseId: "empty-type-one-space", checkpoint: "repeat", aspect: "selection" },
  { caseId: "empty-type-one-space", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "empty-type-one-space", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "empty-type-one-space", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "empty-type-one-space", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "empty-type-one-space", checkpoint: "undo", aspect: "source" },
  { caseId: "empty-type-one-space", checkpoint: "undo", aspect: "selection" },
  { caseId: "empty-type-one-space", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "empty-type-one-space", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "empty-type-one-space", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "empty-type-three-spaces", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "empty-type-three-spaces", checkpoint: "primary", aspect: "source" },
  { caseId: "empty-type-three-spaces", checkpoint: "primary", aspect: "selection" },
  { caseId: "empty-type-three-spaces", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "empty-type-three-spaces", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "empty-type-three-spaces", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "empty-type-three-spaces", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "empty-type-three-spaces", checkpoint: "repeat", aspect: "source" },
  { caseId: "empty-type-three-spaces", checkpoint: "repeat", aspect: "selection" },
  { caseId: "empty-type-three-spaces", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "empty-type-three-spaces", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "empty-type-three-spaces", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "empty-type-three-spaces", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "empty-type-three-spaces", checkpoint: "undo", aspect: "source" },
  { caseId: "empty-type-three-spaces", checkpoint: "undo", aspect: "selection" },
  { caseId: "empty-type-three-spaces", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "empty-type-three-spaces", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "empty-type-three-spaces", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "empty-spaces-enter-text", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "empty-spaces-enter-text", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "empty-spaces-enter-text", checkpoint: "primary", aspect: "source" },
  { caseId: "empty-spaces-enter-text", checkpoint: "primary", aspect: "selection" },
  { caseId: "empty-spaces-enter-text", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "empty-spaces-enter-text", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "empty-spaces-enter-text", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "empty-spaces-enter-text", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "empty-spaces-enter-text", checkpoint: "repeat", aspect: "source" },
  { caseId: "empty-spaces-enter-text", checkpoint: "repeat", aspect: "selection" },
  { caseId: "empty-spaces-enter-text", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "empty-spaces-enter-text", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "empty-spaces-enter-text", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "empty-spaces-enter-text", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "empty-spaces-enter-text", checkpoint: "undo", aspect: "source" },
  { caseId: "empty-spaces-enter-text", checkpoint: "undo", aspect: "selection" },
  { caseId: "empty-spaces-enter-text", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "empty-spaces-enter-text", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "empty-spaces-enter-text", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "whitespace-line-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "whitespace-line-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "whitespace-line-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "whitespace-line-enter", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "whitespace-line-enter", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "whitespace-line-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "whitespace-line-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "whitespace-line-enter", checkpoint: "repeat", aspect: "source" },
  { caseId: "whitespace-line-enter", checkpoint: "repeat", aspect: "selection" },
  { caseId: "whitespace-line-enter", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "whitespace-line-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "whitespace-line-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "whitespace-line-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "whitespace-line-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "whitespace-line-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "whitespace-line-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "whitespace-line-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "paragraph-end-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "paragraph-end-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "paragraph-end-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "paragraph-end-enter", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "paragraph-end-enter", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "paragraph-end-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "paragraph-end-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "paragraph-end-enter", checkpoint: "repeat", aspect: "source" },
  { caseId: "paragraph-end-enter", checkpoint: "repeat", aspect: "selection" },
  { caseId: "paragraph-end-enter", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "paragraph-end-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "paragraph-end-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "paragraph-end-enter", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "paragraph-end-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "paragraph-end-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "paragraph-end-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "paragraph-end-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "paragraph-end-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "paragraph-middle-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "paragraph-middle-enter", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "paragraph-middle-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "paragraph-middle-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "paragraph-middle-enter", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "paragraph-middle-enter", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "paragraph-middle-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "paragraph-middle-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "paragraph-middle-enter", checkpoint: "repeat", aspect: "source" },
  { caseId: "paragraph-middle-enter", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "paragraph-middle-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "paragraph-middle-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "paragraph-middle-enter", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "paragraph-middle-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "paragraph-middle-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "paragraph-middle-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "paragraph-middle-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "paragraph-middle-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "paragraph-start-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "paragraph-start-enter", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "paragraph-start-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "paragraph-start-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "paragraph-start-enter", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "paragraph-start-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "paragraph-start-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "paragraph-start-enter", checkpoint: "repeat", aspect: "source" },
  { caseId: "paragraph-start-enter", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "paragraph-start-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "paragraph-start-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "paragraph-start-enter", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "paragraph-start-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "paragraph-start-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "paragraph-start-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "paragraph-start-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "paragraph-start-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "heading-end-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "heading-end-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "heading-end-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "heading-end-enter", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "heading-end-enter", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "heading-end-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "heading-end-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "heading-end-enter", checkpoint: "repeat", aspect: "source" },
  { caseId: "heading-end-enter", checkpoint: "repeat", aspect: "selection" },
  { caseId: "heading-end-enter", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "heading-end-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "heading-end-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "heading-end-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "heading-end-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "heading-end-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "heading-end-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "heading-end-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "heading-end-repeated-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "heading-end-repeated-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "heading-end-repeated-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "heading-end-repeated-enter", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "heading-end-repeated-enter", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "heading-end-repeated-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "heading-end-repeated-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "heading-end-repeated-enter", checkpoint: "repeat", aspect: "source" },
  { caseId: "heading-end-repeated-enter", checkpoint: "repeat", aspect: "selection" },
  { caseId: "heading-end-repeated-enter", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "heading-end-repeated-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "heading-end-repeated-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "heading-end-repeated-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "heading-end-repeated-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "heading-end-repeated-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "heading-end-repeated-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "heading-end-repeated-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "primary", aspect: "source" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "primary", aspect: "selection" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "repeat", aspect: "source" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "repeat", aspect: "selection" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "undo", aspect: "source" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "undo", aspect: "selection" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "heading-empty-paragraph-space", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "primary", aspect: "source" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "primary", aspect: "selection" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "repeat", aspect: "source" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "repeat", aspect: "selection" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "undo", aspect: "source" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "undo", aspect: "selection" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "heading-empty-paragraph-backspace", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "structural-blank-arrow-down", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "structural-blank-arrow-down", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "structural-blank-arrow-down", checkpoint: "primary", aspect: "source" },
  { caseId: "structural-blank-arrow-down", checkpoint: "primary", aspect: "selection" },
  { caseId: "structural-blank-arrow-down", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "structural-blank-arrow-down", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "structural-blank-arrow-down", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "structural-blank-arrow-down", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "structural-blank-arrow-down", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "structural-blank-arrow-down", checkpoint: "repeat", aspect: "source" },
  { caseId: "structural-blank-arrow-down", checkpoint: "repeat", aspect: "selection" },
  { caseId: "structural-blank-arrow-down", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "structural-blank-arrow-down", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "structural-blank-arrow-down", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "structural-blank-arrow-down", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "structural-blank-arrow-down", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "structural-blank-arrow-down", checkpoint: "undo", aspect: "source" },
  { caseId: "structural-blank-arrow-down", checkpoint: "undo", aspect: "selection" },
  { caseId: "structural-blank-arrow-down", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "structural-blank-arrow-down", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "structural-blank-arrow-down", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-raw-prefix-hidden", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-marker-commits-after-selection-move", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "source" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "selection" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "source" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "selection" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "source" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "selection" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "nested-blockquote-marker-commits-after-text", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "nested-blockquote-marker-commits-after-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-bare-separator-rendering", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-structural-separator-navigation", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-trailing-empty-separator-backspace", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-trailing-empty-backspace", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "primary", aspect: "source" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "primary", aspect: "selection" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "repeat", aspect: "source" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "repeat", aspect: "selection" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "undo", aspect: "source" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "undo", aspect: "selection" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "nested-quote-list-repeated-enter-exit", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-bare-list-marker-tab", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-padded-empty-list-item-tab", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-tab-after-residual-separator", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-list-exit-trailing-separator-cleanup", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-inner-blocks-rendering-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-code-fence-input", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-code-fence-input", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "blockquote-code-fence-input", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-code-fence-input", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-code-fence-input", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-code-fence-input", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-code-fence-input", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-code-fence-input", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-code-fence-input", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "blockquote-code-fence-input", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-code-fence-input", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-code-fence-input", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "blockquote-code-fence-input", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-code-fence-input", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-code-fence-input", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-code-fence-input", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-code-fence-input", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-table-rendering", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-table-rendering", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-table-rendering", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-table-rendering", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-table-rendering", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-table-rendering", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-table-rendering", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-table-rendering", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-table-rendering", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-table-rendering", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-table-rendering", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-table-rendering", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-table-rendering", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-table-rendering", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-table-rendering", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "primary", aspect: "source" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "primary", aspect: "selection" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "repeat", aspect: "source" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "repeat", aspect: "selection" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "undo", aspect: "source" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "undo", aspect: "selection" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "deep-ordered-list-repeated-enter-exit", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "primary", aspect: "source" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "primary", aspect: "selection" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "repeat", aspect: "source" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "undo", aspect: "source" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "undo", aspect: "selection" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "top-level-list-item-enter-body-upgrade", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "list-item-start-backspace", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "list-item-start-backspace", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "list-item-start-backspace", checkpoint: "primary", aspect: "source" },
  { caseId: "list-item-start-backspace", checkpoint: "primary", aspect: "selection" },
  { caseId: "list-item-start-backspace", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "list-item-start-backspace", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "list-item-start-backspace", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "list-item-start-backspace", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "list-item-start-backspace", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "list-item-start-backspace", checkpoint: "repeat", aspect: "source" },
  { caseId: "list-item-start-backspace", checkpoint: "repeat", aspect: "selection" },
  { caseId: "list-item-start-backspace", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "list-item-start-backspace", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "list-item-start-backspace", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "list-item-start-backspace", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "list-item-start-backspace", checkpoint: "undo", aspect: "source" },
  { caseId: "list-item-start-backspace", checkpoint: "undo", aspect: "selection" },
  { caseId: "list-item-start-backspace", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "list-item-start-backspace", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "list-item-start-backspace", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "nested-list-item-tab", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "nested-list-item-tab", checkpoint: "primary", aspect: "source" },
  { caseId: "nested-list-item-tab", checkpoint: "primary", aspect: "selection" },
  { caseId: "nested-list-item-tab", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "nested-list-item-tab", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "nested-list-item-tab", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "nested-list-item-tab", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "nested-list-item-tab", checkpoint: "repeat", aspect: "source" },
  { caseId: "nested-list-item-tab", checkpoint: "repeat", aspect: "selection" },
  { caseId: "nested-list-item-tab", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "nested-list-item-tab", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "nested-list-item-tab", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "nested-list-item-tab", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "nested-list-item-tab", checkpoint: "undo", aspect: "source" },
  { caseId: "nested-list-item-tab", checkpoint: "undo", aspect: "selection" },
  { caseId: "nested-list-item-tab", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "nested-list-item-tab", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "nested-list-item-tab", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-arrow-down", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-arrow-down", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "blockquote-arrow-down", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-arrow-down", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-arrow-down", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-arrow-down", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-arrow-down", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "blockquote-arrow-down", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-arrow-down", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-arrow-down", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-arrow-down", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-arrow-down", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-arrow-down", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "blockquote-arrow-down", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-arrow-down", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-arrow-down", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "primary", aspect: "source" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "primary", aspect: "selection" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "repeat", aspect: "source" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "undo", aspect: "source" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "undo", aspect: "selection" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "nested-blockquote-arrow-up", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-list-shift-tab", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "blockquote-list-code-fence-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "list-blockquote-enter", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "list-blockquote-enter", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "list-blockquote-enter", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "list-blockquote-enter", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "list-blockquote-enter", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "list-blockquote-enter", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "list-blockquote-enter", checkpoint: "undo", aspect: "source" },
  { caseId: "list-blockquote-enter", checkpoint: "undo", aspect: "selection" },
  { caseId: "list-blockquote-enter", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "list-blockquote-enter", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "list-blockquote-list-tab", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "list-blockquote-list-tab", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "list-blockquote-list-tab", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "list-blockquote-list-tab", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "list-blockquote-list-tab", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "list-blockquote-list-tab", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "list-blockquote-list-tab", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "list-blockquote-list-tab", checkpoint: "undo", aspect: "source" },
  { caseId: "list-blockquote-list-tab", checkpoint: "undo", aspect: "selection" },
  { caseId: "list-blockquote-list-tab", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "list-blockquote-list-tab", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "nested-quote-list-block-math-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-1", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-1", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-1", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-enter-path-1", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-enter-path-1", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-1", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-1", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-1", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-1", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-enter-path-1", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-1", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-1", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-1", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-1", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-1", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-1", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-1", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-1", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-2", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-2", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-enter-path-2", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-enter-path-2", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-2", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-2", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-2", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-2", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-2", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-enter-path-2", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-enter-path-2", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-2", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-2", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-2", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-2", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-2", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-2", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-2", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-2", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-3", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-3", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-3", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-3", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-3", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-3", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-3", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-3", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-3", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-3", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-4", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-4", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-4", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-4", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-4", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-4", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-4", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-4", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-4", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-4", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-4", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-4", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-4", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-4", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-5", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-5", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-5", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-enter-path-5", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-enter-path-5", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-5", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-5", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-5", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-5", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-enter-path-5", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-enter-path-5", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-5", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-5", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-5", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-enter-path-5", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-5", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-5", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-5", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-5", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-6", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-6", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-enter-path-6", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-enter-path-6", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-6", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-6", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-6", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-6", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-6", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-6", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-6", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-6", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-6", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-6", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-7", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-7", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-enter-path-7", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-7", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-7", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-enter-path-7", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-7", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-7", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-7", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-7", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-7", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-8", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-8", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-8", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-8", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-8", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-8", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-8", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-8", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-8", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-9", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-9", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-9", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-9", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-9", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-9", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-9", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-9", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-9", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-9", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-enter-path-9", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-enter-path-10", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-enter-path-10", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-enter-path-10", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-enter-path-10", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-enter-path-10", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-enter-path-10", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-enter-path-10", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-enter-path-10", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-enter-path-10", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-1", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-1", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-1", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-1", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-1", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-1", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-1", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-1", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-1", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-1", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-1", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-1", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-1", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-1", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-1", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-1", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-1", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-1", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-1", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-1", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-1", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-2", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-2", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-2", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-2", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-2", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-2", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-2", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-2", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-2", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-2", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-2", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-2", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-2", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-2", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-2", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-2", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-2", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-2", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-3", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-3", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-3", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-3", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-3", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-3", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-3", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-3", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-3", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-3", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-3", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-3", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-3", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-3", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-3", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-4", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-4", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-4", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-4", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-4", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-4", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-4", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-4", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-4", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-4", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-4", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-4", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-4", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-4", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-4", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-4", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-4", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-4", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-4", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-4", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-4", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-5", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-5", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-5", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-5", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-5", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-5", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-5", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-5", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-5", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-5", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-5", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-5", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-5", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-5", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-5", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-5", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-backspace-path-5", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-5", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-5", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-5", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-5", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-6", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-6", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-6", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-6", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-6", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-6", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-6", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-6", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-6", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-6", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-6", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-6", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-6", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-6", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-6", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-6", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-6", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-6", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-7", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-7", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-7", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-7", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-7", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-7", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-7", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-7", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-7", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-7", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-7", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-7", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-7", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-7", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-7", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-8", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-8", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-8", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-8", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-8", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-8", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-8", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-8", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-8", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-8", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-8", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-8", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-8", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-8", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-8", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-9", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-9", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-9", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-9", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-9", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-9", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-9", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-9", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-9", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-9", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-9", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-9", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-9", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-9", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-backspace-path-9", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-10", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-10", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-backspace-path-10", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-backspace-path-10", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-10", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-10", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-10", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-backspace-path-10", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-backspace-path-10", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-10", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-backspace-path-10", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-backspace-path-10", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-backspace-path-10", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-backspace-path-10", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-backspace-path-10", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-1", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-1", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-1", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-1", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-1", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-1", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-1", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-1", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-1", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-1", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-1", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-1", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-1", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-1", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-1", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-1", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-1", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-1", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-1", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-1", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-1", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-2", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-2", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-2", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-2", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-2", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-2", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-2", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-2", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-2", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-2", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-2", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-2", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-2", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-2", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-2", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-2", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-2", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-2", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-3", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-3", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-3", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-3", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-3", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-3", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-3", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-3", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-3", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-3", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-3", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-3", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-3", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-3", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-3", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-4", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-4", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-4", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-4", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-4", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-4", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-4", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-4", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-4", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-4", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-4", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-4", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-4", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-4", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-4", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-4", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-4", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-4", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-4", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-4", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-4", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-5", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-5", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-5", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-5", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-5", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-5", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-5", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-5", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-5", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-5", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-5", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-5", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-5", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-5", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-5", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-5", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-tab-path-5", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-5", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-5", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-5", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-5", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-6", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-6", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-6", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-6", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-6", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-6", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-6", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-6", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-6", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-6", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-6", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-6", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-6", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-6", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-6", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-6", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-6", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-6", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-7", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-7", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-7", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-7", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-7", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-7", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-7", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-7", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-7", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-7", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-7", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-7", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-7", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-7", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-7", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-8", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-8", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-8", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-8", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-8", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-8", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-8", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-8", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-8", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-8", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-8", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-8", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-8", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-8", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-8", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-9", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-9", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-9", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-9", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-9", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-9", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-9", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-9", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-9", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-9", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-9", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-9", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-9", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-9", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-tab-path-9", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-tab-path-10", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-tab-path-10", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-tab-path-10", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-tab-path-10", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-10", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-tab-path-10", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-tab-path-10", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-tab-path-10", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-tab-path-10", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-10", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-tab-path-10", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-tab-path-10", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-tab-path-10", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-tab-path-10", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-tab-path-10", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-1", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-2", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-3", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-4", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-5", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-6", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-7", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-8", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-shift-tab-path-9", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-shift-tab-path-10", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-1", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-2", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-3", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-4", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-5", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-6", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-7", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-8", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowup-path-9", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowup-path-10", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-1", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-2", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-3", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-4", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-5", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-6", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-7", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-8", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-arrowdown-path-9", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-arrowdown-path-10", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-1", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-1", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-1", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-1", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-1", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-1", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-1", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-1", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-1", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-1", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-1", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-1", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-1", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-1", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-1", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-1", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-1", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-1", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-1", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-1", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-1", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-2", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-2", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-2", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-2", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-2", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-2", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-2", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-2", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-2", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-2", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-2", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-2", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-2", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-2", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-2", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-2", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-2", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-2", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-3", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-3", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-3", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-3", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-3", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-3", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-3", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-3", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-3", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-3", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-3", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-3", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-3", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-3", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-3", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-4", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-4", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-4", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-4", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-4", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-4", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-4", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-4", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-4", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-4", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-4", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-4", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-4", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-4", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-4", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-4", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-4", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-4", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-4", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-4", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-4", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-5", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-5", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-5", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-5", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-5", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-5", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-5", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-5", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-5", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-5", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-5", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-5", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-5", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-5", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-5", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-5", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "matrix-selection-path-5", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-5", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-5", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-5", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-5", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-6", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-6", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-6", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-6", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-6", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-6", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-6", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-6", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-6", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-6", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-6", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-6", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-6", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-6", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-6", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-6", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-6", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-6", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-7", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-7", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-7", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-7", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-7", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-7", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-7", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-7", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-7", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-7", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-7", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-7", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-7", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-7", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-7", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-8", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-8", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-8", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-8", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-8", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-8", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-8", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-8", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-8", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-8", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-8", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-8", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-8", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-8", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-8", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-9", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-9", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-9", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-9", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-9", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-9", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-9", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-9", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-9", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-9", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-9", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-9", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-9", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-9", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "matrix-selection-path-9", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "matrix-selection-path-10", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "matrix-selection-path-10", checkpoint: "primary", aspect: "source" },
  { caseId: "matrix-selection-path-10", checkpoint: "primary", aspect: "selection" },
  { caseId: "matrix-selection-path-10", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-10", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "matrix-selection-path-10", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "matrix-selection-path-10", checkpoint: "repeat", aspect: "source" },
  { caseId: "matrix-selection-path-10", checkpoint: "repeat", aspect: "selection" },
  { caseId: "matrix-selection-path-10", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-10", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "matrix-selection-path-10", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "matrix-selection-path-10", checkpoint: "undo", aspect: "source" },
  { caseId: "matrix-selection-path-10", checkpoint: "undo", aspect: "selection" },
  { caseId: "matrix-selection-path-10", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "matrix-selection-path-10", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-0-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "primary", aspect: "semantic-path" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "repeat", aspect: "semantic-path" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "undo", aspect: "semantic-path" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-1-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "primary", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "repeat", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "undo", aspect: "physical-geometry" },
  { caseId: "mixed-container-depth-2-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-3-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-4-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-5-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-6-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-7-selection", checkpoint: "undo", aspect: "view-mode" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "primary", aspect: "command-plan" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "primary", aspect: "source" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "primary", aspect: "selection" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "primary", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "primary", aspect: "view-mode" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "repeat", aspect: "command-plan" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "repeat", aspect: "source" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "repeat", aspect: "selection" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "repeat", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "repeat", aspect: "view-mode" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "undo", aspect: "command-plan" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "undo", aspect: "source" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "undo", aspect: "selection" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "undo", aspect: "visible-line-roles" },
  { caseId: "mixed-container-depth-8-selection", checkpoint: "undo", aspect: "view-mode" }
] satisfies readonly EditorBehaviorRunnerVerifiedTarget[];

const observedValues = [
  [
    "Document"
  ],
  [
    {
      "line": 1,
      "sourceText": "   ",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 5,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "Paragraph",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 5,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  {
    "anchor": 8,
    "head": 8
  },
  [
    {
      "line": 1,
      "sourceText": "Alpha",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "Beta",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "Paragraph",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  {
    "anchor": 3,
    "head": 3
  },
  [
    {
      "line": 1,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "Paragraph",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "# Title",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 5,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "# Title",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 5,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 6,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 7,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    "Document",
    "Blockquote"
  ],
  [
    {
      "line": 1,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "Paragraph",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    "Document",
    "Blockquote",
    "Blockquote"
  ],
  [
    "content",
    "structural-separator"
  ],
  "\n",
  {
    "anchor": 1,
    "head": 1
  },
  [
    "structural-separator",
    "empty-editing-line"
  ],
  [
    {
      "line": 1,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  ">\n> ",
  {
    "anchor": 4,
    "head": 4
  },
  [
    "structural-separator",
    "structural-separator"
  ],
  [
    {
      "line": 1,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "> ",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    "Document",
    "Paragraph"
  ],
  [
    {
      "line": 1,
      "sourceText": "> 1",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> 222",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 5,
      "sourceText": "Plain paragraph",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> 1",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> 222",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  {
    "anchor": 2,
    "head": 2
  },
  [
    {
      "line": 1,
      "sourceText": "> 1111",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> ",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    "Document",
    "Blockquote",
    "List"
  ],
  [
    {
      "line": 1,
      "sourceText": "> 111",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> - list1",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> - list2",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": ">   - child list",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> 111",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> - list1",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> - list2",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": ">   - child lis",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> 111",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> - list1",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> - list2",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": ">   - child list",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 6,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 7,
      "sourceText": "> ",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    "Document",
    "Blockquote",
    "Blockquote",
    "List"
  ],
  [
    {
      "line": 1,
      "sourceText": "> 引用块",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> > 二级引用块",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> > - List 1",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "> > - List 2",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 6,
      "sourceText": "> >   - List 2.1",
      "geometry": {
        "semanticDepth": 4,
        "contentColumn": 8,
        "markerColumn": 6,
        "visibility": "visible"
      }
    },
    {
      "line": 7,
      "sourceText": "> > -",
      "geometry": {
        "semanticDepth": 4,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    "content",
    "structural-separator",
    "content",
    "content",
    "content",
    "content",
    "content",
    "structural-separator"
  ],
  [
    {
      "line": 1,
      "sourceText": "> 引用块",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> > 二级引用块",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> > - List 1",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "> > - List 2",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 6,
      "sourceText": "> >   - List 2.1",
      "geometry": {
        "semanticDepth": 4,
        "contentColumn": 8,
        "markerColumn": 6,
        "visibility": "visible"
      }
    },
    {
      "line": 7,
      "sourceText": "> > ",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "collapsed"
      }
    },
    {
      "line": 8,
      "sourceText": "> > ",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> 引用块",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> > 二级引用块",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> > - List 1",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "> > - List 2",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 6,
      "sourceText": "> >   - List 2.1",
      "geometry": {
        "semanticDepth": 4,
        "contentColumn": 8,
        "markerColumn": 6,
        "visibility": "visible"
      }
    },
    {
      "line": 7,
      "sourceText": "> >   -",
      "geometry": {
        "semanticDepth": 4,
        "contentColumn": 6,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> > - parent",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "> > -",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> - List 1",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> - 2",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> - List1",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> ",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> alpha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> ",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "> ```\n> ```\n\nPlain paragraph",
  [
    "code-fence-delimiter",
    "code-fence-delimiter",
    "structural-separator",
    "content"
  ],
  [
    {
      "line": 1,
      "sourceText": "> ```",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "> ```",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 4,
      "sourceText": "Plain paragraph",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> Before",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> | name | qty |",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> | --- | ---: |",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "> | pen | 2 |",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 6,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 7,
      "sourceText": "> After",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    "Document",
    "List"
  ],
  [
    {
      "line": 1,
      "sourceText": "1. 111",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 3,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "2. 222",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 3,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "  1. 2.1",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 5,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "    1. 2.1.1",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 7,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "    2. ",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 7,
        "markerColumn": 4,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "1. 111",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 3,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "2. 222",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 3,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "  1. 2.1",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 5,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "    1. 2.1.1",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 7,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 6,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "1. 111",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 3,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "2. 222",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 3,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "  1. 2.1",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 5,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "    1. 2.1.1",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 7,
        "markerColumn": 4,
        "visibility": "visible"
      }
    }
  ],
  {
    "anchor": 14,
    "head": 14
  },
  [
    {
      "line": 1,
      "sourceText": "1. Previous",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 3,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "Body",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  {
    "anchor": 17,
    "head": 17
  },
  [
    {
      "line": 1,
      "sourceText": "> first",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> second",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    "content",
    "content",
    "content"
  ],
  "- > quote\n- ",
  {
    "anchor": 12,
    "head": 12
  },
  [
    {
      "line": 1,
      "sourceText": "- > quote",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "- ",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "- > quote\n\n",
  {
    "anchor": 11,
    "head": 11
  },
  [
    "content",
    "structural-separator",
    "empty-editing-line"
  ],
  [
    {
      "line": 1,
      "sourceText": "- > quote",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- > quote",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "- > - first\n  > - second\n  > - target",
  {
    "anchor": 32,
    "head": 32
  },
  [
    {
      "line": 1,
      "sourceText": "- > - first",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "  > - second",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "  > - target",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  {
    "anchor": 5,
    "head": 5
  },
  [
    {
      "line": 1,
      "sourceText": "al",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "pha",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  "- - al\n- pha",
  {
    "anchor": 9,
    "head": 9
  },
  [
    {
      "line": 1,
      "sourceText": "- - al",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "- pha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "- - al\n\npha",
  [
    "content",
    "structural-separator",
    "content"
  ],
  [
    {
      "line": 1,
      "sourceText": "- - al",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "pha",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- - alpha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "> al\n>\n> pha",
  [
    {
      "line": 1,
      "sourceText": "> al",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> pha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "> al\n>\n> \n>\n> pha",
  [
    "content",
    "structural-separator",
    "content",
    "structural-separator",
    "content"
  ],
  [
    {
      "line": 1,
      "sourceText": "> al",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> ",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "collapsed"
      }
    },
    {
      "line": 4,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "> pha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    "content",
    "content",
    "content",
    "content",
    "content"
  ],
  "> - al\n> pha",
  [
    "content",
    "content"
  ],
  [
    {
      "line": 1,
      "sourceText": "> - al",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "> pha",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    "Document",
    "Blockquote",
    "Paragraph"
  ],
  "> - ```txt\n>   al\n>\n> pha\n>   ```",
  [
    "content",
    "content",
    "structural-separator",
    "content",
    "code-fence-delimiter"
  ],
  [
    {
      "line": 1,
      "sourceText": "> - ```txt",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">   al",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> pha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": ">   ```",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 4,
        "markerColumn": 0,
        "visibility": "collapsed"
      }
    }
  ],
  "> - ```txt\n>   al\n>\n> \n>\n> pha\n>   ```",
  [
    "content",
    "content",
    "structural-separator",
    "content",
    "structural-separator",
    "content",
    "code-fence-delimiter"
  ],
  [
    {
      "line": 1,
      "sourceText": "> - ```txt",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": ">   al",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 4,
      "sourceText": "> ",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "collapsed"
      }
    },
    {
      "line": 5,
      "sourceText": ">",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 1,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 6,
      "sourceText": "> pha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 7,
      "sourceText": ">   ```",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 4,
        "markerColumn": 0,
        "visibility": "collapsed"
      }
    }
  ],
  "- > al\n- pha",
  [
    {
      "line": 1,
      "sourceText": "- > al",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "- pha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "- > al\n\npha",
  [
    {
      "line": 1,
      "sourceText": "- > al",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "pha",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- > alpha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "- > - al\n- pha",
  [
    {
      "line": 1,
      "sourceText": "- > - al",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "- pha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "- > - al\n\npha",
  {
    "anchor": 10,
    "head": 10
  },
  [
    {
      "line": 1,
      "sourceText": "- > - al",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "collapsed"
      }
    },
    {
      "line": 3,
      "sourceText": "pha",
      "geometry": {
        "semanticDepth": 0,
        "contentColumn": 0,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- > - alpha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    "Document",
    "Blockquote",
    "Blockquote",
    "Paragraph"
  ],
  "> > - $$\n> >   al\n> > \n> > pha\n> >   $$",
  {
    "anchor": 27,
    "head": 27
  },
  [
    "content",
    "content",
    "content",
    "content",
    "block-math-delimiter"
  ],
  [
    {
      "line": 1,
      "sourceText": "> > - $$",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "> >   al",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> > ",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "collapsed"
      }
    },
    {
      "line": 4,
      "sourceText": "> > pha",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 5,
      "sourceText": "> >   $$",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 6,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  "> > - $$\n> >   al\n> > \n> > \n> > \n> > pha\n> >   $$",
  {
    "anchor": 37,
    "head": 37
  },
  [
    "content",
    "content",
    "content",
    "content",
    "content",
    "content",
    "block-math-delimiter"
  ],
  [
    {
      "line": 1,
      "sourceText": "> > - $$",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 4,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "> >   al",
      "geometry": {
        "semanticDepth": 3,
        "contentColumn": 6,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 3,
      "sourceText": "> > ",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "collapsed"
      }
    },
    {
      "line": 4,
      "sourceText": "> > ",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "collapsed"
      }
    },
    {
      "line": 5,
      "sourceText": "> > ",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "collapsed"
      }
    },
    {
      "line": 6,
      "sourceText": "> > pha",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    },
    {
      "line": 7,
      "sourceText": "> >   $$",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 6,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- - alph",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- - alp",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- > alph",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- > alp",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- > - alph",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- > - alp",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "- alpha",
  {
    "anchor": 7,
    "head": 7
  },
  [
    {
      "line": 1,
      "sourceText": "- alpha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    }
  ],
  "- - alpha",
  "> - alpha",
  [
    {
      "line": 1,
      "sourceText": "> - alpha",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  "- > - alpha",
  {
    "anchor": 0,
    "head": 0
  },
  [
    {
      "line": 1,
      "sourceText": "- - alpha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "    omega",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 4,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    "content",
    "content",
    "content",
    "content"
  ],
  [
    {
      "line": 1,
      "sourceText": "- > alpha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "  > omega",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "- > - alpha",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": 0,
        "visibility": "visible"
      }
    },
    {
      "line": 2,
      "sourceText": "  >   omega",
      "geometry": {
        "semanticDepth": 1,
        "contentColumn": 2,
        "markerColumn": null,
        "visibility": "visible"
      }
    }
  ],
  {
    "anchor": 13,
    "head": 13
  },
  {
    "anchor": 38,
    "head": 38
  },
  {
    "anchor": 21,
    "head": 21
  },
  {
    "anchor": 41,
    "head": 41
  },
  [
    {
      "line": 1,
      "sourceText": "> - > leaf",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> 1. > 1. leaf",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 5,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> - [ ] > - [ ] > leaf",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 8,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> - > - > - leaf",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 4,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> 1. > 1. > 1. > leaf",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 5,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ],
  [
    {
      "line": 1,
      "sourceText": "> - [ ] > - [ ] > - [ ] > - [ ] leaf",
      "geometry": {
        "semanticDepth": 2,
        "contentColumn": 8,
        "markerColumn": 2,
        "visibility": "visible"
      }
    }
  ]
] as const;

export const editorBehaviorKnownDefectObservations = [
  {
    caseId: "empty-type-hash",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-type-hash",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-type-hash",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-type-one-space",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-type-one-space",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-type-one-space",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-type-three-spaces",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-type-three-spaces",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-type-three-spaces",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-spaces-enter-text",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "empty-spaces-enter-text",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "whitespace-line-enter",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "whitespace-line-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "whitespace-line-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[1],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "whitespace-line-enter",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-end-enter",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-end-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-end-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[2],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-middle-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-middle-enter",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[3],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-middle-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[4],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-start-enter",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[5],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-start-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-start-enter",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[6],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "paragraph-start-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[7],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "heading-end-enter",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-end-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-end-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[8],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "heading-end-enter",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-end-repeated-enter",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-end-repeated-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-end-repeated-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[9],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "heading-end-repeated-enter",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-empty-paragraph-space",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-empty-paragraph-space",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-empty-paragraph-space",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-empty-paragraph-backspace",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-empty-paragraph-backspace",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "heading-empty-paragraph-backspace",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-text",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-selection-move",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[11],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-selection-move",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[11],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-selection-move",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[11],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-text",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[12],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-enter",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-enter",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[13],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[14],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[15],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[16],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[17],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-marker-commits-after-enter",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-enter",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[12],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-enter",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[13],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[18],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[19],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[20],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[21],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-marker-commits-after-enter",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[12],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-separator-rendering",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[22],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-separator-rendering",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[23],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-separator-rendering",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[22],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-separator-rendering",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[23],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-separator-rendering",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[22],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-separator-rendering",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[23],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-structural-separator-navigation",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[24],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-structural-separator-navigation",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[25],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-structural-separator-navigation",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[24],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-structural-separator-navigation",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[24],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-trailing-empty-separator-backspace",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-trailing-empty-separator-backspace",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[26],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-trailing-empty-backspace",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-trailing-empty-backspace",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[28],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-trailing-empty-backspace",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-trailing-empty-backspace",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[29],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-trailing-empty-backspace",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-trailing-empty-backspace",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[30],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-repeated-enter-exit",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-repeated-enter-exit",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[32],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-repeated-enter-exit",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[12],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-repeated-enter-exit",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[33],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-repeated-enter-exit",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[34],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-repeated-enter-exit",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-repeated-enter-exit",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[35],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-list-marker-tab",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-list-marker-tab",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-list-marker-tab",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-bare-list-marker-tab",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[36],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-padded-empty-list-item-tab",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-padded-empty-list-item-tab",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-padded-empty-list-item-tab",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-tab-after-residual-separator",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-tab-after-residual-separator",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-tab-after-residual-separator",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-tab-after-residual-separator",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[37],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-exit-trailing-separator-cleanup",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-exit-trailing-separator-cleanup",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[38],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-exit-trailing-separator-cleanup",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-exit-trailing-separator-cleanup",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-inner-blocks-rendering-enter",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-inner-blocks-rendering-enter",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[39],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-inner-blocks-rendering-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-code-fence-input",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[40],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-code-fence-input",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[3],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-code-fence-input",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[41],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-code-fence-input",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[42],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-table-rendering",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-table-rendering",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[43],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-table-rendering",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-table-rendering",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[43],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-table-rendering",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[10],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-table-rendering",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[43],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "deep-ordered-list-repeated-enter-exit",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "deep-ordered-list-repeated-enter-exit",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[45],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "deep-ordered-list-repeated-enter-exit",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "deep-ordered-list-repeated-enter-exit",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[46],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "deep-ordered-list-repeated-enter-exit",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "deep-ordered-list-repeated-enter-exit",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[47],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "top-level-list-item-enter-body-upgrade",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "top-level-list-item-enter-body-upgrade",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[48],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "top-level-list-item-enter-body-upgrade",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[49],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "top-level-list-item-enter-body-upgrade",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "list-item-start-backspace",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-list-item-tab",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-list-item-tab",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-list-item-tab",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-arrow-down",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[50],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-arrow-down",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[51],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-arrow-down",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[51],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-arrow-down",
    checkpoint: "undo",
    aspect: "selection",
    observed: observedValues[50],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-arrow-down",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[51],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "nested-blockquote-arrow-up",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[19],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-shift-tab",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-shift-tab",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-shift-tab",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-code-fence-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-code-fence-selection",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-code-fence-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-code-fence-selection",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-code-fence-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "blockquote-list-code-fence-selection",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[53],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[54],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[55],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[56],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[57],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[58],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[59],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-enter",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[60],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[61],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[62],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[63],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[61],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[62],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[63],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "list-blockquote-list-tab",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[63],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-block-math-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-block-math-selection",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-block-math-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-block-math-selection",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-block-math-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "nested-quote-list-block-math-selection",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-1",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[0],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-1",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[64],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-1",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[65],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-2",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-2",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[66],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[68],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[22],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[69],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[3],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[70],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[71],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-3",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-4",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[73],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-4",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-4",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[74],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-4",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[75],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-4",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[48],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-4",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[76],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-4",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[77],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-5",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-5",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[78],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-6",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-6",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-6",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[79],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-6",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-6",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[80],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-6",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[81],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-6",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[82],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[83],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[84],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[85],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[82],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[86],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[87],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[88],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-7",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[89],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[80],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[90],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[22],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[91],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[3],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[70],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[92],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-8",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[94],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[57],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[95],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[22],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[96],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[97],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[98],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-9",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[100],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[101],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[102],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[103],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[104],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[100],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[105],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[106],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[107],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[108],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-enter-path-10",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-2",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-2",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-2",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-3",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-3",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[109],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-3",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-3",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[110],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-3",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-3",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-6",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-6",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-6",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-7",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-7",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-7",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-7",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-7",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-7",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-8",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-8",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[111],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-8",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-8",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[112],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-8",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-8",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-9",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-9",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[113],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-9",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-9",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[114],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-9",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-9",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-10",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-10",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-10",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-10",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-10",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-backspace-path-10",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-2",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-2",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-2",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-3",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-3",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-3",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-3",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-3",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-3",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-6",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-6",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-6",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-7",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-7",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-7",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-7",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-7",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-7",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-8",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-8",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-8",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-8",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-8",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-8",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-9",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-9",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-9",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-9",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-9",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-9",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-10",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-10",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-10",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-10",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-10",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-tab-path-10",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[115],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[116],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[117],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[115],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[116],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[117],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-2",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[118],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[118],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-3",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[119],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[120],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[119],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[120],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-6",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-7",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-7",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-7",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-7",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-7",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-7",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-8",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-8",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-8",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-8",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-8",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-8",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "primary",
    aspect: "source",
    observed: observedValues[121],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[57],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "repeat",
    aspect: "source",
    observed: observedValues[121],
    reason:
      "RF-001 Electron calibration observed a current source result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[57],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-9",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-10",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-10",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-10",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-10",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-10",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-shift-tab-path-10",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-1",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[122],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-2",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-2",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-2",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[25],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-2",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-3",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-3",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[123],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-3",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-3",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[25],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-3",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[123],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-3",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-3",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[123],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-4",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[25],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-5",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[19],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-6",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-6",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-6",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[25],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-6",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-7",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-7",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-7",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-7",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[67],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-7",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-7",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-7",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-8",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-8",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[125],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-8",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-8",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[25],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-8",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[125],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-8",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-8",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[125],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-9",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-9",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[126],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-9",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-9",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[25],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-9",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[126],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-9",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-9",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[126],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-10",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-10",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-10",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-10",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[3],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-10",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-10",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowup-path-10",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-2",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-2",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[127],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-2",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-2",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-2",
    checkpoint: "undo",
    aspect: "selection",
    observed: observedValues[127],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-3",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-3",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[50],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-3",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[123],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-3",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-3",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[123],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-3",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-3",
    checkpoint: "undo",
    aspect: "selection",
    observed: observedValues[50],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-3",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[123],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-6",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-6",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-6",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-7",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-7",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-7",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-7",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[128],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-7",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-7",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-7",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-8",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-8",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[50],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-8",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[125],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-8",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-8",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[125],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-8",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-8",
    checkpoint: "undo",
    aspect: "selection",
    observed: observedValues[50],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-8",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[125],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-9",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-9",
    checkpoint: "primary",
    aspect: "selection",
    observed: observedValues[129],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-9",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[126],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-9",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-9",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[126],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-9",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-9",
    checkpoint: "undo",
    aspect: "selection",
    observed: observedValues[129],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-9",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[126],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-10",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-10",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-10",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-10",
    checkpoint: "repeat",
    aspect: "selection",
    observed: observedValues[130],
    reason:
      "RF-001 Electron calibration observed a current selection result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-10",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-10",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-arrowdown-path-10",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[124],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-2",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-2",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-2",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-3",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-3",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-3",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-3",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-3",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-3",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[72],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-6",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-6",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-6",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-7",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-7",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-7",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-7",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-7",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-7",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-8",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-8",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-8",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-8",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-8",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-8",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[93],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-9",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-9",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-9",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-9",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-9",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[44],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-9",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[99],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-10",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-10",
    checkpoint: "primary",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-10",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-10",
    checkpoint: "repeat",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-10",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[31],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "matrix-selection-path-10",
    checkpoint: "undo",
    aspect: "visible-line-roles",
    observed: observedValues[52],
    reason:
      "RF-001 Electron calibration observed a current visible-line-roles result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-2-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-2-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-2-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-3-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-3-selection",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[131],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-3-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-3-selection",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[131],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-3-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-3-selection",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[131],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-4-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-4-selection",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[132],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-4-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-4-selection",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[132],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-4-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-4-selection",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[132],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-5-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-5-selection",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[133],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-5-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-5-selection",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[133],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-5-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-5-selection",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[133],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-6-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-6-selection",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[134],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-6-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-6-selection",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[134],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-6-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-6-selection",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[134],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-7-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-7-selection",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[135],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-7-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-7-selection",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[135],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-7-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-7-selection",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[135],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-8-selection",
    checkpoint: "primary",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-8-selection",
    checkpoint: "primary",
    aspect: "physical-geometry",
    observed: observedValues[136],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-8-selection",
    checkpoint: "repeat",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-8-selection",
    checkpoint: "repeat",
    aspect: "physical-geometry",
    observed: observedValues[136],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-8-selection",
    checkpoint: "undo",
    aspect: "semantic-path",
    observed: observedValues[27],
    reason:
      "RF-001 Electron calibration observed a current semantic-path result that differs from the desired editor contract."
  },
  {
    caseId: "mixed-container-depth-8-selection",
    checkpoint: "undo",
    aspect: "physical-geometry",
    observed: observedValues[136],
    reason:
      "RF-001 Electron calibration observed a current physical-geometry result that differs from the desired editor contract."
  }
] satisfies readonly EditorBehaviorKnownDefectObservation[];
