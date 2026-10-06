# RF-802 独立架构验收

日期：2026-10-06。审查对象：基线 `1d33e6a60200fe2018bb30d81aa68c72c7129fd6` 至本地冻结 `e20af0ea3eaa7bc66a508dfba1b293d1d527148e`，含 React presentation 拆分与获准的 Linux CI test-only launcher 修复。独立 reviewer 未修改实现代码。

## Findings

未发现阻断性结构问题，P0 / P1 / P2 = 0。

## 五项退出条件

| 条件 | 核验依据 | 结果 |
| --- | --- | --- |
| App composition 与唯一 owner | `App` 保留 bootstrap/平台事件，`useWorkspaceController` 仍是唯一 `useSyncExternalStore` 入口。RF-801 application、edit client、queue/barrier/save policy 不变；新组件不订阅 workspace，不创建 store/coordinator/Markdown mirror。 | PASS |
| 直接消费命名组件 | `WorkspaceShell` 直接消费 tab/status/conflict/outline/find/settings/notification/table/welcome 组件；复用已有 `TitlebarHost`。叶子接受显式 view props 与命令回调，未新增 facade 或 service locator。 | PASS |
| 层级与生命周期 | CodeEditor 保留原挂载位置且无新增 key；settings、theme、shortcut、test bridge 保留 lazy 边界。Search/resize 随 shell 常驻，settings draft 仍归 SettingsView；输入 focus、epoch/loadRevision reset、退出动画、pointerup commit 与 timer cleanup 有回归。 | PASS |
| 业务命令与呈现错误分离 | save/open/reload/close 等继续委托 RF-801；focus/theme/drag hooks 只拥有 presentation 状态。顶层错误边界只显示终止式 fallback、清理子树，不 retry/reset/save。 | PASS |
| 投影测试与安全边界 | 新增交互、StrictMode 与 error cleanup 测试；原 markup/classes/a11y/CSS 和 main/preload/product sandbox 配置不改。CI-only no-sandbox 需 Linux、CI=true、显式 opt-in 三条件，默认与产品启动不受影响。 | PASS |

## 验证

独立新鲜证据见 [测试报告](../../docs/test-report.md) 和 [任务总结](../task-summaries/RF-802.md)。本地 launcher/cleanup 13、shell/application+launcher 471、foundation 310，以及 typecheck/lint/build、原 bundle 通过。完整原回归在本地官方双 worker 模式执行 217 files / 2901 tests，2891 passed + 10 exact known，0 unexpected/skips/errors；两次默认并发的既有 100ms 子进程启动断言失败如实保留。

[CI 37393076342](https://github.com/yulu-gm/FishMark/actions/runs/37393076342) 三个 job 全部成功。远端候选 `44e5767d5af534ea6e9ae7e5db520b87154ea630` 与实际 checkout synthetic merge `dc90fa53f82c6ec675eda3b2a88f5ae5187cead6` 的 tree 均为 `29fcb6e50ffe73834e9f2c6ea61c52d5b1a85e63`，与本地冻结树一致。独立读取实际 job logs 与原始 artifacts：默认完整回归 2891 + 10 exact known，Quality 699 tests，Linux safety 七项，正式行为 121/121 cases、2541 targets、0 unexpected/not-run，原 bundle 1428000/1430000 B 全部 PASS。

首次 CI 在 manifest 前因 setuid-helper 配置终止，未生成 JSON；没有将它当作行为结果。用户随后批准 test-only launch opt-in；不修改系统 helper 权限，也不放宽 cases/oracles、180 秒 hard limit 或预算。

## Open questions

无 RF-802 阻断性未决问题。M9 的真实 macOS/Windows IME、完整 E2E、延迟及 OS sandbox/security 验收未完成；Linux CI no-sandbox 行为证据不能替代安全验收。十条既有测试缺陷、99 个行为 known-defect 观测与本地并发子进程启动时序风险保留。bundle 仅余 2000 B total-JS gzip 余量。

## Result: PASS

RF-802 五项退出条件、所需文档与本轮精确树验证齐备。仅 RF-802 收口 COMPLETE，M8 为 2/3；RF-803 与 M9 尚未开始。发布前仍需核验最终文档提交的 CI。
