# Yulora 任务文档地图

## 核心文档

每个新 task 都先读这些文档：

| 文档 | 作用 |
| --- | --- |
| `AGENTS.md` | 定义项目使命、固定技术栈、架构规则、任务规则、完成定义和禁止事项。 |
| `docs/design.md` | 定义产品方向、架构边界、编辑模型和 P0/P1/P2 UX 优先级。 |
| `docs/acceptance.md` | 定义产品验收基线和 PASS / FAIL 评审规则。 |
| `MVP_BACKLOG.md` | 唯一有效执行计划。用它确认 task 范围、依赖、验收、任务拆分和代码落点。 |
| `docs/agent-runbook.md` | 定义协作闭环、任务体积控制方式和收尾时必须更新的记录。 |
| `docs/test-cases.md` | 提供人工验收和回归测试场景，用来映射本次验证范围。 |

## 条件文档

按需读取这些文档：

| 文档 | 读取时机 |
| --- | --- |
| `docs/progress.md` | 需要确认当前工作流状态，或确认某个 task 是否仍处于活动状态。 |
| `docs/decision-log.md` | 任务涉及架构、文件流、持久化、编辑语义等容易受既有决策影响的区域。 |
| `docs/test-report.md` | 需要最近的验证证据、命令历史，或需要沿用测试记录格式。 |
| `reports/task-summaries/TASK-xxx.md` | 正在继续、修改或复盘一个已有总结的 task。 |
| `docs/superpowers/specs/*` | 该 task 已有设计文档，或当前需要理解设计意图与权衡。 |
| `docs/superpowers/plans/*` | 该 task 已有实现计划，应按计划执行。 |

## 区域文档

按代码落点补读这些文档：

| 文档 | 读取时机 |
| --- | --- |
| `apps/desktop/README.md` | 任务涉及未来桌面应用包边界。 |
| `packages/editor-core/README.md` | 任务涉及编辑器状态、命令或共享编辑逻辑。 |
| `packages/markdown-engine/README.md` | 任务涉及解析、block map、round-trip 辅助工具或 Markdown 引擎职责。 |
| `tests/e2e/README.md` | 任务涉及 e2e 或 smoke 测试边界。 |

## 新 task 最好提供的信息

最理想的 task 请求包含这些信息：

```md
Task: TASK-xxx，或一个新的 backlog task 提案
Goal: 这一轮要完整交付的用户结果或技术结果
In scope: 这轮包含什么
Out of scope: 这轮明确不做什么
Landing area: 预计改哪些文件、模块、层级
Acceptance: 满足什么算 PASS
Verification: 要跑哪些命令、做哪些人工检查
Risks: 是否涉及 IME / 光标 / undo redo / autosave / round-trip / 跨平台
Doc updates: 预期会更新哪些设计、backlog、进度、决策、测试或总结文档
Next skill: $yulora-task-execution / $yulora-task-acceptance
```

默认目标是完整完成一个 task；只有在 task 明显过大时，才先回到 backlog 把它拆成更小的完整 task。

接单完成后：
- 进入实现阶段时，使用 `$yulora-task-execution`
- 进入验收和收尾阶段时，使用 `$yulora-task-acceptance`

## 完成与更新矩阵

| 条件 | 必须更新 |
| --- | --- |
| 每次完成一个 task | `docs/test-report.md` |
| 每次完成一个 task | `reports/task-summaries/` |
| task 状态改变 | `docs/progress.md` |
| 决策会影响后续工作 | `docs/decision-log.md` |
| 架构基线或用户可见行为基线发生变化 | `docs/design.md` |
| 新行为或变更行为需要明确记录测试场景 | `docs/test-cases.md` |
| task 定义、验收、依赖或任务拆分变更 | `MVP_BACKLOG.md` |

## 验收清单

只有在以下条件全部满足时，才能把 task 视为完成：
- `build` 通过
- `lint` 通过
- `typecheck` 通过
- 相关自动化测试通过
- `MVP_BACKLOG.md` 里的 task 专属验收通过
- `docs/acceptance.md` 的产品基线仍然成立
- 已写出简短任务总结
