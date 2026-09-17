# RF-HARDEN-001

日期：2026-09-17。结果：**PASS**。工作方式：一个工作 agent 实现，父 agent 独立复核实际 diff、复现审查断言并执行新鲜门禁。

## 完成内容

- 恢复业务在 workspace-application 编排：首次编辑先持久化会话基线，普通后续编辑追加日志并等待写入后 ACK；异步等待后复验发送方；写失败拒绝假确认；退出排空。修正 untitled 快照和压缩后的重放序号，识别损坏末尾并保留有效前缀。
- 增量解析不再拼接无法证明安全的旧窗口。普通单行纯文本段落输入/删除不调用完整 parser；结构变化和全局定义使用显式全文回退，正确更新链接/脚注及节点 data。解析统计报告真实全文调用和解析字符量。
- 桥接拒绝过期计划，多范围修改保持版本单调；同一 cache 复用派生快照。
- 路线以可维护/可扩展、编辑交互、性能为三项结果：RF-601 先验证事务/history/IME 和候选路径性能，再 RF-506；RF-701 在 RF-602/603/604 之前。复用已有 queue/client，不建立第二套状态。

## 父 agent 新鲜验证

| 验证 | 结果 |
| --- | --- |
| 独立审计 `vitest run packages/markdown-engine/src/cache/parent-audit.test.ts` | 19/19；原始 7 个断言及 12 组、360 次编辑差分。源码与 JSON 保存在 reviews；临时测试已移除 |
| `npm.cmd exec vitest -- run --maxWorkers=4 --reporter=json --outputFile=.artifacts/rf-harden-001/full-tests-final.json` | 195 文件，2,535 passed / 1 skipped，0 failed；包含生产恢复模块独立进程 ACK 后强杀、真实文件重放 |
| `npm.cmd run build` | PASS；renderer/Electron/CLI 及 workspace runtime verifiers；既有 chunk >500 kB 提示 |
| `npm.cmd run typecheck` | PASS |
| `npm.cmd run lint` | PASS，0 errors / 8 个既有 warnings |
| `npm.cmd run test:editor-behavior` | 121/121 cases，2,541 targets；79 verified-existing / 1,928 verified-runner / 534 known-defect，0 unexpected / 0 not-run |
| `npm.cmd run test:editing-experience` | pass: true，failures: [] |
| `git diff --check` | PASS |

初次沙箱内全量为 2,530 passed / 5 failed / 1 skipped，失败集中于测试工具进程树启动/清理；在沙箱外限制并发后全量通过。编辑体验探针初次因 Electron GPU/cache 权限无法加载，沙箱外复跑通过。没有修改测试预期或隐藏失败。正式 corpus 含 534 个既有 known-defect target，不能宣称产品零缺陷。

## 人工验收

以下为交付后的人工步骤，未冒充本轮已执行的真实桌面强杀/平台 IME 验证：

1. 使用独立测试 userData，新建文档输入并等待同步完成，结束该测试实例 main 进程；重启确认未保存正文恢复。打开文件保存、外部 reload 后再编辑，重复检查正文和保存点。
2. 连续输入中文，编辑列表/表格，撤销重做；编辑后立即关闭窗口，检查保存/取消与最终输入同步。本轮自动探针通过不代表 macOS/Windows 各真实 IME composition 已验收。
3. 在独立测试目录模拟恢复日志不可写，确认错误可见、内存正文可另存，不出现持久化成功假确认。

## 剩余范围

- 本次 PASS 只覆盖补充修复任务；历史进度仍 22/38，RF-506 尚未切换，新桥接还没有生产消费者。
- 全局定义/复杂 Markdown 仍显式全文回退；root fingerprint、索引、后方 offset 映射仍有全文工作。RF-601 前置 5k/20k、超长段落、文首修改及 input-to-paint p50/p95/p99，不能用零 parser 调用冒充 O(1) 或实时性能已达标。
- 恢复证明完成文件写后的进程崩溃场景；未提供 fsync/掉电保证。完整 Electron 关闭/恢复、跨平台输入与滚动锚定保留后续门禁。
- 新会话/非日志版本变化会快照 workspace；普通连续输入只追加。记录写失败后 fail-closed，用户需保存内存正文后重启。

验收结论：值得按修订路线继续推进；当前证据不足以称为已达成 SOTA 的实时编辑器。
