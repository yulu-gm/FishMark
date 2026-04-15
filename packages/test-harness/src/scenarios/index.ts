import type { TestScenario } from "../scenario";
import { appShellStartupScenario } from "./app-shell-startup";
import { openMarkdownFileBasicScenario } from "./open-markdown-file-basic";

/**
 * Seed scenarios registered by default. Ordering is significant: this is the
 * order the workbench list renders. Append new scenarios at the end unless a
 * deliberate reorder is required.
 */
export const seedScenarios: readonly TestScenario[] = [
  appShellStartupScenario,
  openMarkdownFileBasicScenario
];

export {
  appShellStartupScenario,
  openMarkdownFileBasicScenario
};
