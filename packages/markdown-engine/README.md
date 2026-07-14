# Markdown 引擎包

`@fishmark/markdown-engine` 是当前唯一 public entry，落点为 `src/index.ts`。Markdown 文本仍是唯一事实来源；本包负责 parser-owned block/inline/document 结构、source range 与 round-trip 辅助语义，renderer 和 editor-core 只消费公开结果。

当前 document parse lifecycle：

- `parseMarkdownDocument`：公开的 rich full-document entry，当前提供 document blocks、inline AST 和引用块 `innerBlocks` 等派生结构；保留到 `RF-405` hard cutover。
- `parseBlockMap`：公开的 lean/legacy full-document entry；`parseTopLevelBlocks` 是同模块 internal export。二者保留到 `RF-405`，不能在更早任务中改名、复制或静默删除。
- `parseInlineAst` 是 inline-range parser，不是第二个 full-document truth。
- 当前直接调用 micromark document parse 的模块只有 `parse-markdown-document.ts` 与 `parse-block-map.ts`，并由 architecture guard 注册；新增调用点或 public parse entry 必须先进入同一 lifecycle manifest。site scanner 会沿 ES/import-equals namespace、literal `require` / awaited dynamic import 的 namespace 或 destructured/renamed `parse` binding，以及 direct module-expression `.parse()` 识别 `.document()`；这些形态不能绕过同一注册表。

包边界禁止 React、Electron、CodeMirror、`@fishmark/editor-core`、`src/main`、`src/preload` 和 `src/renderer`。跨 package consumer 必须通过 `@fishmark/markdown-engine`，不得导入 `packages/markdown-engine/src/**`。

architecture scanner 对 static import、re-export、literal dynamic import、TypeScript import-equals、import type 与 literal `require` 使用同一 forbidden/public-entry policy。无 type checker 时 shadowed literal `require` 也按保守依赖证据处理；注释、普通字符串和非 literal `require` 不会伪报。新增语法入口不能绕开 public package entry。

计划中的 recursive node model、physical-line/prefix index、incremental structure cache 与 parser hard cutover 属于 `RF-401` 到 `RF-405`，当前尚未实现。现有引用块 `innerBlocks` 也不是最终通用 recursive container tree。
