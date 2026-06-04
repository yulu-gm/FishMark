# TASK-061 Blockquote Inner Blocks Intake

Task: TASK-061 引用块内部 block 渲染与结构空行

Goal: 让 blockquote 内部遵守和外部正文一致的 block 规则：引用块内部的段落、列表、代码块、数学公式、Mermaid 等 block 由结构性空行区分；在引用块内部按 Enter 默认创建结构性空行加新的引用内 block；在引用块内部空行再次 Enter 退出引用块；非激活态渲染时引用 rail / 背景连续，内部 block 仍按各自 Markdown 语义渲染。

## In Scope

- 在 `markdown-engine` 中为 blockquote 增加 parser-owned 内部 block / line metadata，保留原始绝对 offset，继续以 Markdown 文本为唯一事实来源。
- 支持引用内结构空行：`>` / `> ` 在已成立 blockquote 中表示引用内 block separator，不应裸露 marker，也不应把上下引用段拆成两个视觉块。
- 支持引用内 paragraph、list / task list、fenced code block、indented code block、block math、Mermaid fence 的非激活渲染复用外部规则。
- 调整 blockquote Enter 行为：
  - 非空引用内容行 Enter 创建引用内新 block，源码包含裸 `>` 结构性空行和新的 `> ` 编辑行。
  - 引用内空行再次 Enter 退出引用块，生成外部可编辑段落 surface。
- 保持 active 行完整源码可编辑，当前编辑行的 `>` 前缀不使用 active hidden marker。
- 保持 source mode gate：源码模式下禁用引用内所有 preview / hidden marker / widget。
- 补 parser、editor-core decoration、renderer DOM、Electron geometry / editing-experience probe 覆盖。

## Out Of Scope

- 不引入新的 Markdown 编辑器内核或替换 CodeMirror / micromark。
- 不在本轮实现 admonition / container 语法；TASK-047 仍单独负责提示容器。
- 不把表格作为首个强制交付项，除非实现过程中内部 block 模型已经自然覆盖且不扩大风险面。
- 不改变保存格式，不自动重排引用块内部 Markdown。
- 不改变 top-level block 的既有视觉设计，只让引用内 block 同构复用。

## Landing Area

- Parser / data model:
  - `packages/markdown-engine/src/block-map.ts`
  - `packages/markdown-engine/src/parse-markdown-document.ts`
  - `packages/markdown-engine/src/blockquote.ts`
  - `packages/markdown-engine/src/parse-block-map.test.ts`
  - `packages/markdown-engine/src/parse-markdown-document.test.ts`
- Decoration / commands / physical lines:
  - `packages/editor-core/src/decorations/block-decorations.ts`
  - `packages/editor-core/src/decorations/block-lines.ts`
  - `packages/editor-core/src/decorations/signature.ts`
  - `packages/editor-core/src/commands/blockquote-commands.ts`
  - `packages/editor-core/src/physical-editing-document.ts`
  - `packages/editor-core/src/line-visibility.ts`
- Renderer / probes / export:
  - `src/renderer/code-editor.test.ts`
  - `src/renderer/markdown-editing-experience-probe.ts`
  - `src/renderer/styles/markdown-render.css`
  - `src/renderer/export-html.ts`
  - `src/renderer/export-html.test.ts`

## Acceptance

- `> 第一段\n>\n> 第二段` 非激活态显示为一个连续引用块，中间 `>` marker 不可见，两个段落由引用内结构空行区分。
- `> - item\n> - item 2` 在引用块内渲染为列表；marker、缩进、软换行几何符合 `docs/standards/markdown-text-rendering-standard.json`。
- 引用内 fenced code block 和 block math / Mermaid fence 沿用现有 preview / fallback / source mode gate，不破坏 active 源码恢复。
- 引用块内正文行末 Enter 产生引用内新 block；引用内空行再次 Enter 退出引用块。
- 现有 top-level heading / paragraph / list / blockquote / code fence / math / Mermaid / table / source mode 回归不失败。
- HTML export 对引用内 block 使用 parser-owned metadata，不新增 renderer-only 正则解析。

## Verification

- `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/markdown-engine/src/parse-markdown-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/line-parsers.test.ts packages/editor-core/src/commands/semantic-edits.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`
- `npm.cmd run test -- src/renderer/app.autosave.test.ts -t "renders markdown lists and quotes"`
- `set FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=blockquote && npm.cmd run test:editing-experience`
- Add or extend a real Electron geometry probe for quote-internal list/code/math if jsdom cannot measure the relevant layout.
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`
- `git diff --check`

## Risks

- Parser risk: current blockquote model exposes line-level inline AST, not a recursive container block model. This task must avoid duplicating Markdown regexes in renderer or command code.
- Decoration risk: list/code/math widgets already have top-level assumptions; reusing them inside quote rows may need explicit depth / owner context rather than ad hoc class stacking.
- Enter / Backspace risk: touches P0 editing semantics, including IME, selection normalization, undo/redo, structural blank navigation, and active/source mode transitions.
- Geometry risk: quote rail / background should remain continuous while internal block geometry matches external rules; jsdom tests are not enough.
- Export risk: HTML export currently renders blockquote by line; recursive internal block export needs parser-owned metadata to avoid drift.

## Doc Updates

- `MVP_BACKLOG.md`: add TASK-061 definition and execution slices.
- `docs/progress.md`: add TASK-061 TODO row.
- On completion: update `docs/test-cases.md`, `docs/test-report.md`, `docs/decision-log.md`, and `reports/task-summaries/TASK-061.md`.

## Next Skill

$fishmark-task-execution
