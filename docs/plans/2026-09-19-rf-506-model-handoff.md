# RF-506 模型与解析执行交接

日期：2026-09-19。实现已落地，最终验收由父 agent 执行。未提交或推送。

## 本轮范围

- `markdown-engine/parse/list-frames.ts` 在原始解析帧物化之前复用 parser-owned `readListScopes`，让两空格有序列表、引用列表、继续行的拥有关系进入 canonical tree。空引用子列表不会再误作为 setext 标题。围栏等不透明叶不参与列表标记识别；含不同容器前缀栈的复杂子容器保留 micromark 结构，覆盖不了完整源码范围时保留原帧，不丢内容。
- 列表帧物化使用排序叶范围的二分定位，不为每个条目遍历全文叶节点。不透明块范围使用单调游标。没有引入第二次 Markdown 解析。
- `enter.ts` 从 canonical item ownership 规划整棵子树升级、正文与相邻列表分隔、空项退出及草案提交。删除 `planScopedListItemEnter` 的命令层正则列表重发现。保留有序裸标记的 scope 边界，避免隔空恢复旧编号分支。
- `backspace.ts` 按可见空段边界删除，保留中间有序项退化的真实生产行为；引用内部间隔删除保留正确光标；从围栏或表格下方回到内容是 selection-only。
- `table.ts` 增加水平/垂直边界导航与 `planTableBackspaceFromBelow`，表格草案通过格式化器返回的偏移进入首个正文单元格，不重解析生成文本。新列默认左对齐。
- `formatting.ts` 修复空强/斜体对反向切换、多行块级选区、缩进段落添加项目符号、紧凑嵌套引用退出一级后的空格。
- `navigation.ts` 的模型 fallback 保留交替可见空段及空白行，不跳过所有空行。运行时实际视觉几何由 runtime agent 适配。

## 接口与协作

新增公开纯计划：`planTableMoveHorizontal`、`planTableMoveVertical`、`planTableBackspaceFromBelow`。无 DOM、CodeMirror 或 renderer 依赖。

`physical-editing-document.ts` 及其测试由 m6_audit agent 完成索引优化、EOF 空末行和引用围栏关闭行修复；本实现依赖其真实物理行边界。`ordered-list.ts` 及旧 helper 的合同迁移由同一 agent 负责。`parse-markdown-document.ts` 的既有投影后处理提取由 runtime agent 负责，避免缓存消费者遗漏脚注后处理。

## 验证证据

开发基线：`packages/editor-model` + `packages/markdown-engine` 为 237/237。

绑定判据使用永久新路径 `src/renderer/code-editor.test.ts`，没有恢复旧命令兜底或降低生产断言。原始 35 项真实运行时差异在模型与 runtime 修复后全部清零。

`npm.cmd exec vitest -- run packages/editor-model packages/markdown-engine src/renderer/code-editor-command-contract.test.ts src/renderer/code-editor.test.ts --reporter=json --outputFile=.artifacts/rf506-model-verified.json`

曾以新鲜 **656/656** 通过（含生产 273 + 父 agent 新迁移生产合同 27），之后父/其他 agent 仍在共享工作区接入新缓存投影与 frame 测试；因此以父 agent 最后的全仓门禁为最终证据，不能把中途数字当整轮完成。

新增解析测试覆盖两种引用前缀下的两空格有序 scope/继续行、空引用子项/setext 边界、紧凑及 loose 围栏中的伪列表。新增模型测试覆盖 subtree promotion、草案表格定位、有序 marker 退化与空 marker 删除、围栏/表格 selection-only 返回。已有两处测试原本显式记录错误现状，现按生产 corpus 合同更新；不是把失败降为已知偏差。

父 agent 的独立连续 600 次随机编辑 differential 曾在本轮 canonical 修改后通过；建议完成其它共享修改后重跑。

目标 ESLint 仅剩迁移合同 `_empty`/`_offset` 无用参数，已交 m6_audit 修复；本 agent 实现文件无 lint error。未运行全仓 lint、typecheck、build、Electron 门禁。

## 人工验收草稿

