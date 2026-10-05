# RF-801 独立架构验收

日期：2026-10-05。审查对象：`codex/rf-801-workspace-store` 的 RF-801 冻结差异（主体基线 `f15bc8e`），以及受影响的 application、React 调用面、保存与编辑传输边界。使用 `fishmark-architecture-acceptance` 和 `fishmark-task-acceptance`；实现与验收由不同代理执行。

## Findings

未发现剩余阻断性结构问题。初审退回的两项 P1 已由实现代理修复：

- 外部冲突命令曾在排队后读取活动标签，可能把 A 的操作发给 B。入口现在捕获 `{tabId, epoch, loadRevision}`，队列内重验，过期静默 superseded。Node 回归覆盖 A→B、pending ack→flush→resolve、reload 的成功/错误/取消/传输失败释放及晚到结果。
- create/activate 曾在 drain 完成后的 continuation 中缺少销毁检查。现在在 barrier 后、IPC 返回后检查存活；测试使用真实 edit-client checkpoint，并在 lease release 边界注入 disposal，另测晚到 IPC 不替换投影。

## 五项退出条件

| 条件 | 审查依据 | 结果 |
| --- | --- | --- |
| 稳定投影订阅 | 复用 `WorkspaceRendererApplication.subscribe/getState`；乐观文本仅从既有 edit client 派生，view cache 保持引用，连续 frame 不依赖 dirty 翻转才通知 | PASS |
| 非 React 工作区命令 | open/save/save-as/autosave/reload/close/reorder/move/detach 在 application；scheduler 只拥有 timer/replay/origin | PASS |
| 单一 barrier 与通知映射 | 复用原 coordinator、edit client、pending queue 与 lease；错误/取消/通知映射离开 hooks；保留 canonical hydration、epoch rebind 与恢复机制 | PASS |
| 调用入口一致 | 菜单、快捷键、按钮调用 application command；drop 复用批次打开；test driver 保存使用相同 conflict-aware manual scheduler | PASS |
| 组件业务 bridge 收口 | settings、recent、clipboard、link 的业务操作由受限 gateway 承接；React 保留视图、只读 bootstrap、平台事件绑定和生命周期 | PASS |

application 生产模块没有 React、`editor/` 或 CodeMirror 实现反向依赖；editor port 与 load identity 为显式契约。没有新增 Markdown 可写真相、第二个 transport 队列或 mutation tail。退休 hooks 与旧 owner 文件已删除，CI 和 architecture guard 路径同步。RF-802 的组件拆分与 RF-803 的主进程拆分未强加到本轮。

## 验证与边界

独立新鲜证据详见 [测试报告](../../docs/test-report.md) 与 [任务总结](../task-summaries/RF-801.md)：focused 450/450、foundation 310/310、typecheck/lint/build、原 bundle 预算、正式行为 121/121 与 macOS 真实生产安全七项通过。完整回归使用原 wrapper 和官方 `VITEST_MAX_WORKERS=2`，216 文件/2884 项全部执行，2874 通过、10 条精确已知失败、0 新增/跳过/运行错误。两轮默认并发 FAIL 保留，不写成原始 suite 全绿。

图标系统字体扫描与 macOS 探针键码是同机干净基线也复现的独立前置问题，分别按受控产物哈希与原生事件证据修复，不修改产品样式、编辑语义、测试断言、watchdog 或 known-failure 基线。

## Open questions

无 RF-801 阻断性未决问题。主体提交后的 Node 22 默认并发远端 CI 由父代理继续核验；当前报告只确认本地冻结树。十条既有测试缺陷、正式行为的 99 个 known-defect 观测、全面 Windows/macOS IME、端到端延迟及 Electron 安全验收仍归 M9。安全探针出现与基线相同的 `MaxListenersExceededWarning`（11 个 destroyed listeners），记录为非阻断观察，不据此声称 M9 已完成。

## Result: PASS

RF-801 五项范围均达到；两项初审 P1 已有有效修复和回归，所需文档与本轮验证证据齐备。仅 RF-801 收口为 COMPLETE，M8 为 1/3。
