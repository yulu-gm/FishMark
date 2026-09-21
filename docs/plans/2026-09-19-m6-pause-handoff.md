# 2026-09-19 M6 暂停交接

> **状态更新（2026-09-20，本文以下内容为历史快照）**：暂停已解除，M6（RF-701 / RF-602 / RF-603 / RF-604）与 M6.5（外壳布局不变性 + VS Code 式侧栏 S1–S4）**已全部落地并通过父级最终验收**：`packages/editor-core/` 已删除、guard 7 包 / 13 规则 / `exceptions: []`（234/234）、全量 vitest 2788 passed / 1 skipped / 11 failed（失败集合与开工前逐条相同）、独占 oracle `unexpected=0 / known-defect=99 / not-run=0`、6 个 Electron 探针除 `editing-experience` 已知 5 条 bare-marker 族外全部 exit 0。**M6 / M6.5 已经 owner 明确认可全部验收（2026-09-20）并标记 `ACCEPTED` 收口**；按 owner 要求未提交未推送，改动全部留在工作区。最新状态与遗留项见 `docs/progress.md` 首节与文末"最终全量验收"、`docs/test-report.md`、`docs/plans/2026-09-19-rf-701-nested-rendering-handoff.md`。

用户因 token 不足明确要求迅速收工，当前停止推进，保留未提交改动。

已提交并推送 main：133679d（M5 生产语义切换与 IME/Unicode 修复）、6464487（文档格式）。父冻结代码验证：2671 passed / 1 skipped，lint/typecheck/build 通过；正式 Electron 121/121 场景、2541 targets、2434 exact + 107 unchanged known、0 unexpected/not-run；editing-experience 通过。包体积预算仍 FAIL，因此 M5 最终性能验收 pending。

M6 未完成。当前 RF701 工作区实现包括 canonical table inline/footnote 显示元数据、纯 markdown-presentation plan、真实列表/引用装饰接线和 canonical 行可见性查询。engine metadata 阶段父独立 600 次连续编辑差分通过；plan/架构首轮父 242 tests 通过。runtime 报告首消费切片原 273 编辑器合同与父新增 2 条混合叶/跨行 strong 合同通过。后续仍在改 active/table/derived 与 pure projection，不能将上述结果当作最终工作区全量验收。

恢复前先读取 git diff 及各 agent handoff，核实当前 typecheck。父最后发现待验证的嵌套渲染问题：逐行 clip inline ranges 可能丢零宽 image widget或重复跨行 replace；nested heading marker 隐藏/active处理可能缺失。已交 runtime，尚未验收。

后续止于 M6：完成 RF701，随后 RF602/603/604；清除 whole rich-document 生产派生与旧 physical/active 模型，完成装饰性能与异步 widget 边界，删除 editor-core及全部旧引用，重跑原 bundle预算和完整行为/build/lint/typecheck/tests。不得标 M6 完成，不扩展其他里程碑。

当前目录 D:/FishMark/FishMark；旧 .worktrees/editor-foundation-refactor 非最新实现。未提交 M6 代码应原地保留，勿以旧 worktree 覆盖。

恢复进展（2026-09-19 RF701 嵌套渲染切片）见 `docs/plans/2026-09-19-rf-701-nested-rendering-handoff.md`：工作区 typecheck 已恢复通过，逐行 clip 与嵌套 heading 问题已复现并修复，表格光标偏移空间 bug 已修；M6 仍未完成，冻结性能基线漂移与 engine 预存失败待父决定。
