import type { TestScenario } from "../scenario";
import { appShellStartupScenario } from "./app-shell-startup";
import { complexEditorNavigationSmokeScenario } from "./complex-editor-navigation-smoke";
import { complexEditorStructureKeysScenario } from "./complex-editor-structure-keys";
import { editorBehaviorMatrixScenario } from "./editor-behavior-matrix";
import { listEnterBehaviorBasicScenario } from "./list-enter-behavior-basic";
import { openMarkdownFileBasicScenario } from "./open-markdown-file-basic";

/**
 * Seed scenarios registered by default. Ordering is significant: this is the
 * order the workbench list renders. Append new scenarios at the end unless a
 * deliberate reorder is required.
 */
export const seedScenarios: readonly TestScenario[] = [
  appShellStartupScenario,
  openMarkdownFileBasicScenario,
  listEnterBehaviorBasicScenario,
  complexEditorNavigationSmokeScenario,
  complexEditorStructureKeysScenario,
  editorBehaviorMatrixScenario
];

export {
  appShellStartupScenario,
  complexEditorNavigationSmokeScenario,
  complexEditorStructureKeysScenario,
  editorBehaviorMatrixScenario,
  listEnterBehaviorBasicScenario,
  openMarkdownFileBasicScenario
};
