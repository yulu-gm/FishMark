# Yulora Decision Log

Use this file for short architecture or process decisions that affect future work.

## Template

| Date | Decision | Rationale | Notes |
| --- | --- | --- | --- |

## Entries

| 2026-04-15 | TASK-002 created workspace boundary directories with README placeholders instead of moving the existing root shell. | The current runnable app already satisfies TASK-001's shell setup, and a root move would add churn without improving TASK-002 acceptance. Minimal placeholders keep the new monorepo layout visible in git while preserving reversibility. | `apps/desktop`, `packages/editor-core`, `packages/markdown-engine`, and `tests/e2e` are now reserved for later backlog items. |
| 2026-04-15 | TASK-001 and BOOTSTRAP-DOCS were accepted and closed after independent review. | The recorded proof and documentation now match the verified dev-shell behavior and the gate outcome. | Close out the post-gate bookkeeping. |
| 2026-04-15 | Vite and Electron now use `http://localhost:5173` consistently, with `vite.config.ts` pinned to `host: "localhost"`, `port: 5173`, and `strictPort: true`. | The previous `127.0.0.1` assumption was not reproducible in this host, while Vite was reachable on `localhost`. Pinning the dev server and Electron wait/load URL to the same hostname makes the startup proof deterministic here. | Keeps the dev shell reproducible without changing TASK-002+ scope. |
| 2026-04-15 | Removed the invalid `electron` entry from `tsconfig.electron.json` and restored the local `electron` dependency in `node_modules`. | `TS2688` was caused by asking TypeScript to load a non-`@types` package name through `types`, and the workspace was also missing the actual Electron package tree. Removing the bad `types` entry fixes the compiler path, and reinstalling Electron restores module resolution for `import { app, BrowserWindow } from "electron"`. | This is the smallest fix that matches the confirmed failure mode. |
| 2026-04-15 | Electron package entrypoint and dev startup script now point at the compiled `dist-electron/main/main.js` and `dist-electron/preload/preload.js` outputs, and Electron waits for HTTP readiness before launching. | The emitted TypeScript output lives under `dist-electron/main/` and `dist-electron/preload/`, so the previous paths could not start reliably. Waiting on the HTTP server avoids an early `ERR_CONNECTION_REFUSED` race during dev startup. | Keeps TASK-001 aligned with the actual build output and startup behavior. |
| 2026-04-15 | `docs/` is the canonical working doc path. | The orchestrator expects task-owned docs in `docs/`, so this is now the primary location for active project documentation. | Existing `doc/` files remain as inputs, not the active target location. |
| 2026-04-15 | Existing `doc/` files are legacy source material. | The repo already contains draft design and acceptance docs under `doc/`; copying and adapting them avoids inventing a new direction. | Keep the originals untouched unless the user asks otherwise. |
| 2026-04-15 | Consolidated project documentation under `docs/` and removed the duplicate `doc/` directory. | The duplicate directories were creating avoidable ambiguity. The maintained docs already live in `docs/`, and the only unique leftover content from `doc/` was preserved as `docs/agent-runbook.md`. | This supersedes the earlier "keep `doc/` untouched" note now that the cleanup has been explicitly requested. |
| 2026-04-15 | TASK-001 has been re-recorded with a success-exiting dev-shell proof command after fixing the localhost mismatch and restoring the Electron runtime payload from cache. | The skeleton now typechecks, builds, tests, and starts through the documented scripts; the proof command observes both the localhost Vite server and a live Electron process before exiting 0. | Keep the progress record on `REVIEW_IN_PROGRESS` while review proceeds. |
