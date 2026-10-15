# TASK-WATCH-LIFECYCLE-048

Goal: one registry-owned destroyed listener per target and no watcher resurrection after target destruction during initialization.
In scope: existing FileWatchRegistry internal lifetime/initialization bookkeeping, deterministic tests and one real-product repeated-snapshot regression.
Out of scope: editing/renderer changes, performance optimization, listener limit changes, warning suppression, 047 evidence changes or six-sample reruns, resource policy/OS settings/cp13/cp16.
Acceptance:100 same-target syncs contribute1 listener;empty/re-subscribe and failed initialization retries remain1;shared windows retain1 watcher until last subscriber leaves;destroyed targets cannot reappear after pending stat;stale setup cannot delete a replacement or strand a live shared subscriber.
Landing:src/main/infrastructure/file-watch-registry.ts and its tests, focused product E2E,project records.
Verification:RED/GREEN deterministic lifecycle tests;production100snapshot listener/no-warning/source/normal-exit proof under owned dual paths and input guard;lint/type/build/strict/fullWindowsE2E/foundation/editing/safety/formal/bundle;independent review;ordinary main push and exactSHA4CI.
Risks:initialization is shared across windows;publish ownership before await and distinguish stale entry identity from current map entry. Keep internal-write and external-change behavior unchanged.
Baseline:main60bedefd6319373674d65dca6fe1d17472996027,CI38791422167 all4SUCCESS;worktree initially clean.
Next:fishmark-task-execution then fishmark-task-acceptance.047 remains FAIL with retained profile/evidence;this batch never reruns its six performance samples.
