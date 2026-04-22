# Yulora 测试报告

用于记录各任务的验证结果。

## 模板

| 日期 | 任务 | 命令 | 结果 | 备注 |
| --- | --- | --- | --- | --- |

## 记录

| 2026-04-22 | TASK-043 | `npm run test -- src/main/workspace-service.test.ts src/main/workspace-close-coordinator.test.ts src/main/save-markdown-file.test.ts src/main/application-menu.test.ts src/main/main.test.ts src/preload/preload.contract.test.ts src/preload/preload.test.ts src/renderer/document-state.test.ts src/renderer/editor-test-driver.test.ts src/renderer/app.autosave.test.ts src/renderer/test-workbench.test.tsx` | 通过 | 覆盖 workspace service、workspace close coordinator、tabId 维度保存链路、preload 合同、renderer 标签栏交互与 autosave / watcher 回归；当前 11 个文件、198 条测试通过。 |
| 2026-04-22 | TASK-043 | `npm run typecheck` | 通过 | renderer / electron / vitest / cli 四套 TypeScript 检查通过，workspace close coordinator、tabId 保存 / watcher bridge 与 renderer 关闭流程未破坏编译边界。 |
| 2026-04-22 | TASK-043 | `npm run lint` | 通过 | 标签页工作区完整四条执行切片相关改动通过 ESLint。 |
| 2026-04-22 | TASK-043 | `npm run build` | 通过 | renderer / electron / cli 构建通过；仍仅保留现有 Vite chunk size warning，不阻塞本轮 Task-043 验收。 |
| 2026-04-22 | TASK-036 | `npm run lint` | 通过 | 外部文件 watcher、preload bridge、renderer 冲突状态机与新增文档更新均通过 ESLint。 |
| 2026-04-22 | TASK-036 | `npm run typecheck` | 通过 | renderer、electron、vitest、cli 四套 TypeScript 检查全部通过，新增外部文件变更 contract 与 watcher service 未破坏编译边界。 |
| 2026-04-22 | TASK-036 | `npm run test` | 通过 | Vitest 全量通过，当前共 75 个文件、749 条测试通过，包含新增 document-state、main watcher、preload contract 与 renderer 冲突交互回归。 |
| 2026-04-22 | TASK-036 | `npm run build` | 通过 | renderer、electron 与 cli 构建通过；仍保留既有 Vite chunk size warning，但 exit code 为 0，不阻塞本轮交付。 |

| 2026-04-20 | TASK-012 | `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts` | 通过 | 覆盖 ordered list 的 `startOrdinal` / `delimiter` 保真、列表 item subtree 级插入/删除/缩进/反缩进/上下移动，以及 transaction 级 canonical normalization 与 renderer 交互回归。 |
| 2026-04-20 | TASK-012 | `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/list-edits.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts` | 通过 | 补充覆盖同层 mixed delimiter 断 scope、空白行断开的 ordered run 从 `1` 重启，以及文档级 normalization 会在真实编辑路径里把下半段 `3. 4.` 重写为 `1. 2.`。 |
| 2026-04-20 | TASK-012 | `npm run typecheck` | 通过 | `ListBlock`/`ListItemBlock` 结构升级、`list-edits` 语义编辑层、markdown extension transaction filter 与 renderer 测试辅助调整后，renderer / electron / vitest / cli 四套 TypeScript 检查继续通过。 |
| 2026-04-20 | TASK-012 | `npm run lint` | 通过 | 语义化列表编辑重构后未引入新的 ESLint 错误。 |
| 2026-04-20 | TASK-012 | `npm run build` | 通过 | renderer / electron / cli 构建通过；仍仅保留既有 Vite chunk size warning，不阻塞本轮交付。 |

| 2026-04-19 | TASK-table-rendering | `npx.cmd vitest run packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts` | 通过 | 覆盖从普通段落首次点击表格单元格后，active block 会切到 `table`，并且后续 `Ctrl/Cmd+Enter` 等表格快捷键可以立即生效。 |
| 2026-04-19 | TASK-table-rendering | `npm.cmd run typecheck` | 通过 | table widget 事件额外携带 `tableStartOffset` 后，renderer / electron / vitest / cli 四套 TypeScript 检查继续通过。 |

| 2026-04-19 | TASK-table-rendering | `npx.cmd vitest run src/renderer/app.autosave.test.ts` | 通过 | 覆盖默认主题 markdown stylesheet 已定义 `--yulora-table-*` token，以及基础 `markdown-render.css` 的 table widget 样式改为只消费这些主题变量。 |
| 2026-04-19 | TASK-table-rendering | `npm.cmd run lint` | 通过 | 无新增 lint error；仓库仍保留既有 3 条 `src/renderer/editor/App.tsx` 的 `react-hooks/exhaustive-deps` warning。 |
| 2026-04-19 | TASK-table-rendering | `npm.cmd run build` | 通过 | 默认主题与示例主题补齐表格 token 后，renderer / electron / cli 构建通过。 |

| 2026-04-19 | TASK-table-rendering | `npx.cmd vitest run packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/table-edits.test.ts packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts` | 通过 | 覆盖草稿 pipe header `Enter` 自动成表、table widget 鼠标点击输入、空白列 canonical delimiter 最小合法值，以及插入列后表格仍保持 widget 渲染。 |
| 2026-04-19 | TASK-table-rendering | `npm.cmd run typecheck` | 通过 | renderer / electron / vitest / cli 四套 TypeScript 检查通过。 |
| 2026-04-19 | TASK-table-rendering | `npm.cmd run build` | 通过 | renderer / electron / cli 构建通过。 |
| 2026-04-19 | TASK-table-rendering | `npm.cmd run lint` | 通过 | 无新增 lint error；仓库仍保留既有 3 条 `src/renderer/editor/App.tsx` 的 `react-hooks/exhaustive-deps` warning。 |

