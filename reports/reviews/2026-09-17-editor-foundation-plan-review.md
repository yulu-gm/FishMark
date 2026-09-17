# 编辑器基础重构计划复审

日期：2026-09-17。审查分支：`codex/editor-foundation-refactor`，实现基准：`1b4c329a5e12b606b99b3584b4df287711972243`。

审查对象是当前 worktree 的路线、任务证据、恢复接线、递归解析与增量缓存、语义 planner 和 CodeMirror 桥接边界。不是根目录旧计划，也不是全仓所有功能的最终验收。本轮没有修改产品实现或既定任务状态。

## Findings

### F1 [P0] 恢复日志缺少新会话的可重放基线

边界：`src/main/main.ts:408–430, 449–473, 1358–1360`，`packages/workspace-application/src/recovery.ts`。

当前生产接线在成功编辑后仅异步记录 `{tabId, baseRevision, changes, ...}`。全仓调用检查显示，恢复快照只在 `before-quit` 中 compact。首次运行或上次快照之后新建/打开的标签，其基础文本和会话信息没有随这些编辑写入恢复日志。启动恢复先查找 `getTabSession(batch.tabId)`，不存在就被 catch 跳过。

因此，首次运行、新建文档、输入、在正常退出前进程崩溃，是一条无法依靠现有 edit-only 日志恢复文档的路径。即使 append 已完成，基础会话仍然缺失。另有两个缺口：记录失败被吞掉，ACK 不等待日志写入；退出 compact 没有阻止退出或等待完成。这里不能兑现路线的“已确认未保存内容可以恢复”承诺。

证据强度：生产接线静态确认；本轮恢复 service 的 3 个既有测试通过，其中明确允许 `snapshot: null` 加 edit batch，但没有覆盖重建实际 workspace。未执行真实 Electron 强杀恢复实验，不声称已测得具体丢失窗口。

计划影响：RF-303 应进入重新验收/修复队列，优先于 RF-506。持久化 session 创建/初始文本基线，明确 applied/持久化确认的关系，串行化日志与 snapshot compact，保留可重放的有效前缀，处理落盘错误与有界退出等待。把 RF-902 中“干净 userData → 新建/打开 → 编辑 → 杀进程 → 重启恢复”提前作为该修复的退出门禁。磁盘完整性、进程崩溃和掉电保证应分别定义。

### F2 [P1] 增量窗口只由旧树决定，编辑后边界改变会产生错误树

边界：`packages/markdown-engine/src/cache/invalidation-range.ts:42–58`，`incremental-document-parser.ts:62–88`。

实现选取旧文本上的安全位置后直接局部解析和拼接，没有按新解析状态向前扩展到重新稳定。删除分隔空行会合并相邻段落，新增未闭合围栏会改变后续文档所属结构，旧边界不能作为新边界的证明。

本轮两个差分复现均失败：

- `alpha\n\nbeta\n\ngamma\n` 删除 `[6,7)`：完整解析将 alpha/beta 合成一个段落，增量结果仍保留两个。
- 同一文档在 offset 6 插入三个反引号和换行：完整解析的代码块延伸至 EOF，增量结果仍把后续 beta/gamma 留作段落。

计划影响：RF-404 的“与 fresh parse 一致”验收结论需要复核。先补编辑后边界稳定检查与保守扩大窗口，再进行多步差分；不能把这些错误缓存接入正式命令路径。差分要覆盖每一步，包含分隔行、围栏、列表松紧、引用 lazy continuation、CRLF、全局定义与混合容器。

### F3 [P1] 全局引用定义更新没有同步到缓存树和前方消费者

边界：`packages/markdown-engine/src/cache/incremental-document-parser.ts:56–57, 61, 108–110`。

函数计算了新定义，却把旧的 `cache.tree.referenceDefinitions` / `footnoteDefinitions` 写回结果树；窗口之前的节点原样复用，也没有按定义反向依赖失效。

本轮复现：`[x][ref]\n\n[ref]: /old\n\nafter\n` 将 `[17,21)` 替换成 `/new`。增量结果中的引用索引及前方链接仍是 `/old`，完整解析为 `/new`。差分失败。

计划影响：与 RF-404 修复一起交付定义索引更新和双向位置的消费者失效；差分比较必须包含全局索引和节点 data，而不能只比节点种类、区间和 inline。现有差分 snapshot 未比较全局索引或节点 data。

### F4 [P1] 当前增量路径仍完整解析，现有性能门禁没有覆盖新路径

