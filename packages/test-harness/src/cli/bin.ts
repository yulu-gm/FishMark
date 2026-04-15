#!/usr/bin/env node
/**
 * Executable entry for the test-harness CLI (TASK-029).
 *
 * This file is kept minimal: it wires process.argv / stdio / SIGINT to the
 * reusable {@link runCli} core and exits with the contracted code. Any real
 * behavior belongs in `run.ts` so the test suite can exercise it directly.
 */

import { runCli, CLI_VERSION } from "./run";
import { CLI_EXIT_CODES } from "./exit-codes";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const controller = new AbortController();

  const onSignal = () => {
    // First SIGINT requests graceful stop via the runner's abort path. A
    // second one lets the default handler terminate the process hard.
    process.off("SIGINT", onSignal);
    controller.abort(new Error("SIGINT received."));
  };
  process.on("SIGINT", onSignal);

  try {
    const outcome = await runCli({
      argv,
      cwd: process.cwd(),
      io: {
        stdout: (line) => process.stdout.write(`${line}\n`),
        stderr: (line) => process.stderr.write(`${line}\n`)
      },
      signal: controller.signal
    });
    process.exit(outcome.exitCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`test-harness cli ${CLI_VERSION} crashed: ${message}\n`);
    process.exit(CLI_EXIT_CODES.configError);
  } finally {
    process.off("SIGINT", onSignal);
  }
}

void main();
