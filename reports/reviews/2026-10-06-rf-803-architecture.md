# RF-803 独立架构验收

日期：2026-10-06。审查对象：基线 `b1d4a805cf0d2cd6928144a9b6959f16781b0451` 至候选 `9f0fe2339056db7aa74be75da4942d2721231cd9`，冻结 tree `25c526fc52c849f054d01b131f5517e83c5512c6`。在 macOS arm64 的独立 detached worktree 中审查并运行原门禁；reviewer 未修改实现代码。

## Findings

未发现阻断性结构问题，P0 / P1 / P2 = 0。

## 五项退出条件

| 条件 | 核验依据 | 结果 |
| --- | --- | --- |
| 显式组装与唯一 owner | main 组合既有 workspace application、服务和生命周期；各 service registrar 拥有 transport mapping，没有新增业务状态、通用 router、service locator、Markdown mirror 或第二队列。 | PASS |
| main-owned 调用身份 | 每组 privileged handler 经 live BrowserWindow/WebContents、同一 sender、当前未 detached mainFrame、entry URL、runtime allowlist 检查；窗口 ready 后和有数据响应前重新检查。runtime/bridge policy 由 window manager 私有 WeakMap 持有。 | PASS |
| edit/flush 与关闭边界 | 原 `register-workspace-handlers.ts` 与基线字节一致；invocation-local frame 检查进入原 queued authorization，原 owner/CAS/lease、projection/ACK 保留。native-close completion 已授权后允许合法销毁 sender，排队 frame replacement 有真实 application 回归。 | PASS |
| product/test bridge 分离 | 原 product builder 不变；独立 test builder 仅在单个明确 main bridge argument 下暴露。非法/缺失/重复参数降为 product；packaged main 固定 editor；test handlers 仅 dev workbench 注册，completion 验证 session 的真实 webContents。 | PASS |
| 生命周期、文档与测试 | 只管理成功注册的 own channels，重复安装不覆盖外部 handler，dispose 幂等并阻止旧 callback；design/decision/test cases 与实际边界一致，真实 Mac 原始 safety 和 formal behavior 全部场景已有新鲜报告。 | PASS |

## 验证

[测试报告](../../docs/test-report.md) 与 [任务总结](../task-summaries/RF-803.md) 记录命令和证据。新鲜 typecheck/lint/build、69 files/1008 focused、6 files/310 foundation、原 bundle gate 均通过。默认完整回归 3110 passed + 10 exact known + 1 unexpected：原 100ms descendant PID 启动断言失败，未隐藏。官方 `VITEST_MAX_WORKERS=2` 完整入口执行全部 220 files/3121 cases：3111 passed + 10 exact known，0 unexpected/skipped/errors/unresolved baseline。

macOS 26.5.1 arm64 / Electron 41.2.0：workspace-safety 原七项全部 PASS；正式 behavior 原 121/121 cases、2541 targets、79 verified-existing、2363 verified-runner、99 known-defect、0 unexpected/not-run，24.600 秒。未加 no-sandbox 或修改产品安全配置、assertions、known-failure manifest、budgets、cases/oracles/timeout。

## Open questions

无 RF-803 阻断性结构问题。发布仍待父线程核验实时 main、正常推送和 CI；本地通过不代表远端已发布。默认并发的 100ms 启动竞态、十条已知测试失败、99 个行为 known-defect 继续保留。安全日志保留 `MaxListenersExceededWarning` 和保存返回阶段的 `Untrusted IPC sender` 拒绝：栈位于 handler await 后身份复核，原磁盘/关闭七项断言通过，不把它隐藏为无警告运行。M9 真实平台 IME、完整性能/E2E/CSP/resource-root/OS sandbox 验收未执行。

## Result: PASS

RF-803 本地独立架构与任务门禁满足，收口 COMPLETE；M8 为 3/3 COMPLETE，RF-901/M9 未开始。初次远端读取被权限拒绝后，按父线程要求未再执行远端操作；没有推送、PR 或远端分支。发布前新鲜度和最终提交 CI 由父线程处理。
