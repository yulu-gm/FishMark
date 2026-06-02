Task: TASK-051 Mermaid / diagram code fence 渲染正式任务正文

Goal: 将 Mermaid / diagram code fence 的正式任务正文落回 `MVP_BACKLOG.md`，让后续实现有唯一、可执行、可验收的 backlog 定义。

In scope:
- `MVP_BACKLOG.md` 包含 TASK-051 的目标、依赖、主要落点、交付物、验收和执行切片。
- 正文明确安全沙箱、按需加载、active source restore、静态导出 / fallback、错误回退和性能预算。
- `docs/progress.md` 保持 TASK-051 为 TODO，避免把“正文已恢复”误标成“Mermaid 渲染已实现”。
- `docs/decision-log.md` 记录扩展语法必须继续由 `markdown-engine` 输出 parser-owned range / AST，Mermaid 不得引入不受控脚本执行通道。

Out of scope:
- 不实现 Mermaid renderer。
- 不新增 `mermaid` 依赖。
- 不改 editor-core / renderer / export runtime。
- 不标记 TASK-051 为 DEV_DONE。

Landing area:
- `MVP_BACKLOG.md`
- `docs/progress.md`
- `docs/decision-log.md`
- `docs/plans/2026-06-02-task-051-mermaid-task-body-handoff.md`

Acceptance:
- `MVP_BACKLOG.md` 能用 `rg -n -e "TASK-051" -e "Mermaid / diagram code fence" MVP_BACKLOG.md` 找到正式正文。
- 正文包含安全沙箱、按需加载、active code fence 源码恢复、HTML export/fallback、错误回退和性能预算。
- `docs/progress.md` 中 TASK-051 仍为 TODO。
- 没有新增 Mermaid runtime 代码或依赖。

Verification:
- `rg -n -e "TASK-051" -e "Mermaid / diagram code fence" MVP_BACKLOG.md docs/progress.md docs/decision-log.md`
- `git diff -- MVP_BACKLOG.md docs/progress.md docs/decision-log.md`
- 文档人工复核；本 docs-only formalization 不要求 npm gate，除非同一轮还改代码。

Risks:
- 如果把正文恢复误写成实现完成，会导致 progress / backlog / summary 状态矛盾。
- Mermaid 真正实现仍是后续独立任务，需要 source mode gate、code fence metadata、sandbox 和 export 策略先定好。

Doc updates:
- `docs/plans/2026-06-02-task-051-mermaid-task-body-handoff.md`：记录正式正文已恢复与实现仍 TODO。

Next skill: $fishmark-task-acceptance