1. 在引用中创建两空格嵌套有序/任务列表，逐次 Enter 升级、Tab/Shift-Tab 移动，确认子项与继续行一起移动、编号及光标正确。
2. 在列表中间、EOF、连续空段处反复 Enter/Backspace，确认正文分隔与撤销；从围栏/表格下方 Backspace 返回时源码不被改写。
3. 表格边界方向键、草案 Enter、新增列，以及空加粗对再次切换、多行标题、紧凑嵌套引用格式切换。

## 后续限制

本轮 canonical scope 修复没有宣称复杂编辑已达到增量性能目标。Rich projection 仍消费同一个 `readListScopes` 的显示投影；其进一步直接消费 canonical 数据与可视区域投影属于后续结构/性能收口。复杂容器通过保留原解析帧保障源码完整性，不能把未覆盖的全部 Markdown 组合视为完成 SOTA 证明。

## 父正式 Electron 验收后的补充修复

父报告 `.artifacts/rf506-parent-behavior.json` 的 16 项 unexpected 经源码复现确认：引用列表内 code fence / math 叶在 canonical tree 中完整保留，旧观察器使用 `MarkdownDocument` 的列表显示投影，只能看到 `List` 而缺少 `ListItem` 和任意嵌套叶。不是通过修改 manifest 标准修复。

父授权后，`src/renderer/editor-behavior-observer.ts` 的语义路径、物理角色和层级统一读取实际 `view.state` 的结构缓存及派生快照。源码单元测试可构建独立快照；实际运行观察不再独立解析。DOM visibility 保持 `domAtPos`、真实元素样式与尺寸读取，不由语义模型推测。新增缓存重复观察和 selection-only 复用测试。

同时修正 physical prefix 遍历顺序：按真实容器祖先次序处理 `List > Quote > List`，而非先处理全部引用再处理全部列表。新增正式报告的 3/3/4 层深度、6/6/8 内容列回归。`matrix-enter-path-6` 的再次 Enter 保留引用正文分隔行空格；表格仅带一个末尾换行时补齐第二个换行。

新鲜 `.artifacts/rf506-canonical-production.json`：production corpus、父 27 条真实命令合同与 manifest runner 全过；observer + model 开发测试通过；本次涉及文件目标 ESLint 通过。正式报告中的 quoted code fence 空内容行被 DOM 折叠问题已交 runtime agent，等待其实际视图修复与父重跑正式 Electron。

## Canonical 观察后的容器命令修复

父第二轮正式报告暴露的 `matrix-enter-path-8/9`、`list-blockquote-enter` 与 `matrix-shift-tab-path-9` 已按原 manifest 文本合同修复。Enter 由最深层可编辑容器决定；新物理行的祖先列表标记转为等宽缩进，引用标记保留；引用末尾续行与引用中间段落分割分别处理。Shift+Tab 将 `List > Quote > List` 内层条目降为引用正文，保留外层条目。

新增三个纯命令合同包含重复 Enter 和空引用退出。`.artifacts/rf506-nested-commands.json`：542 tests passed，覆盖完整 editor-model 与 273 + 27 生产入口合同。五个命令及测试文件目标 ESLint 与 `npm run typecheck` 通过。未修改 observer、manifest 或 known-defects；正式 Electron 结果仍由父独立复跑验收。

## 最终 IME 验收修复

真实 controller 复现普通 Enter 的 edit intent 绕过冻结；adapter 改为只放行明确 insert-text，hard break 使用独立命令身份。生产 Markdown filter 在 composition 期间保留全部 native 文本和选区，结束事件轮完成后把最终规范化、待提交表格文本和 finish effect 合为一个事务。组合状态唯一来源为 adapter；移除 extension 重复布尔标记，文档身份中断不会遗留冻结。待提交表格按 generation/source 校验，仅成功提交才恢复焦点。

新增 end 前/后最终 input、native whitespace/隐藏选区、同 view 仅换 identity 无 late end，以及过期 table source/identity 合同。原 7 个结束合同等待可观察的 finish 状态，4 个装饰计数精确读取 Decoration RangeSet，仍要求一次；未放宽最终文本、选区或焦点。统一报告 `.artifacts/rf506-composition-final.json` 通过；目标 ESLint、vitest TypeScript 通过。controller 的 frame/seal barrier 由 runtime agent 完成并一并纳入本轮回归。原生平台 IME 人工验证仍单独列账。
