# @yulora/test-harness

Static scenario registry and (eventually) runner for the Yulora test workbench.

## Scope

- **TASK-026**: scenario and step metadata model, static registry, query API, seed scenarios.
- **TASK-027**: step state machine and unified runner.
- **TASK-028**: workbench debug surface bound to `runScenario()` events.
- **TASK-029**: agent CLI entry, standard exit codes, artifact protocol.
- **TASK-030**: visual-test support is being redesigned; the first synthetic implementation was withdrawn.

## Layout

- `src/scenario.ts` — `TestScenario`, `TestStep` types and validation helpers.
- `src/registry.ts` — `createScenarioRegistry()` factory with insertion-ordered list, tag / surface / search filtering, and id uniqueness enforcement.
- `src/scenarios/` — first-party seed scenarios (`app-shell-startup`, `open-markdown-file-basic`).
- `src/runner.ts` — unified `runScenario()` state machine used by the workbench and the CLI.
- `src/handlers/headless.ts` — headless handler map used by the CLI until a real driver exists.
- `src/cli/` — agent-facing CLI (`bin.ts`, `run.ts`, `args.ts`, `exit-codes.ts`, `artifacts.ts`).
- `src/visual/` — experimental visual-test primitives kept out of the default scenario flow until TASK-030 is reworked.
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
- `--no-artifacts` — skip writing `result.json` / `step-trace.json`.

Each run writes `<out-dir>/<iso-timestamp>-<scenario-id>/result.json` and `step-trace.json`. Documents currently carry `protocolVersion: 2`; bump it on any breaking change.

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