边界：`incremental-document-parser.ts:56–57, 75`，`parse-markdown-document.ts:43–47`，`src/renderer/performance/editor-foundation-performance-report.ts:34–40, 69–80`。

`collectReferenceDefinitions(newSource)` 本身完整扫描；`collectFootnoteDefinitions(newSource)` 又调用 `parseFullDocumentTree(newSource)`。本轮 spy 证明，一次普通插入确实把整篇新文本传入 full parser。该调用不被 `fallbackReason` 标识为全文兜底，因此 `fallbackReason === null` 和 `reparsedNodes` 小不能证明局部计算。

此外，checkpoint 收集每次遍历全文，后方子树逐个重建并重新解析段落/标题 inline，树索引也重建。`readEditorSemanticContext()` 每次通过 `createEditorDerivedSnapshotFromCache()` 重新建立全文 physical document，未复用文档版本下的派生快照。

现有 `perf:baseline` 仍测旧 editor-core 基线；报告类型和输出明确写着增量能力 `available: false`。它作为旧基线有效，但不能作为 RF-404 新实现通过性能验收的证据。

计划影响：在 RF-506 前接入真实新缓存/桥接性能探针，记录所有全文扫描、实际解析字节/区间、节点重建、physical snapshot 重建和延迟分布。先去除隐式整篇解析，再优化变更映射与派生快照共享。RF-901 保留最终聚合门禁，但新路径的门禁必须提前。5k/20k 只按行数不足，应加入超长段落、大表格、文首修改、长未闭合围栏等 fixture，并测按键到绘制、掉帧和内存；本轮未测这些端到端指标。

### F5 [P1] CodeMirror 桥接尚未满足版本与事务边界，不能直接切换

边界：`packages/editor-core/src/commands/editor-model-bridge.ts:44–59, 99–100`，`packages/markdown-engine/src/cache/document-structure-cache.ts:12–17`。

`applyEditorPlan` 没有使用已有 `assertPlanAppliesToRevision`，直接 dispatch。多范围事务重新 `createDocumentStructureCache`，把 revision 重置为 1。两个问题都在本轮测试复现：旧计划仍调用 dispatch；连续编辑至 revision 3 后，多范围修改回到 1。既有测试甚至断言重建后等于 1。

桥接默认把所有计划标成 `input.type`，没有证明导航、结构编辑、undo 分组和 composition 安全。“一个 dispatch”本身不能证明“一个独立 undo 步骤”。本轮没有运行真实 IME，不把这部分标为已复现 bug。

范围说明：该桥接尚未接入正式编辑器扩展；这些是 RF-506 的切换前阻断项，不应宣称当前旧运行时已经因此损坏输入。

计划影响：把 RF-601 的版本校验、事务映射、history、IME 保护提前作为 RF-506 前置。明确 session/epoch、main 已确认 revision、editor 乐观版本的关系；不能让 cache 自增计数冒充全局会话版本。多范围更新/全量兜底也必须单调推进本地版本。复用 `src/renderer/application/pending-edit-queue.ts`，不另外创建一套队列真相。

### F6 [P1] 112 个主检查点回放不足以承担正式引擎切换验收

边界：`docs/refactor/editor-foundation/roadmap.md:1369–1406`，增量差分与 bridge 现有测试。

文档准确限定了 112/112 是 `checkpoints[0]` 的 source/selection 回放，不能扩展成完整的 CodeMirror runtime 等价证据。当前桥接未接入产品，现有测试全绿与新缓存/桥接缺陷同时成立。本轮既有聚焦测试 173/173 通过，追加 7 个审查断言却有 6 个失败，直接说明原证据遗漏了关键边界。

计划影响：RF-506 验收要使用接入新引擎的真实 CodeMirror/Electron 路径，执行全部检查点、连续编辑、撤销/重做、组合输入、表格 focus、菜单/快捷键/工具栏/测试驱动器入口，并证明执行的是新消费者。把发现的问题作为明确缺陷，禁止将当前错误转成“预期行为”。原始 corpus 中已知缺陷应与目标行为分开汇报。

### F7 [P2] 计划顺序、重复建设和状态记录需要同步

