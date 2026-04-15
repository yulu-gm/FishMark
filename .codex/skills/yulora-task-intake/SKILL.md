---
name: yulora-task-intake
description: 用于 Yulora 项目的 task 接单、定界、实现、验收和收尾。适用于开始一个新任务、继续 backlog task、确认做任务前该读哪些项目文档、明确验收标准、或判断完成后需要更新哪些项目文档的场景。
---

# Yulora 任务接单

## Overview

在实现或评审 Yulora task 之前使用这个 skill。默认目标是单轮把一个 task 完整做完，而不是默认只做一个切片；如果 backlog 里的 task 体积过大，就先回到 `MVP_BACKLOG.md` 拆成可以单轮完成的更小 task，再开始实现。

具体文档清单、输入模板和更新矩阵见 [references/docs-map.md](references/docs-map.md)。`SKILL.md` 只保留执行流程。

## Workflow

### 1. 先重建任务上下文

每次开始新 task，按顺序读取这些核心文档：
- `AGENTS.md`
- `docs/design.md`
- `docs/acceptance.md`
- `MVP_BACKLOG.md`
- `docs/agent-runbook.md`
- `docs/test-cases.md`

再按任务类型补读条件文档：
- 读取 `docs/progress.md`，确认当前状态，避免误把已关闭 task 当成待做任务。
- 在修改架构、持久化行为、编辑语义、文件读写流程等区域前，读取 `docs/decision-log.md`。
- 需要最近验证证据或命令格式时，读取 `docs/test-report.md`。
- 继续已有 task 或修改旧 task 时，读取 `reports/task-summaries/` 里对应的总结。
- 已经存在设计或实施计划时，读取 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 下的对应文档。
- 任务触达某个边界目录时，读取对应 README：`apps/desktop/README.md`、`packages/editor-core/README.md`、`packages/markdown-engine/README.md`、`tests/e2e/README.md`。

如果任务会影响用户可见行为、架构边界或测试策略，整个实现期间都保持相关文档在手边。

### 2. 默认以“完整完成一个 task”为目标

开始编码前，先回答这些问题：
- 这一轮要完整完成哪个单一 `TASK`？
- 这个 task 的目标、交付物、验收语句是什么？
- 本轮明确不做什么？
- 预计会改哪些文件、模块、层级？
- 哪些验证命令必须通过？
- 需要哪些人工验收步骤？
- 这个 task 是否触及 IME 稳定性、光标映射、undo/redo、autosave、Markdown round-trip 这些 P0 风险？

默认要求是单轮完成整个 task，不是默认只做一个 execution slice。

只有在以下情况下，才允许退回到“先拆任务再做”：
- backlog 里的 task 明显大到无法在一次安全变更中完成
- 单轮完成会导致跨越多个核心模块和多种行为变更
- 当前验收条件本身还不够清楚，无法判断 PASS / FAIL

遇到这种情况，不要直接默认只做一个切片；先回到 `MVP_BACKLOG.md`，把 task 拆成新的、更小的、可单轮完成的 task，然后再执行其中一个完整 task。

如果任务还没进 `MVP_BACKLOG.md`，先把它补进去或修正定义，不要新建平行计划文档。`MVP_BACKLOG.md` 是唯一有效执行计划。

需要重述任务时，用这个模板：

```md
Task: TASK-xxx
Goal: 这轮要完整交付什么
In scope: ...
Out of scope: ...
Primary files/modules: ...
Acceptance: 满足什么算 PASS
Verification: npm run lint, npm run typecheck, npm run build, ...
Manual acceptance: ...
Docs expected to update: ...
```

### 3. 在 Yulora 约束内实现

始终遵守这些项目约束：
- 一次只做一个 task。
- 保持 diff 聚焦且可回退。
- 不要改动无关文件。
- 优先小模块和显式接口。
- 未经明确批准，不要替换固定的 MVP 技术栈。
- 严格分离 `main`、`preload` 和 `renderer`。
- 不要向 `renderer` 暴露不受限制的 Node API。
- 把块级渲染视为视图层能力，而不是数据真相。
- 保存时不要自动重排整个 Markdown 文档。

把 backlog 条目当成这些信息的唯一来源：
- 依赖关系
- 目标文件和落点层级
- 交付物
- 验收语句
- 如果不得不拆分时的任务细化方式

### 4. 先验收，再声称完成

一个 Yulora task 只有在以下条件全部满足时，才算完成：
- `build` 通过
- `lint` 通过
- `typecheck` 通过
- 相关自动化测试通过
- task 专属验收语句通过
- 已写出简短任务总结

把 `docs/acceptance.md` 当作产品基线，把 `docs/test-cases.md` 当作回归覆盖来源。验收结论必须明确写成 PASS 或 FAIL，不要写模糊结论。

至少记录：
- 跑了哪些命令
- 是否通过
- 做了哪些人工检查
- 还存在哪些已知限制

### 5. 关闭 task 前更新项目记录

每次完成一个 task 后，至少更新：
- `docs/test-report.md`，写入最新验证证据
- `reports/task-summaries/`，写清本轮做了什么、哪些通过了、还剩什么

按需更新：
- `docs/decision-log.md`：这次决策会影响后续工作
- `docs/progress.md`：task 状态发生变化
- `docs/design.md`：架构基线或用户可见行为基线变了
- `docs/test-cases.md`：新增了需要明确记录的人工或回归场景
- `MVP_BACKLOG.md`：task 定义、依赖、验收或任务拆分发生了变化

## 收尾清单

- 读完必需文档和相关区域文档。
- 明确这轮要完整完成的单一 task。
- 重述 out-of-scope。
- 只在批准范围内实现。
- 跑完质量门禁和相关测试。
- 按 backlog 验收和产品验收基线评估 PASS / FAIL。
- 更新必须同步的项目文档。
- 只有完成以上动作，才能报告 task 完成。
