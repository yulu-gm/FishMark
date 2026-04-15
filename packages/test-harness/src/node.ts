/**
 * Node-only entry point for the test-harness package (TASK-030).
 *
 * Importing this module pulls in `node:zlib` / `node:fs` via the PNG codec
 * and the CLI artifact writer. Renderer code must not import from here —
 * use the main barrel in `./index` instead, which is browser-safe.
 */

export type { VisualVerdict, VisualCheckInput, VisualCheckResult } from "./visual/check";
export { runVisualCheck } from "./visual/check";
export { encodePng, decodePng, PNG_SIGNATURE } from "./visual/png";
export type { DecodedPng } from "./visual/png";
export { createNodeVisualApi } from "./visual/node-api";
export type { NodeVisualApiOptions } from "./visual/node-api";

export {
  PROTOCOL_VERSION,
  buildResultDocument,
  buildStepTraceDocument,
  runDirName,
  toVisualResultSummary,
  writeRunArtifacts
} from "./cli/artifacts";
export type {
  ResultDocument,
  StepTraceDocument,
  VisualResultSummary,
  WrittenArtifacts
} from "./cli/artifacts";

export { CLI_EXIT_CODES, exitCodeForStatus } from "./cli/exit-codes";
export type { CliExitCode } from "./cli/exit-codes";

export { parseCliArgs, CLI_USAGE } from "./cli/args";
export type { CliOptions, CliParseResult } from "./cli/args";

export { runCli, CLI_VERSION } from "./cli/run";
export type { CliRunDeps, CliRunOutcome, CliIo } from "./cli/run";