- RF-602 要消费共享 render plan，但该 plan 到 RF-701 才创建。应提前 RF-701 的最小共享契约与生产实现，再做依赖它的装饰迁移。
- RF-601 计划新建 queue，RF-801 计划创建 client/store，而 M1/M2 已有实际业务编排和队列。应先列出现有 owner/迁移目标，后续任务只迁移、收口和删除，避免新增第二套。
- “只构建视口装饰”须分为布局关键装饰与视口表现内容。CodeMirror 要求改变垂直布局的装饰直接提供；间接视口装饰不能新增块 widget 或跨换行替换。RF-602 应增加布局、高度测量和滚动锚定契约。[官方约束](https://codemirror.net/examples/decoration/)
- `progress.md` 顶部日期为 8 月 14 日，但基准提交是 9 月 17 日；RF-505 行仍 PLANNED，后文记 COMPLETE；active handoff 仍在 RF-202，摘要却已 22/38。历史通过记录应保留，但新增复审结论应能阻止代理继续按旧前置条件切换。

## 已确认有价值的进展

- M1/M2 已有 workspace domain/application、持久化 TextBuffer、带版本的编辑协议、owner 校验及 renderer 队列。无需推翻为另一套文档所有权架构。
- `document-session.ts:291–293` 在文本回到已保存内容时修正保存版本。此前基于旧计划的 dirty 问题不再作为当前 finding；相关既有测试本轮通过。
- 递归完整 parser 已落地，rich document 成为树的投影；纯 planner 已覆盖大量结构行为。完整解析器的价值与增量缓存缺陷应分开判断。
- 保留 Markdown 源码事实、Electron/React/TypeScript/CodeMirror/micromark 技术栈、纯命令边界及阶段性删除目标。没有证据支持现在推倒重写或更换核心框架。

## 建议的计划调整

以下是审查建议，未自动修改路线或任务状态，也不把历史完成数擅自改成另一个百分比。

| 顺序 | 调整 | 必须交付的退出证据 |
| --- | --- | --- |
| 1 | 复核 RF-303/304 恢复与关闭接线，提前 RF-902 的最小恢复 E2E | 新会话有可重放基线；真实强杀后恢复未保存内容；日志失败可见；compact/追加/退出顺序明确 |
| 2 | 重开 RF-404 的正确性与 RF-501 派生快照前置验收 | 本轮 3 个解析反例通过；多步差分涵盖节点 data、全局定义、区间与嵌套 |
| 3 | 先落实 RF-601 中桥接必需能力，并前置 RF-901 新路径探针 | 拒绝过期计划；版本不重置；快照复用；undo/IME/多范围编辑及真实扫描计数有证据 |
| 4 | 再执行 RF-506 切换 | 所有入口真实消费新引擎；完整运行时行为与性能门禁通过；删除旧语义命令及对应重复模型 |
| 5 | 提前 RF-701，再做 RF-602/603/604 | 一个共享语义 render plan；符合 CodeMirror 布局约束；重 widget 按需加载；滚动/光标/IME稳定 |
| 6 | RF-702/703 和 M8 按现有 owner 收口 | 导出/大纲/统计复用派生输入；已有 client/queue/workflow 迁移而非重建 |
| 7 | M9/M10 最终全量门禁与清理 | 5k/20k及对抗 fixture，真实跨进程 E2E、安全、双平台人工 IME、文档一致性与删除证据 |

一次仍只执行一个任务。前置切片的测试和实现必须保留到生产路径；阶段性适配器应有明确删除点。RF-506 不应以“删除约 8.2k 行”为主要成功指标，必须先证明运行时行为正确。

## Open questions

- 冷/热打开、普通/结构输入到绘制的 p95/p99、长任务和内存尚无本轮真实 Electron 测量；不能声称达到 SOTA 性能。
- 进程崩溃/日志落盘/掉电的恢复保证需要产品契约和真实故障注入验证。静态缺口已经足以阻断当前恢复完成声明。
- Windows/macOS 的真实中文 IME、软换行视觉上下移动和异步 widget 高度变化仍需各平台证据。

## Result: FAIL

当前路线不宜按既有“前置任务已完成”直接推进 RF-506。继续投入这条架构方向是合理的，但应先修复数据恢复、增量正确性和桥接事务边界，再以真实路径证据完成切换。本结论针对当前计划的执行准备度，不是宣告整个项目或技术栈失败。

## 本轮验证

命令（在审查 worktree）：

```powershell
npm.cmd exec vitest -- run packages/markdown-engine/src/cache/review-audit.test.ts packages/markdown-engine/src/cache/incremental-document-parser.test.ts packages/editor-model packages/editor-core/src/commands/editor-model-bridge.test.ts packages/workspace-domain/src/document-session.test.ts src/main/infrastructure/recovery-service.test.ts --reporter=json --outputFile=reports/reviews/2026-09-17-foundation-audit-results.json
```

结果：180 项，174 通过、6 失败。既有测试 173/173 通过；审查增加的 7 项中 1 通过、6 失败。原始 JSON 与本报告同目录。表格前插入对照场景通过，不能据此推断全部 table metadata 映射正确。

本轮为审查，没有修改产品实现，因此未运行全量 build/lint/typecheck，也没有声称重新完成任何 task acceptance。审查测试在取证后从 packages 移除，下面保存原始源文件，便于在同一位置重新运行；它不是已修复的回归测试。正式修复应将对应场景并入其所属生产测试套件。

## 审查测试源文件

原位置：`packages/markdown-engine/src/cache/review-audit.test.ts`。

```typescript
import { it, expect, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { applyEditorPlan, editorStructureCacheField, readEditorStructureCache } from "../../../editor-core/src/commands/editor-model-bridge";
import * as fullParser from "../parse/full-document-parser";
import { createDocumentStructureCache } from "./document-structure-cache";
import { applyIncrementalEdit } from "./incremental-document-parser";
import { parseFullDocumentTree } from "../parse/full-document-parser";
import { flattenMarkdownTree } from "../model/document-tree";

const cases = [
  { name: "join paragraphs by deleting separator", source: "alpha\n\nbeta\n\ngamma\n", from: 6, to: 7, insert: "" },
  { name: "insert unclosed fence at separator", source: "alpha\n\nbeta\n\ngamma\n", from: 6, to: 6, insert: "```\n" },
  { name: "change reference destination", source: "[x][ref]\n\n[ref]: /old\n\nafter\n", from: 17, to: 21, insert: "/new" },
  { name: "insert before table", source: "alpha\n\n| a | b |\n| --- | --- |\n| c | d |\n\nafter\n", from: 2, to: 2, insert: "XYZ" }
];
for (const c of cases) it(c.name, () => {
  const result = applyIncrementalEdit(createDocumentStructureCache(c.source), { fromOffset: c.from, toOffset: c.to, insertedText: c.insert });
  const fresh = parseFullDocumentTree(result.cache.source);
  const snap = (tree: typeof fresh) => ({ nodes: flattenMarkdownTree(tree), references: [...tree.referenceDefinitions], footnotes: [...tree.footnoteDefinitions] });
  expect(snap(result.cache.tree)).toEqual(snap(fresh));
});

