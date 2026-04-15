/**
 * Stable exit-code contract for the agent CLI (TASK-029).
 *
 * Agents read the process exit code to tell pass, fail, timeout, interrupt,
 * and configuration error apart without parsing stdout. These values must not
 * change without coordinating with every agent consumer.
 */

import type { ScenarioStatus } from "../runner";

export const CLI_EXIT_CODES = {
  passed: 0,
  failed: 1,
  timedOut: 2,
  interrupted: 3,
  configError: 4
} as const;

export type CliExitCode = (typeof CLI_EXIT_CODES)[keyof typeof CLI_EXIT_CODES];

export function exitCodeForStatus(status: ScenarioStatus): CliExitCode {
  switch (status) {
    case "passed":
      return CLI_EXIT_CODES.passed;
    case "failed":
      return CLI_EXIT_CODES.failed;
    case "timed-out":
      return CLI_EXIT_CODES.timedOut;
    case "interrupted":
      return CLI_EXIT_CODES.interrupted;
    case "idle":
    case "running":
      // A scenario should never reach the CLI in a non-terminal state. If it
      // does, surface it as a config error so the contract stays honest.
      return CLI_EXIT_CODES.configError;
  }
}
