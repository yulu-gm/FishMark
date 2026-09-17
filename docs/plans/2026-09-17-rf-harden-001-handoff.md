# RF-HARDEN-001 execution handoff

日期：2026-09-17。实现者完成聚焦修复，最终 PASS/FAIL 由父 agent 独立验收；没有提交或推送。

## 实现

- `packages/workspace-application/src/recoverable-document-edits.ts`：在已有 tab lock 内串行基线、edit/append、最终 compact；metadata revision/savedRevision 检测非日志变更；落盘前不 ACK，落盘失败后拒绝 duplicate 假确认；异步等待后重校验 authorize。
- `apply-document-edits.ts`/`index.ts`：公开业务编排并传递二次授权回调。`src/main/main.ts` 组合该边界，恢复重放使用独立 client sequence，最终等待放在 will-quit，保留关闭确认和 flush 阶段。
- `recovery-journal.ts`/`recovery.ts`：末行撕裂保留有效前缀并显式报告 incompleteTail。`workspace-persistence.ts` 修正真实 untitled 快照合法的 null fileIdentity。
- `incremental-document-parser.ts`：删除隐藏全文解析和 checkpoint 全文扫描；可证明稳定的纯文本单段直接更新 inline，后方 inline/table 坐标映射；其余编辑显式 fallback。统计包含 actual fullParseCount、parsedSourceLength。差分现在比较 data 和全局索引且每步比较。
- `editor-model-bridge.ts`：拒绝 stale plan、多范围缓存 revision 单调；`editor-derived-snapshot.ts` 用 WeakMap 按不可变 cache 复用派生快照。
- 新增真实磁盘/故障测试 `src/main/infrastructure/recoverable-document-edits.test.ts` 与 `test-fixtures/recovery-crash-child.mjs`。子进程通过 Vite SSR 直接加载生产 TS 模块，完成首次新建编辑 ACK 后由父测试 SIGKILL，不运行 shutdown，再从真实文件恢复。

## 自检

```powershell
npm.cmd exec vitest -- run src/main/infrastructure/recoverable-document-edits.test.ts src/main/infrastructure/recovery-service.test.ts src/main/infrastructure/recovery-journal.test.ts src/main/infrastructure/workspace-persistence.test.ts packages/workspace-application/src/recovery.test.ts packages/workspace-application/src/apply-document-edits.test.ts packages/markdown-engine/src/cache/incremental-document-parser.test.ts packages/editor-core/src/commands/editor-model-bridge.test.ts packages/editor-model --reporter=dot
```

结果：20 文件，159/159 通过。包括 9 项新恢复边界测试及独立进程强杀；解析/桥接的持久化回归也通过。父 agent 的临时 `parent-audit.test.ts` 不归实现者管理。build/lint/typecheck 由父 agent 执行。

## 人工验收草稿

1. 干净 userData 新建文档编辑，等 edit ACK 后结束 main 进程，重启确认正文恢复。
2. 打开文件编辑、保存、外部 reload，再编辑，异常终止后确认正文及保存点正确。
3. 制造恢复目录不可写，确认编辑失败信息可见，本地内容仍保留，可手动保存；不得报告恢复已持久化。
4. 编辑后立即关闭窗口，走保存/取消确认，确认 renderer flush 不被提前关闭的恢复队列拒绝。

## 明确限制

- 无 fsync/目录同步，因此测试证明进程崩溃与完成 write 的恢复，不证明掉电安全。
- 含全局定义、复杂行内/块结构编辑使用显式 full fallback；仅纯文本单行段落（含中文普通正文）的常见输入/删除通过局部快路径。不是通用增量 parser 的最终完成。
- root fingerprint、索引和后方节点 offset 映射仍是全篇工作；真实 5k/20k 输入到绘制、长段落和内存预算仍须前置性能门禁。
- bridge 尚未切换生产消费者；完整平台 IME、history、所有入口和滚动锚定仍需 RF-601/RF-506 后续门禁。
- 新会话或非日志基线变化会快照全 workspace；普通连续输入只追加。恢复写故障会 fail-closed 阻止后续 ACK，用户应保存内存文档后重启。

路线/backlog/主进度/test-report 由父 agent 按三项产品目标统一更新；实现者没有改这些记录。
