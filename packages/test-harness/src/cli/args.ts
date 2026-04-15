/**
 * Argument parsing for the test-harness CLI (TASK-029).
 *
 * Kept small on purpose: the CLI is an agent-facing entry point, not a
 * general-purpose runner. We only accept the flags the MVP scenarios need
 * and reject anything else so misuse surfaces as a config error (exit 4).
 */

export type CliOptions = {
  readonly scenarioId: string;
  readonly stepTimeoutMs: number;
  readonly outDir: string;
  readonly writeArtifacts: boolean;
};

export type CliParseOk = { readonly kind: "ok"; readonly options: CliOptions };
export type CliParseHelp = { readonly kind: "help"; readonly message: string };
export type CliParseError = { readonly kind: "error"; readonly message: string };
export type CliParseResult = CliParseOk | CliParseHelp | CliParseError;

export const DEFAULT_STEP_TIMEOUT_MS = 5_000;
export const DEFAULT_OUT_DIR = ".artifacts/test-runs";

export const CLI_USAGE = `Usage: npm run test:scenario -- --id <scenario-id> [options]

Options:
  --id <scenario-id>        Scenario id registered in defaultScenarioRegistry (required)
  --step-timeout <ms>       Per-step timeout in milliseconds (default ${DEFAULT_STEP_TIMEOUT_MS})
  --out-dir <path>          Root directory for run artifacts (default ${DEFAULT_OUT_DIR})
  --no-artifacts            Do not write result.json / step-trace.json
  -h, --help                Show this help and exit

Exit codes:
  0  passed
  1  failed
  2  timed out
  3  interrupted
  4  configuration error
`;

export function parseCliArgs(argv: readonly string[]): CliParseResult {
  let scenarioId: string | null = null;
  let stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS;
  let outDir = DEFAULT_OUT_DIR;
  let writeArtifacts = true;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case "-h":
      case "--help":
        return { kind: "help", message: CLI_USAGE };
      case "--id": {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          return { kind: "error", message: "Missing value for --id." };
        }
        scenarioId = next;
        i += 1;
        break;
      }
      case "--step-timeout": {
        const next = argv[i + 1];
        if (next === undefined) {
          return { kind: "error", message: "Missing value for --step-timeout." };
        }
        const parsed = Number.parseInt(next, 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
          return {
            kind: "error",
            message: `Invalid --step-timeout value ${JSON.stringify(next)}. Expected a non-negative integer.`
          };
        }
        stepTimeoutMs = parsed;
        i += 1;
        break;
      }
      case "--out-dir": {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          return { kind: "error", message: "Missing value for --out-dir." };
        }
        outDir = next;
        i += 1;
        break;
      }
      case "--no-artifacts":
        writeArtifacts = false;
        break;
      default:
        return { kind: "error", message: `Unknown argument: ${JSON.stringify(arg)}.` };
    }
  }

  if (scenarioId === null) {
    return { kind: "error", message: "Missing required --id <scenario-id>." };
  }

  return {
    kind: "ok",
    options: {
      scenarioId,
      stepTimeoutMs,
      outDir,
      writeArtifacts
    }
  };
}
