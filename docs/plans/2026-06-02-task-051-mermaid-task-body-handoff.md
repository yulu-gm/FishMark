Task: TASK-051 Mermaid / diagram code fence 渲染正式任务正文

Changed:
- Restored the TASK-051 formal backlog body under Epic 10 in `MVP_BACKLOG.md`.
- Kept `docs/progress.md` TASK-051 as TODO because Mermaid rendering is not implemented in this docs-only formalization.
- Recorded the parser-owned AST / safe-rendering boundary in `docs/decision-log.md` alongside the restored extension syntax backlog.

Landing files:
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/decision-log.md`
- `docs/plans/2026-06-02-task-051-mermaid-task-body-intake.md`
- `docs/plans/2026-06-02-task-051-mermaid-task-body-handoff.md`

Recommended verification:
- `rg -n -e "TASK-051" -e "Mermaid / diagram code fence" MVP_BACKLOG.md docs/progress.md docs/decision-log.md`
- Manual diff review of `MVP_BACKLOG.md`, `docs/progress.md`, and `docs/decision-log.md`

Manual acceptance draft:
1. Open `MVP_BACKLOG.md`.
2. Confirm Epic 10 contains `TASK-051 Mermaid / diagram code fence 渲染`.
3. Confirm the task body includes safe sandboxing, lazy loading, active code fence source restore, HTML export / fallback, error fallback, and performance budget.
4. Open `docs/progress.md`.
5. Confirm TASK-051 remains TODO and is not marked DEV_DONE.
6. Confirm no Mermaid dependency or runtime implementation was added in this docs-only formalization.

Known risks or not-done items:
- Mermaid rendering remains unimplemented by design. This handoff only covers the formal task body requested for TASK-051.