it("rejects an old plan before dispatch", () => {
  const state = EditorState.create({ doc: "abc", extensions: [editorStructureCacheField] });
  const newer = state.update({ changes: { from: 0, insert: "X" } }).state;
  const dispatch = vi.fn();
  const view = { state: newer, dispatch } as unknown as Parameters<typeof applyEditorPlan>[0];
  try {
    applyEditorPlan(view, { revision: 1, commandId: "insert-text", edits: [{ from: 1, to: 1, insert: "!" }], selection: { anchor: 2, head: 2 }, intent: "edit" });
  } catch { /* Rejection is acceptable; dispatch is not. */ }
  expect(dispatch).not.toHaveBeenCalled();
});

it("keeps cache revision monotonic across multi-range transactions", () => {
  let state = EditorState.create({ doc: "abcdef", extensions: [editorStructureCacheField] });
  state = state.update({ changes: { from: 6, insert: "!" } }).state;
  state = state.update({ changes: { from: 7, insert: "?" } }).state;
  const before = readEditorStructureCache(state).revision;
  state = state.update({ changes: [{ from: 0, to: 1, insert: "X" }, { from: 3, to: 4, insert: "Y" }] }).state;
  expect(readEditorStructureCache(state).revision).toBeGreaterThan(before);
});

it("measures full-parser calls inside an ordinary incremental edit", () => {
  const source = "alpha\n\nbeta\n\ngamma\n";
  const cache = createDocumentStructureCache(source);
  const spy = vi.spyOn(fullParser, "parseFullDocumentTree");
  try {
    const result = applyIncrementalEdit(cache, { fromOffset: 2, toOffset: 2, insertedText: "X" });
    console.info("REVIEW_FULL_PARSE_CALLS", JSON.stringify({ sourceLength: result.cache.source.length, parsedLengths: spy.mock.calls.map(call => call[0].length), stats: result.stats }));
    expect(spy.mock.calls.some(call => call[0] === result.cache.source)).toBe(false);
  } finally { spy.mockRestore(); }
});
```
