# @yulora/test-harness

Static scenario registry and (eventually) runner for the Yulora test workbench.

## Scope

- **TASK-026**: scenario and step metadata model, static registry, query API, seed scenarios.
- **TASK-027**: step state machine and unified runner.
- **TASK-028**: workbench debug surface bound to `runScenario()` events.
- **TASK-029**: agent CLI entry, standard exit codes, artifact protocol.
- **TASK-030 (current)**: visual-test capture, baseline / diff, workbench canvas panel.

## Layout

- `src/scenario.ts` — `TestScenario`, `TestStep` types and validation helpers.
- `src/registry.ts` — `createScenarioRegistry()` factory with insertion-ordered list, tag / surface / search filtering, and id uniqueness enforcement.
- `src/scenarios/` — first-party seed scenarios (`app-shell-startup`, `open-markdown-file-basic`).
- `src/runner.ts` — unified `runScenario()` state machine used by the workbench and the CLI.
- `src/handlers/headless.ts` — headless handler map used by the CLI until a real driver exists.
- `src/cli/` — agent-facing CLI (`bin.ts`, `run.ts`, `args.ts`, `exit-codes.ts`, `artifacts.ts`).
- `src/visual/` — visual-test primitives: pixel `compare`, PNG codec, `runVisualCheck`, `VisualApi` (node + memory backends), deterministic gradient fixture.
- `src/index.ts` — public entry point, exports `defaultScenarioRegistry` pre-seeded with the first-party scenarios.

## CLI

Compile once with `npm run build:cli`, then drive scenarios through the agent entry point:

```
npm run test:scenario -- --id app-shell-startup
```

Flags:

- `--id <scenario-id>` (required) — must be registered in `defaultScenarioRegistry`.
- `--step-timeout <ms>` — per-step wall-clock budget (default 5000).
- `--out-dir <path>` — artifact root (default `.artifacts/test-runs`).
- `--baseline-root <path>` — visual baseline root (default `tests/visual-baselines`).
- `--force-visual-drift` — intentionally shift the gradient so visual compares mismatch (demo / failure-path exercise).
- `--no-artifacts` — skip writing `result.json` / `step-trace.json`.

Each run writes `<out-dir>/<iso-timestamp>-<scenario-id>/result.json` and `step-trace.json`. Visual steps additionally write `visual/<step-id>/actual.png`, `expected.png`, and `diff.png` into the same run directory. Documents carry `protocolVersion: 2`; bump it on any breaking change.

## Visual tests

- Baselines live at `<baseline-root>/<scenario-id>/<step-id>.png` and are auto-created on first run (verdict `baseline-created`, treated as pass).
- On subsequent runs, actual pixels are diffed against the baseline. A match is silent; a mismatch throws from the handler so the step and scenario status flip to `failed` and the CLI exits with code 1.
- The workbench paints actual / expected / diff frames into in-memory `<canvas>` elements. Flip the `Force visual drift` toggle to exercise the mismatch path without touching the filesystem.
- Baseline PNGs are deliberately gitignored under `.artifacts/` and `tests/visual-baselines/`; commit them explicitly when you want a cross-agent reference.

Exit codes (stable contract):

| Code | Meaning             |
|------|---------------------|
| 0    | passed              |
| 1    | failed              |
| 2    | timed out           |
| 3    | interrupted         |
| 4    | configuration error |

## Contract

- Scenario ids and step ids are kebab-case (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`).
- The registry enforces id uniqueness at registration time.
- Scenarios are returned in insertion order, which matches the workbench list order.
- Tags are a closed union in `ScenarioTag` — adding a new tag is a deliberate code change.

The workbench UI and the agent CLI must both consume `defaultScenarioRegistry` so the two surfaces always see the same scenario list.