| 2026-04-19 | TASK-table-rendering | `npx.cmd vitest run packages/editor-core/src/extensions/markdown-shortcuts.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/commands/table-context.test.ts packages/editor-core/src/commands/table-edits.test.ts packages/editor-core/src/commands/table-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/editor/shortcut-hint-overlay.test.tsx src/renderer/app.autosave.test.ts` | 通过 | 覆盖 grouped shortcut catalog、table parse/format、table context/edit planners、table key routing、persistent table widget、renderer shortcut hint 上下文切换与 rail table mode。 |

| 2026-04-17 | TASK-038 | `npm run test -- src/main/package-scripts.test.ts` | 通过 | 先以失败测试锁定 `package:mac`、`tools/package-macos.sh` 与 mac 图标配置，再验证 mac 本地打包入口会先生成 icons，并指向 `build/icons/light/icon-512.png` 作为 `electron-builder` 的 icon 源。 |
| 2026-04-17 | TASK-038 | `npm run package:mac` | 通过 | 本地 macOS 打包成功，执行 `build` 与 `generate:icons` 后产出 `release/mac-arm64/Yulora.app`；当前仍提示 `package.json` 缺少 `author`，并在无开发者证书时回退到 ad-hoc 签名，但不阻塞 unpacked `.app` 生成。 |
| 2026-04-17 | TASK-038 | `npm run test -- src/main/package-scripts.test.ts` | 通过 | 先以失败测试锁定 macOS 缺少 Markdown 文稿关联声明，再验证 `electron-builder.json` 已补齐 `mac.category` 与 `.md` / `.markdown` 文件关联，供 Finder “打开方式” 识别 Yulora。 |
| 2026-04-18 | TASK-041 | `npx vitest run packages/editor-core/src/commands/semantic-context.test.ts packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-inline-commands.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts` | 通过 | 6 个测试文件、94 条测试通过，覆盖 SemanticContext reader、6 个 `compute*Toggle` 纯计算函数、`toggle-inline-commands`、`toggle-block-commands`、markdown 扩展 keymap 接入与 renderer 控制器 Mod-b 回归。 |
| 2026-04-18 | TASK-041 | `npm run typecheck` | 通过 | renderer / electron / vitest / cli 四套 TypeScript 检查通过，新增三层语义切换器命令导出与 keymap 接入未引入类型回归。 |
| 2026-04-18 | TASK-041 | `npm run build` | 通过 | renderer / electron / cli 构建均通过；仍仅保留既有 Vite chunk size warning。 |
| 2026-04-17 | TASK-038 | `npm run test -- src/main/package-scripts.test.ts` | 通过 | 验证所有现存 bat/sh 入口已集中到 `tools/` 目录，并补齐 `tools/release-win.bat` 与 `tools/release-macos.sh` 两个发布入口；仓库根目录旧入口已移除。 |
| 2026-04-17 | TASK-038 | `npm run lint && npm run typecheck && npm run build` | 通过 | bat/sh 工具迁移到 `tools/` 后，仓库级 lint、typecheck 与 build 继续通过；`build` 仍仅保留现有 Vite chunk size warning。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test -- src/renderer/code-editor.test.ts` | 通过 | 覆盖点击 Markdown / HTML 图片预览后，编辑器会聚焦并把光标直接跳回对应源码起点。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test` | 通过 | 图片预览点击回源码交互补齐后，Vitest 全量通过，当前共 51 个文件、349 条测试通过。 |
| 2026-04-17 | TASK-015 | `npm.cmd run typecheck && npm.cmd run build` | 通过 | 图片 widget 新增点击回源码行为后，TypeScript 与构建仍通过；`build` 仍仅保留既有 Vite chunk size warning。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts src/renderer/code-editor.test.ts` | 通过 | 覆盖 top-level `htmlFlow` 中的单行 `<img ... style="zoom:25%;">` 与包裹式 `<p><img width="160"></p>` 被识别为图片 block，并在编辑器中保持源码 + 预览共存。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/derived-state/inactive-block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts packages/editor-core/src/active-block.test.ts` | 通过 | 覆盖新增 `htmlImage` block 后，active-block 解析、decoration signature 与 active / inactive 图片预览管线未回归。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test` | 通过 | HTML `<img>` 图片渲染补齐后，Vitest 全量通过，当前共 51 个文件、347 条测试通过。 |
| 2026-04-17 | TASK-015 | `npm.cmd run lint && npm.cmd run typecheck && npm.cmd run build` | 通过 | `htmlImage` block、统一图片 widget 与 Typora 风格收敛后的样式调整均通过 lint / typecheck / build；`build` 仍仅保留既有 Vite chunk size warning。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test` | 通过 | 补修本地图片预览协议后，Vitest 全量通过，当前共 51 个文件、344 条测试通过；覆盖开发态 `http://localhost` 页面下的本地图片预览不再直接依赖 `file://`。 |
| 2026-04-17 | TASK-015 | `npm.cmd run lint && npm.cmd run typecheck && npm.cmd run build` | 通过 | 新增 `yulora-asset://` 预览协议、主进程资源 handler 与 renderer URL 解析调整后，lint / typecheck / build 全部通过；`build` 仍仅保留既有 Vite chunk size warning。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test -- src/main/clipboard-image-import.test.ts src/preload/preload.contract.test.ts src/renderer/code-editor.test.ts` | 通过 | 覆盖剪贴板图片导入成功、重名递增、未保存文档拒绝、非图片 / 超限错误，以及编辑器中的图片预览与图片粘贴拦截。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/derived-state/inactive-block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor-view.test.tsx src/renderer/app.autosave.test.ts src/renderer/test-workbench.test.tsx` | 通过 | 覆盖图片 widget 接入现有 inline / inactive decoration 管线后，editor-core 派生状态、CodeEditorView 句柄与 renderer 壳层测试桩均未回归。 |
| 2026-04-17 | TASK-015 | `npm.cmd run test` | 通过 | Vitest 全量通过，当前共 50 个文件、342 条测试通过，包含新增图片导入与常驻预览回归。 |
| 2026-04-17 | TASK-015 | `npm.cmd run lint` | 通过 | 图片导入 bridge、editor-core widget 与 renderer 粘贴拦截未引入 ESLint 错误。 |
| 2026-04-17 | TASK-015 | `npm.cmd run typecheck` | 通过 | renderer / electron / vitest / cli 四套 TypeScript 检查通过，新增图片导入 contract 与 decorations 导出边界正确。 |
| 2026-04-17 | TASK-015 | `npm.cmd run build` | 通过 | renderer、electron 与 cli 构建通过；仍保留现有 Vite chunk size warning，但 exit code 为 0，不阻塞本轮交付。 |
| 2026-04-17 | TASK-040 | `npm.cmd run test -- src/main/application-menu.test.ts src/main/save-markdown-file.test.ts src/preload/preload.contract.test.ts src/renderer/document-state.test.ts src/renderer/app.autosave.test.ts` | 通过 | 覆盖 `File > New` 菜单命令、untitled 文档状态、首次 `Save` 自动转到 `Save As`，以及 preload / save dialog 合同未回归。 |
| 2026-04-17 | TASK-040 | `npm.cmd run lint && npm.cmd run typecheck && npm.cmd run build` | 通过 | 原生菜单、受限 bridge、untitled 文档状态与保存链路调整均通过仓库级门禁；`build` 仍仅保留现有 Vite chunk size warning。 |
| 2026-04-17 | TASK-017 | `npm.cmd run test -- src/renderer/app.autosave.test.ts` | 通过 | 覆盖 `workspace-shell` 两列宽度过渡约束，确保 outline 开合时编辑区会跟着一起做 resize 动画，而不是只让右侧面板自身进出。 |
| 2026-04-17 | TASK-017 | `npm.cmd run test -- src/renderer/app.autosave.test.ts` | 通过 | 覆盖 outline 与 settings 抽屉在关闭时进入 `closing` 状态完成退出动效、outline 入口回弹，以及 settings header 降低透明度后的样式约束；目标测试当前 32 项全部通过。 |
| 2026-04-17 | TASK-017 | `npm.cmd run test -- src/renderer/app.autosave.test.ts` | 通过 | 覆盖右侧 outline 展开/收起箭头方向、固定 header + 独立滚动 body 结构，以及面板玻璃样式约束；目标测试当前 32 项全部通过。 |
| 2026-04-17 | TASK-017 | `npm.cmd run lint && npm.cmd run typecheck && npm.cmd run test && npm.cmd run build` | 通过 | 将大纲从左侧 rail 调整为右侧平级悬浮可折叠面板后，完整门禁重新通过；Vitest 更新为 49 个文件、329 条测试通过，构建仍仅有现有 Vite chunk size warning。 |
| 2026-04-17 | TASK-017 | `npm.cmd run lint && npm.cmd run typecheck && npm.cmd run test && npm.cmd run build` | 通过 | 在把大纲状态更新收敛为“内容变化才重建 outline、光标移动只更新当前 heading”后，重新复跑完整门禁；Vitest 维持 48 个文件、323 条测试通过，构建仍仅有现有 Vite chunk size warning。 |
| 2026-04-17 | TASK-017 | `npm.cmd run test -- src/renderer/outline.test.ts` | 通过 | 覆盖 heading 到 outline item 的提取、inline AST 文本拍平，以及多级标题的 label / depth / offset 输出。 |
| 2026-04-17 | TASK-017 | `npm.cmd run test -- src/renderer/code-editor-view.test.tsx` | 通过 | 覆盖 `CodeEditorView` 对 `navigateToOffset()` 的句柄透传，确保 rail 大纲点击可以真正驱动编辑器控制器。 |
| 2026-04-17 | TASK-017 | `npm.cmd run test -- src/renderer/code-editor.test.ts` | 通过 | 覆盖 `navigateToOffset()` 会更新编辑器选区并触发滚动定位，同时不破坏现有 CodeMirror 编辑回归。 |
| 2026-04-17 | TASK-017 | `npm.cmd run test -- src/renderer/app.autosave.test.ts` | 通过 | 覆盖左侧 rail 内的大纲渲染、点击跳转和独立滚动区样式约束，并确认 autosave / settings drawer 现有行为未回归。 |
| 2026-04-17 | TASK-017 | `npm.cmd run lint` | 通过 | outline model、rail UI、编辑器跳转接口与文档更新均通过 ESLint。 |
| 2026-04-17 | TASK-017 | `npm.cmd run typecheck` | 通过 | renderer、electron、vitest、cli 四套 TypeScript 检查全部通过，新增 outline / navigateToOffset 接口未破坏现有编译边界。 |
| 2026-04-17 | TASK-017 | `npm.cmd run test` | 通过 | Vitest 全量通过，当前共 48 个文件、323 条测试通过，包含新增 outline、rail UI 与编辑器跳转回归。 |
| 2026-04-17 | TASK-017 | `npm.cmd run build` | 通过 | renderer、electron 与 cli 构建通过；保留现有 Vite chunk size warning，但 exit code 为 0，不阻塞本轮大纲侧栏交付。 |
| 2026-04-16 | TASK-034 | `npm run test -- packages/markdown-engine/src/parse-inline-ast.test.ts packages/markdown-engine/src/parse-block-map.test.ts` | 通过 | 覆盖 inline AST parser、本地 `~~` extension、heading/list/blockquote 内容范围，以及 `parseMarkdownDocument()` 的 stitch 结果。 |
| 2026-04-16 | TASK-034 | `npm run test -- packages/editor-core/src/active-block.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/derived-state/inactive-block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts` | 通过 | 覆盖 MarkdownDocument cache、inline signature、AST-to-decoration flattening，以及 renderer 中 paragraph/heading/list/blockquote 的 inline rendering 与 composition flush 回归。 |
| 2026-04-16 | TASK-034 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | renderer 目标测试共 44 项通过，覆盖段落四类样式、`***both***`、`~~**mix**~~`、heading/list/blockquote 内 inline，以及回到 active block 后恢复 Markdown 源码。 |
| 2026-04-16 | TASK-034 | `npm run lint` | 通过 | 修正 `packages/markdown-engine/src/extensions/strikethrough.ts` 的 `no-explicit-any` 后，仓库级 ESLint 全量通过。 |
| 2026-04-16 | TASK-034 | `npm run typecheck` | 通过 | renderer、electron、vitest、cli 四套 TypeScript 检查全部通过，MarkdownDocument / inline AST / renderer 接线未破坏现有编译边界。 |
| 2026-04-16 | TASK-034 | `npm run test` | 通过 | Vitest 全量通过，当前共 39 个文件、243 条测试通过，包含新增 markdown-engine、editor-core 与 renderer 行内格式回归。 |
| 2026-04-16 | TASK-034 | `npm run build` | 通过 | renderer、electron 与 cli 构建通过；保留现有 Vite chunk size warning，但 exit code 为 0，不阻塞本轮交付。 |
| 2026-04-16 | TASK-039 | `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts` | 通过 | 先以失败测试锁定 `---` 与 `+++` 的 `thematicBreak` 输出，再验证 parser 已覆盖 CommonMark `---` 和 Yulora `+++` 分割线的 offset、line range 与 source order。 |
| 2026-04-16 | TASK-039 | `npm.cmd run test -- packages/editor-core/src/active-block.test.ts` | 通过 | 补充分割线 active-block 回归，确认光标落到 `---` 或 `+++` 上时会回到源码态，而不是停留在渲染横线。 |
| 2026-04-16 | TASK-039 | `npm.cmd run test -- src/renderer/code-editor.test.ts` | 通过 | 覆盖分割线非激活态横线渲染、激活恢复 Markdown 源码与 CRLF 文档替换边界，并确认既有块级渲染回归全部保持通过。 |
| 2026-04-16 | TASK-039 | `npm.cmd run lint` | 通过 | `thematicBreak` 类型、parser 扩展、CodeMirror decoration、样式与文档更新均通过 ESLint。 |
| 2026-04-16 | TASK-039 | `npm.cmd run typecheck` | 通过 | renderer、electron、vitest、cli 四套 TypeScript 检查全部通过，新增 `thematicBreak` union 未破坏现有编译边界。 |
| 2026-04-16 | TASK-039 | `npm.cmd run test` | 通过 | Vitest 全量通过，当前共 32 个文件、189 条测试通过，包含新增分割线 parser、active-block 与 editor rendering 回归。 |
| 2026-04-16 | TASK-039 | `npm.cmd run build` | 通过 | renderer、electron 与 cli 构建通过；保留现有 Vite chunk size warning，但不阻塞本轮分割线渲染交付。 |
| 2026-04-16 | TASK-039 | `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts src/renderer/code-editor.test.ts` | 通过 | bugfix 回归：覆盖 `+++` 在前后不留空行、直接贴正文时仍会被拆成 top-level `thematicBreak`，并在 renderer 中显示为横线而不是原始 `+++` 文本。 |
| 2026-04-16 | TASK-039 | `npm.cmd run lint && npm.cmd run typecheck && npm.cmd run test && npm.cmd run build` | 通过 | 分割线 bugfix 合入前复跑全套门禁；当前全量 Vitest 为 32 个文件、191 条测试通过。 |
| 2026-04-16 | TASK-038 | `npm run test -- src/main/package-scripts.test.ts` | 通过 | 先以失败测试锁定 `package-win.bat` 与 `package-macos.sh` 两个仓库根目录打包入口，再验证 Windows 入口调用 `npm.cmd run package:win`、macOS 入口保留清晰的预留提示。 |
| 2026-04-16 | TASK-038 | `cmd /c package-win.bat` | 通过 | Windows 批处理入口已能从仓库根目录完成完整打包，最终产出 `release/Yulora-Setup-0.1.0.exe`。 |
| 2026-04-16 | TASK-038 | `npm run test -- src/main/package-scripts.test.ts src/main/after-pack-win-icon.test.ts` | 通过 | 先以失败测试锁定 `afterPack` hook 配置与 `signAndEditExecutable: false` workaround，再验证独立 hook 能在当前 Windows 环境下调用 `rcedit` 补写 `Yulora.exe` 图标。 |
| 2026-04-16 | TASK-038 | `npm run package:win` | 通过 | 当前保持 `win.signAndEditExecutable: false`，并通过 `afterPack` hook 单独补写 `release/win-unpacked/Yulora.exe` 图标；规避了 `electron-builder` 内置 `winCodeSign` 资源包在本机因符号链接权限导致的解压失败。 |
| 2026-04-16 | TASK-038 | `npm run test -- src/main/package-scripts.test.ts src/main/generate-icons.test.ts` | 通过 | 先以失败测试锁定 `generate:icons` 入口、`win.icon` 配置，以及脚本对 `light` / `dark` 两套 PNG 与 `icon.ico` 的真实生成行为，再验证目标测试 10 项全部通过。 |
| 2026-04-16 | TASK-038 | `npm run lint` | 通过 | 新增 `scripts/generate-icons.mjs`、打包配置与文档更新均通过 ESLint。 |
| 2026-04-16 | TASK-038 | `npm run typecheck` | 通过 | renderer、electron、vitest、cli 四套 TypeScript 检查保持通过；本轮新增脚本未破坏现有编译边界。 |
| 2026-04-16 | TASK-038 | `npm run test` | 通过 | Vitest 全量通过，当前共 31 个文件、181 条测试通过，包含新增图标生成回归测试。 |
| 2026-04-16 | TASK-038 | `npm run build` | 通过 | renderer、electron 与 cli 构建通过；保留现有 Vite chunk size warning，但不阻塞本轮图标流水线交付。 |
| 2026-04-16 | TASK-038 | `npm run package:win` | 通过 | 本地 Windows 打包成功，打包前已自动生成 `build/icons/light` 与 `build/icons/dark`，并产出 `release/Yulora-Setup-0.1.0.exe`；`package.json` 仍缺少 `author` 字段，只产生 warning，不阻塞安装器生成。 |
| 2026-04-16 | TASK-033 | `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts` | 通过 | 先补 fenced code block 与 info string 解析的失败测试，再验证 parser 输出已覆盖 source order、exact slice 与 round-trip 关键边界。 |
| 2026-04-16 | TASK-033 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 覆盖代码块非激活态渲染、激活恢复 Markdown 源码态，并确认既有 heading / paragraph / list / blockquote 回归测试全部保持通过。 |
| 2026-04-16 | TASK-033 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 补充 closing fence 点击边界与 fence marker 隐藏回归，避免在已渲染代码块底部点击时只漏出孤立的 ``` 而上方内容仍保持渲染态。 |
| 2026-04-16 | TASK-033 | `npm run lint` | 通过 | fenced code block parser、CodeMirror decoration 与样式、文档更新均通过 ESLint。 |
| 2026-04-16 | TASK-033 | `npm run typecheck` | 通过 | renderer、electron、vitest、cli 四套 TypeScript 检查均通过，并覆盖了新增的 markdown-engine 代码。 |
| 2026-04-16 | TASK-033 | `npm run test` | 通过 | Vitest 全量通过，包含新增 fenced code block parser 与 editor rendering 回归覆盖。 |
| 2026-04-16 | TASK-033 | `npm run build` | 通过 | renderer、electron 与 cli 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本轮代码块渲染交付。 |
| 2026-04-16 | TASK-013 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 先补引用块非激活态装饰、激活恢复源码态、`Enter` 续写/退出与 composition flush 回归测试，再验证 `code-editor` 目标测试 26 项全部通过。 |
| 2026-04-16 | TASK-013 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 新增真实 CRLF 文档回归测试，确认 `replaceDocument()` 后 heading / blockquote / list decorations 在 `MVP_BACKLOG.md` 这类 Windows 文档中不会错位；目标测试更新为 27 项全部通过。 |
| 2026-04-16 | TASK-013 | `npm run lint` | 通过 | blockquote decoration 逻辑、样式与新增测试均通过 ESLint。 |
| 2026-04-16 | TASK-013 | `npm run typecheck` | 通过 | renderer、electron、vitest、cli 四套 TypeScript 检查全部通过。 |
| 2026-04-16 | TASK-013 | `npm run test` | 通过 | Vitest 报告 29 个文件、161 条测试全部通过，包含新增 blockquote rendering、blockquote Enter 与 CRLF 文档回归 coverage。 |
| 2026-04-16 | TASK-013 | `npm run build` | 通过 | renderer、electron 与 cli 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本轮引用块交付。 |
| 2026-04-16 | TASK-038 | `npm run test -- src/main/package-scripts.test.ts` | 通过 | 覆盖 `package:win` 入口、`electron-builder.json` 配置、`release/` 忽略规则，以及 `win.signAndEditExecutable: false` 的环境兼容约束。 |
| 2026-04-16 | TASK-038 | `npm run lint` | 通过 | 打包脚本、builder 配置和文档更新未引入 lint 错误。 |
| 2026-04-16 | TASK-038 | `npm run typecheck` | 通过 | 现有 Electron / renderer / vitest / cli TypeScript 检查保持通过。 |
| 2026-04-16 | TASK-038 | `npm run test` | 通过 | Vitest 全量测试通过，包含新增打包配置回归测试；当前共 29 个文件、158 条测试通过。 |
| 2026-04-16 | TASK-038 | `npm run build` | 通过 | 现有构建链路保持通过，确认 `package:win` 依赖的基础构建未回归；保留 Vite 默认的大 bundle warning，但不阻塞本轮交付。 |
| 2026-04-16 | TASK-038 | `npm run package:win` | 通过 | 本地 Windows 打包成功，`release/Yulora-Setup-0.1.0.exe` 已生成；当前仍使用默认 Electron 图标，`package.json` 缺少 author 只产生 warning，不阻塞安装器产出。 |
| 2026-04-15 | TASK-012 | `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts` | 通过 | 覆盖列表项 metadata、任务列表勾选标记、嵌套列表缩进与 list/blockquotes 边界。 |
| 2026-04-15 | TASK-012 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 覆盖非激活态列表 / 任务列表渲染、ordered marker 样式、Enter 续项、空项退出与既有 heading/paragraph/IME 回归。 |
| 2026-04-15 | TASK-012 | `npm run test -- src/renderer/editor-test-driver.test.ts` | 通过 | 覆盖 editor test driver 对 `set-editor-selection` 与 `press-editor-enter` 两个最小命令的支持。 |
| 2026-04-15 | TASK-012 | `npm run test -- packages/test-harness/src/handlers/electron.test.ts packages/test-harness/src/registry.test.ts` | 通过 | 确认 `list-enter-behavior-basic` scenario 已注册，并正确映射到 fixture 打开、光标设置、Enter 与内容断言命令。 |
| 2026-04-15 | TASK-012 | `npm run lint` | 通过 | 列表 metadata、CodeMirror Enter 命令、editor test driver 与 harness scenario 相关改动均通过 ESLint。 |
| 2026-04-15 | TASK-012 | `npm run typecheck` | 通过 | renderer、electron、vitest、cli 四套 TypeScript 检查全部通过。 |
| 2026-04-15 | TASK-012 | `npm run test` | 通过 | Vitest 报告 29 个文件、152 条测试全部通过，包含新增 parser、renderer、driver 与 harness scenario coverage。 |
| 2026-04-15 | TASK-012 | `npm run build` | 通过 | renderer、electron 与 cli 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本轮交付。 |
| 2026-04-15 | TASK-035 | `manual: npm run dev` | 通过 | 验收复核：用户已在真实桌面壳中完成中文 IME 人工验收，确认段落、标题、列表输入不丢字、不跳光标，且 autosave 后光标不再跳到文首。 |
| 2026-04-15 | TASK-035 | `npm run lint` | 通过 | 验收复核：ESLint 全量检查通过。 |
| 2026-04-15 | TASK-035 | `npm run typecheck` | 通过 | 验收复核：renderer、electron、vitest 三套 TypeScript 检查全部通过。 |
| 2026-04-15 | TASK-035 | `npm run test` | 通过 | 验收复核：Vitest 报告 15 个文件、79 条测试全部通过，包含新增 `code-editor-view` 回归测试。 |
| 2026-04-15 | TASK-035 | `npm run build` | 通过 | 验收复核：renderer 与 electron 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本任务验收。 |
| 2026-04-15 | TASK-035 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 先以失败测试锁定 composition 期间“文档可更新、派生状态不提前广播”的 guard 语义，再验证段落、标题、列表三类回归场景全部通过。 |
| 2026-04-15 | TASK-035 | `npm run test -- src/renderer/app.autosave.test.ts` | 通过 | 确认 composition guard 未破坏现有 `onChange` / `onBlur` 驱动的 autosave 行为。 |
| 2026-04-15 | TASK-035 | `npm run test -- src/renderer/code-editor-view.test.tsx src/renderer/app.autosave.test.ts src/renderer/code-editor.test.ts` | 通过 | 修复 autosave 成功后因 `CodeEditorView` 在同一 `loadRevision` 下错误调用 `replaceDocument()` 导致光标跳到文首的问题，并确认 editor reload、autosave、IME guard 三条路径未回归。 |
| 2026-04-15 | TASK-035 | `npm run lint` | 通过 | renderer controller 与新增 IME 回归测试通过 ESLint 检查。 |
| 2026-04-15 | TASK-035 | `npm run typecheck` | 通过 | composition guard、新增测试 helper 与 controller 生命周期调整通过 TypeScript 检查。 |
| 2026-04-15 | TASK-035 | `npm run test` | 通过 | Vitest 报告 14 个文件、77 条测试全部通过，包含新增 IME composition regression coverage。 |
| 2026-04-15 | TASK-035 | `npm run build` | 通过 | renderer 与 electron 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本轮 IME 基线保护交付。 |
| 2026-04-15 | TASK-009 | `npm run test -- packages/editor-core/src/active-block.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts` | 通过 | 覆盖 active block 纯解析、块尾换行/空白区边界、CodeMirror 选择变化通知，以及 autosave 与新增 editor prop surface 的非回归。 |
| 2026-04-15 | TASK-009 | `npm run lint` | 通过 | `packages/editor-core` 新增 active-block 逻辑、renderer controller 桥接与文档更新均通过 ESLint。 |
| 2026-04-15 | TASK-009 | `npm run typecheck` | 通过 | `tsconfig.renderer.json` 已纳入 `packages/**/*.ts`，renderer 对 `editor-core` / `markdown-engine` 的依赖通过 TypeScript 检查。 |
| 2026-04-15 | TASK-009 | `npm run test` | 通过 | Vitest 报告 10 个文件、46 条测试全部通过；当前 Windows 环境下全量 `test` 仍需提权以绕过 `spawn EPERM`。 |
| 2026-04-15 | TASK-009 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；保留 Vite 默认的大 bundle warning，但未阻塞本轮 active-block 交付。 |
| 2026-04-15 | TASK-025 | `npm run test -- src/main/runtime-windows.test.ts src/main/package-scripts.test.ts src/renderer/test-workbench.test.tsx src/renderer/app.autosave.test.ts` | 通过 | 覆盖测试模式启动脚本、主窗口/工作台窗口分流、preload 单文件 bridge 约束、workbench 页壳，以及 workbench 拉起 editor 测试窗口的最小链路，同时确认 autosave 现有行为未回归。 |
| 2026-04-15 | TASK-025 | `npm run lint` | 通过 | main/preload/renderer 新增测试模式分支、workbench UI 和新增测试文件均通过 ESLint 检查。 |
| 2026-04-15 | TASK-025 | `npm run typecheck` | 通过 | Electron 窗口管理、preload runtime bridge、renderer 新接口与测试桩的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-025 | `npm run test` | 通过 | Vitest 报告 11 个文件、53 条测试全部通过，包括新增 runtime-windows、preload 单文件 bridge 约束与 renderer workbench 测试。 |
| 2026-04-15 | TASK-025 | `npm run build` | 通过 | renderer 构建与 electron TypeScript 构建完成通过。 |
| 2026-04-15 | TASK-025 | `npm run test -- src/main/runtime-windows.test.ts src/main/package-scripts.test.ts src/renderer/test-workbench.test.tsx src/renderer/app.autosave.test.ts` | 通过 | 验收复核：Vitest 报告 4 个文件、18 条测试全部通过；当前 Windows 沙箱会在加载 Vite/Vitest 配置时触发 `spawn EPERM`，本轮使用提权环境完成重跑。 |
| 2026-04-15 | TASK-025 | `npm run lint` | 通过 | 验收复核：ESLint 全量检查通过。 |
| 2026-04-15 | TASK-025 | `npm run typecheck` | 通过 | 验收复核：renderer、electron、vitest 三套 TypeScript 检查全部通过。 |
| 2026-04-15 | TASK-025 | `npm run build` | 通过 | 验收复核：renderer 与 electron 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本任务验收。 |
| 2026-04-15 | TASK-028 | `npm run test -- packages/test-harness/src/runner.test.ts src/renderer/test-workbench.test.tsx` | 通过 | 覆盖 workbench 的 idle / running / failed / interrupted debug 状态，以及 runner 事件流与步骤结果在 renderer 中的折叠展示；当前 Windows 沙箱中需提权绕过 `spawn EPERM`。 |
| 2026-04-15 | TASK-028 | `npm run lint` | 通过 | 新增 workbench 运行状态模型、受控场景目录与 debug 面板样式均通过 ESLint。 |
| 2026-04-15 | TASK-028 | `npm run typecheck` | 通过 | renderer 中新增的 runner 事件折叠、步骤状态展示和中断控制通过 TypeScript 检查。 |
| 2026-04-15 | TASK-028 | `npm run build` | 通过 | renderer 构建与 electron TypeScript 构建通过；保留 Vite 默认的大 bundle warning，但不阻塞本轮交付。 |
| 2026-04-15 | TASK-008 | `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts` | 通过 | 覆盖顶层 `heading` / `paragraph` / `list` / `blockquote` 顺序、heading depth、有序/无序列表、空输入，以及 list / blockquote 内部 paragraph 不泄漏为顶层 block。 |
| 2026-04-15 | TASK-008 | `npm run lint` | 通过 | `packages/markdown-engine` 的新增 parser、类型定义与 Vitest 配置调整均通过 ESLint 检查。 |
| 2026-04-15 | TASK-008 | `npm run typecheck` | 通过 | `tsconfig.vitest.json` 已纳入 `packages/**/*.ts`，新增 Markdown engine 源码和测试均通过 TypeScript 检查。 |
| 2026-04-15 | TASK-008 | `npm run test` | 通过 | Vitest 报告 9 个文件、41 条测试全部通过，包括新增 block-map parser 测试。 |
| 2026-04-15 | TASK-008 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；当前 Windows 环境下全量 `test` / `build` 仍需提权以绕过 `spawn EPERM`。 |
| 2026-04-15 | TASK-005 | `npm run test -- src/renderer/document-state.test.ts src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts` | 通过 | 覆盖 manual-saving / autosaving 状态迁移、编辑器 blur 事件、idle autosave、blur autosave、手动保存优先级，以及 in-flight autosave 后的单次 replay autosave。 |
| 2026-04-15 | TASK-005 | `npm run lint` | 通过 | autosave 调度、CodeMirror blur 透传与新增测试文件均通过 ESLint 检查。 |
| 2026-04-15 | TASK-005 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查通过，并补齐了 vitest JSX/test types 配置。 |
| 2026-04-15 | TASK-005 | `npm run test` | 通过 | Vitest 报告 8 个文件、37 条测试全部通过，包括新增 autosave orchestration 测试。 |
| 2026-04-15 | TASK-005 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；当前 autosave 实现未引入构建期错误。 |
| 2026-04-15 | TASK-032 | `npm run test -- src/main/application-menu.test.ts src/main/save-markdown-file.test.ts src/renderer/code-editor.test.ts src/renderer/document-state.test.ts` | 通过 | 覆盖 File 菜单命令分发，并确认菜单接入后现有保存链路、CodeMirror 控制器和文档状态测试仍全部通过。 |
| 2026-04-15 | TASK-032 | `npm run lint` | 通过 | 原生菜单、preload 订阅接口和 renderer 壳层样式调整未引入 lint 错误。 |
| 2026-04-15 | TASK-032 | `npm run typecheck` | 通过 | Electron 菜单、共享菜单命令类型与 preload/renderer 新接口的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-032 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；在当前 Windows 环境下需提权以绕过 `rimraf` / Vite / Vitest 的 `EPERM` 限制。 |
| 2026-04-15 | TASK-007 | `npm run test -- src/renderer/document-state.test.ts src/renderer/code-editor.test.ts` | 通过 | 覆盖 CodeMirror controller、renderer 持久化快照、dirty 状态与 Save / Save As 兼容路径。 |
| 2026-04-15 | TASK-007 | `npm run lint` | 通过 | CodeMirror controller、CodeEditorView 与 renderer shell 调整未引入 lint 错误。 |
| 2026-04-15 | TASK-007 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过，并补齐了 Vitest 的 DOM 编译上下文。 |
| 2026-04-15 | TASK-007 | `npm run test` | 通过 | Vitest 报告 6 个文件、27 条测试通过，包括新增 CodeMirror controller 测试。 |
| 2026-04-15 | TASK-007 | `npm run build` | 通过 | renderer 与 electron 构建完成通过；在当前 Windows 环境下需提权以绕过 `rimraf` / Vite 的 `EPERM` 限制。 |
| 2026-04-15 | TASK-004 | `npm run test -- src/main/save-markdown-file.test.ts src/renderer/document-state.test.ts src/main/package-scripts.test.ts` | 通过 | 覆盖保存成功、保存失败、另存为取消、另存为成功、dirty 状态和开发启动脚本依赖。 |
| 2026-04-15 | TASK-004 | `npm run lint` | 通过 | Save / Save As bridge、主进程写入链路与 renderer 状态更新未引入 lint 错误。 |
| 2026-04-15 | TASK-004 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-004 | `npm run test` | 通过 | Vitest 报告 5 个文件、26 条测试通过，包括新增保存链路测试。 |
| 2026-04-15 | TASK-004 | `npm run build` | 通过 | renderer 构建与 electron TypeScript 构建完成通过；在当前 Windows 环境下需提权以绕过 `rimraf` 清理阶段的 `EPERM`。 |
| 2026-04-15 | TASK-002 | `npm run lint` | 通过 | 现有应用壳和文档调整未引入 lint 错误。 |
| 2026-04-15 | TASK-002 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-002 | `npm run test` | 通过 | Vitest 报告现有测试全部通过。 |
| 2026-04-15 | TASK-002 | `npm run build` | 通过 | renderer 构建和 electron TypeScript 构建完成通过。 |
| 2026-04-15 | TASK-003 | `npm run lint` | 通过 | 安全 bridge、打开文件流程与 renderer 文档状态相关代码未引入 lint 错误。 |
| 2026-04-15 | TASK-003 | `npm run typecheck` | 通过 | `src/main`、`src/preload`、`src/renderer` 与共享打开文件类型的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-003 | `npm run test` | 通过 | Vitest 报告 `src/main/open-markdown-file.test.ts`、`src/renderer/document-state.test.ts` 在内的现有测试全部通过。 |
| 2026-04-15 | TASK-003 | `npm run build` | 通过 | renderer 构建与 electron TypeScript 构建完成通过，当前打开文件闭环可继续作为后续保存与编辑器接入基础。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `npm run lint` | 通过 | ESLint 无错误。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `npm run test` | 通过 | Vitest 报告 1 个文件、2 条测试通过。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `npm run build` | 通过 | renderer 构建和 electron TypeScript 构建完成通过。 |
| 2026-04-15 | BOOTSTRAP-DOCS | `test -f docs/design.md && test -f docs/acceptance.md && test -f docs/test-cases.md && test -f docs/progress.md && test -f docs/decision-log.md && test -f docs/test-report.md && rg -n "^\| (BOOTSTRAP-DOCS|TASK-001|TASK-002|TASK-003|TASK-004|TASK-005|TASK-006|TASK-007|TASK-008|TASK-009|TASK-010|TASK-011|TASK-012|TASK-013|TASK-014|TASK-015|TASK-016|TASK-017|TASK-018|TASK-019|TASK-020|TASK-021|TASK-022|TASK-023|TASK-024) \|" docs/progress.md` | 通过 | 已确认 `docs/` 中的必需文件存在，且 `docs/progress.md` 包含 `BOOTSTRAP-DOCS` 与 `TASK-001` 到 `TASK-024`。 |
| 2026-04-15 | TASK-010 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 先补了 heading inactive/active 切换与 composition flush 回归测试，再实现标题 decoration；当前 worktree 内该目标测试共 10 项全部通过。 |
| 2026-04-15 | TASK-010 | 人工验收（`npm run dev`，worktree: `D:\MyAgent\Yulora\Yulora\.worktrees\task-010-heading-rendering`） | 通过 | 用户已确认标题 `#` 弱化、激活回源码态和基础交互通过人工验收。仓库级 `lint` / `typecheck` / 全量 `test` / `build` 尚未在本轮执行。 |
| 2026-04-15 | TASK-011 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 补了 inactive paragraph 切换、heading/paragraph decoration 共存和 composition flush 回归测试；当前 worktree 内该目标测试共 14 项全部通过。 |
| 2026-04-15 | TASK-011 | 人工验收（`npm run dev`，worktree: `D:\MyAgent\Yulora\Yulora\.worktrees\task-010-heading-rendering`） | 通过 | 用户已确认段落轻量渲染、激活回源码态、与标题 decoration 共存以及基础交互通过人工验收。仓库级 `lint` / `typecheck` / 全量 `test` / `build` 待本轮补跑。 |
| 2026-04-15 | TASK-010 + TASK-011 | `npm run lint` | 通过 | 合并前门禁通过，无 lint 错误。 |
| 2026-04-15 | TASK-010 + TASK-011 | `npm run typecheck` | 通过 | 合并前门禁通过，renderer / electron / vitest TypeScript 检查全部通过。 |
| 2026-04-15 | TASK-010 + TASK-011 | `npm run test` | 通过 | 合并前门禁通过，15 个测试文件、89 个测试全部通过。 |
| 2026-04-15 | TASK-010 + TASK-011 | `npm run build` | 通过 | 合并前门禁通过；Vite 仅报告产物 chunk 较大 warning，不阻塞构建。 |
| 2026-04-15 | TASK-001 | `npm run lint` | 通过 | 修正 Electron 入口和开发脚本后，无 lint 错误。 |
| 2026-04-15 | TASK-001 | `npm run typecheck` | 通过 | renderer、electron、vitest 的 TypeScript 检查完成通过。 |
| 2026-04-15 | TASK-001 | `npm run test` | 通过 | Vitest 报告 1 个文件、2 条测试通过。 |
| 2026-04-15 | TASK-001 | `npm run build` | 通过 | renderer 构建和 electron TypeScript 构建完成通过。 |
| 2026-04-15 | TASK-001 | `node -e "const {spawn,spawnSync}=require('child_process'); const child=spawn('npm',['run','dev'],{stdio:'inherit'}); let ready=false; const deadline=Date.now()+20000; const timer=setInterval(()=>{ const curl=spawnSync('curl',['-I','-sSf','http://localhost:5173/'],{encoding:'utf8'}); const ps=spawnSync('ps',['-ax','-o','command='],{encoding:'utf8'}); const electronRunning=/Electron\\.app\\/Contents\\/MacOS\\/Electron/.test(ps.stdout); if(curl.status===0 && electronRunning){ ready=true; console.log('DEV-SHELL-READY'); clearInterval(timer); child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),2000); } else if(Date.now()>deadline){ console.error('DEV-SHELL-TIMEOUT'); clearInterval(timer); child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'),2000); process.exit(1); } },500); child.on('exit',(code,signal)=>{ clearInterval(timer); if(ready){ process.exit(0); } process.exit(code ?? (signal ? 1 : 0)); });"` | 通过 | Vite 成功提供 `http://localhost:5173/`，`curl` 可访问，同步观察到了运行中的 Electron 进程，随后正常退出。 |
| 2026-04-16 | TASK-033 | `npm run test -- src/renderer/code-editor.test.ts` | 通过 | 新增 fenced code block 下边界 Backspace 回归测试，覆盖“先整体回到源码态，再继续编辑”与第二次 Backspace 不进入半渲染状态。 |
| 2026-04-16 | TASK-033 | `npm run lint` | 通过 | `code-editor` 新增 Backspace 边界处理与文档更新通过 ESLint 检查。 |
| 2026-04-16 | TASK-033 | `npm run typecheck` | 通过 | CodeMirror Backspace handler、controller 暴露方法与回归测试通过 TypeScript 检查。 |
| 2026-04-16 | TASK-033 | `npm run test` | 通过 | Vitest 报告 30 个文件、179 条测试全部通过，包含 fenced code block Enter / 点击边界 / Backspace 边界回归。 |
| 2026-04-16 | TASK-033 | `npm run build` | 通过 | renderer 与 electron 构建通过；保留现有 Vite chunk size warning，但不阻塞本轮交付。 |
| 2026-04-16 | TASK-039 | `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts src/renderer/code-editor.test.ts packages/editor-core/src/active-block.test.ts` | 通过 | 覆盖紧贴正文的 `+++` 分割线、下方输入单个 `-` 不应让上方分割线失效，以及 active-block 仍能正确命中 top-level 分割线。 |
| 2026-04-16 | TASK-039 | `npm run lint && npm run typecheck && npm run test && npm run build` | 通过 | 修复 `+++` 与 setext heading 竞争导致的回归后，完整门禁重新通过；保留现有 Vite chunk size warning，但不阻塞本轮交付。 |
