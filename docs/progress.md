# FishMark 进展记录

工作流状态：

`TODO` -> `DEV_IN_PROGRESS` -> `DEV_DONE` -> `REVIEW_IN_PROGRESS` -> `CHANGES_REQUESTED` / `ACCEPTED` -> `CLOSED`

## 当前项目判断

### 2026-04-24 架构重构进度

当前架构重构在隔离 worktree `/Users/chenglinwu/Documents/Yulora/.worktrees/codex-architecture-reset`、分支 `codex/architecture-reset` 上继续推进，执行计划为 `docs/superpowers/plans/2026-04-23-fishmark-architecture-reset.md`。

已完成并通过 review：
- Task 1：shared workspace contract 与 product/test bridge 类型边界已收口。
- Task 2：workspace canonical truth 已收敛到 main，save / close 的 in-flight draft race 已修复并补测试。
- Task 3：`window.fishmark` 已收缩为 product bridge，`window.fishmarkTest` 已隔离到 test-workbench / editor-test runtime；preload bridge mode contract 已提到 shared 层。
- Task 4：renderer workflow orchestration 已拆到 `useWorkspaceController` / `useSaveController` / `useExternalConflictController` / `useEditorWorkflowController`，`document-state.ts` 已删除；save-success refresh、in-flight draft、Save As replay 等竞态已通过 spec + quality review。

当前进行中：
- Task 5：继续把 `src/renderer/editor/App.tsx` 瘦身为 composition root + presentation components。
- 下一步：拆出 workspace chrome、editor canvas、notification/conflict/sidebar 等展示组件，保持 controller 边界不回流；不要再引入 renderer-local workspace truth。

接手注意：
- `package-lock.json` 在 worktree 中有既有无关脏变更，不要回滚也不要纳入本轮提交。
- 每个任务继续执行 spec review -> code quality review 两段验收；Task 5 过线后再进入 Task 6。

截至 2026-04-16，项目处于“可运行编辑器 + 偏好设置与主题运行时基础能力”阶段，而不是“完整 Markdown 编辑器”阶段。

从源码可确认的已完成内容：
- Electron 主进程已能创建窗口
- preload 已通过 `contextBridge` 暴露最小 API
- React 渲染器已能显示最小文档界面
- 已建立安全的 Markdown 文件打开 bridge、UTF-8 读取与错误映射
- renderer 已具备当前文档状态，并能把已打开文档加载到 CodeMirror 6 编辑器中
- 存在主进程文件打开测试和 renderer 文档状态测试
- 偏好设置已接入颜色模式、主题家族、刷新主题、应用 UI 字体、应用 UI 字号、文档字号、文档字体和 autosave idle delay，变更可实时生效
- 当前文档已支持外部修改 / 删除冲突检测，冲突发生时会暂停 autosave 并提供重载 / 保留当前编辑 / 另存为三条路径
- 已建立主进程持有的标签页工作区真值与 renderer 标签栏主链：当前窗口已支持创建 / 打开 / 切换 / 关闭多个 Markdown 标签页，`Open...` / 拖入 / 外部打开默认进入当前窗口标签流，标签可排序并拖出成新窗口；保存、另存为、autosave、外部文件 watcher 与关闭确认已按活动 `tabId` / 窗口标签序列工作，活动标签继续复用单个 CodeMirror 编辑器实例
- 基础目录边界已建立：`apps/desktop`、`packages/editor-core`、`packages/markdown-engine`、`tests/e2e`

从源码可确认的未完成内容：
- 图片粘贴与拖入还未接入完整链路
- 最近文件列表与崩溃恢复尚未打通
- 轮廓大纲、搜索替换、HTML/PDF 导出与图片导入仍待完善

当前工作区依赖已安装，并已在 2026-04-16 本地环境里实际执行并通过 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`。若环境差异较大，可按需重跑四项门禁命令复核。

## 人工验收建议

如果你现在想人工验收，请验 `TASK-001`、`TASK-002`、`TASK-003`、`TASK-004`、`TASK-007`、`TASK-032`、`TASK-036` 和 `TASK-037`：
- `TASK-001`：确认开发壳能启动，界面能显示占位内容和 preload 平台字段
- `TASK-002`：确认目录边界存在且未破坏根目录当前可运行外壳
- `TASK-003`：确认可以通过系统文件对话框打开 UTF-8 `.md`，并把内容加载到当前文档界面和 CodeMirror 编辑区中
- `TASK-004`：确认编辑后会进入 dirty 状态，`Save` 会写回当前路径，`Save As` 会写入新路径并切换当前文档路径
- `TASK-007`：确认 CodeMirror 编辑区可输入，undo / redo 快捷键可用，且保存链路仍与当前编辑文本保持一致
- `TASK-032`：确认 `File` 菜单提供 `Open...`、`Save`、`Save As...`，同时页面壳层不再呈现居中 demo 卡片样式
- `TASK-036`：确认当前文件在系统外部被修改或删除后，会出现重载 / 保留当前编辑 / 另存为提示，并且 autosave 不会静默覆盖外部变化
- `TASK-037`：确认设置页支持颜色模式、主题家族、刷新主题、应用 UI 字体、应用 UI 字号、文档字号、文档字体与 autosave 间隔，且变更能持久化并即时生效

不要把当前仓库误判为“已经具备完整 Markdown 编辑器 MVP 功能”。

## 任务状态表

| Task | Epic | 状态 | 说明 |
| --- | --- | --- | --- |
| BOOTSTRAP-DOCS | 文档基线 | CLOSED | 文档基线已修正并关闭。 |
| TASK-001 | 项目骨架 | CLOSED | 已通过独立评审；确认 Electron / Vite / React / TypeScript 开发壳可建立。 |
| TASK-002 | 项目结构 | DEV_DONE | 已建立 `apps/desktop`、`packages/editor-core`、`packages/markdown-engine`、`tests/e2e` 目录边界，同时保持根目录开发壳可运行。 |
| TASK-003 | 打开 Markdown 文件 | DEV_DONE | 已接入安全打开桥接、UTF-8 读取、错误提示与临时 textarea 显示。 |
| TASK-004 | 保存与另存为 | DEV_DONE | 已接入安全 Save / Save As bridge、主进程写入、dirty 状态与保存反馈。 |
| TASK-005 | 自动保存 | DEV_DONE | 已接入 idle autosave、blur autosave、手动/自动保存状态区分，以及保存进行中再次编辑后的单次 replay autosave。 |
| TASK-006 | 最近文件 | TODO | 最近文档列表与失效路径清理。 |
| TASK-007 | CodeMirror 6 接入 | DEV_DONE | 已用 CodeMirror 6 替换临时 textarea，并接入基础编辑面、快捷键与现有保存链路。 |
| TASK-032 | 应用菜单与壳层收敛 | DEV_DONE | 已接入原生 `File` 菜单中的 `Open...`、`Save`、`Save As...`，并把 renderer 临时壳收敛为更像桌面编辑器的单栏界面。 |
| TASK-008 | micromark block map | ACCEPTED | 已接入 `micromark` parser 事件流，输出 `heading` / `paragraph` / `list` / `blockquote` 的最小 block map，并通过 parser 单测与 repo 门禁验收。 |
| TASK-009 | active block 状态 | DEV_DONE | 已在 `packages/editor-core` 中落地 active block 解析，并由 CodeMirror 选择变化驱动 renderer 侧当前块状态。 |
| TASK-010 | 标题渲染 | CLOSED | 标题 `#` 弱化、激活回源码态、目标测试、人工验收与合并前门禁均已完成。 |
| TASK-011 | 段落渲染 | CLOSED | 非激活段落轻量渲染、激活回源码态、目标测试、人工验收与合并前门禁均已完成。 |
| TASK-012 | 列表与任务列表渲染 | DEV_DONE | 已补齐列表项 block metadata、非激活态列表/任务列表渲染、Enter 续项与空项退出规则；2026-04-20 起有序列表编辑重构为统一语义层：`markdown-engine` 显式保留 `startOrdinal` / `delimiter` 与嵌套 `children`，`editor-core` 通过 `list-edits` 处理插入、删除、缩进、反缩进、上下移动与 transaction 级归一化，不再依赖分散的按键补丁逻辑；2026-04-21 又把 ordered-list normalization 从“全文替换”收敛成增量 `sequential` 事务，只修正必要 marker diff，彻底修复阅读模式下回删有序列表时页面跳顶的问题；同日还统一了嵌套空列表项的 Enter 语义：ordered / unordered / task list 在子级空项回车时会先回退一层创建父级空项，只有顶级空项才会退出到空行。 |
| TASK-013 | 引用块渲染 | DEV_DONE | 已为 top-level 引用块补上非激活态淡色背景与缩进显示，隐藏 `>` 前缀，并在激活时恢复完整 Markdown 源码态；新增 blockquote 交互与 composition flush 回归测试。 |
| TASK-014 | 链接显示与编辑 | TODO | 链接文本渲染与浏览器打开。 |
| TASK-015 | 图片粘贴 | DEV_DONE | 已接入剪贴板图片导入、本地 `assets/` 落盘、相对路径 Markdown 插入，以及 Markdown 图片与 HTML `<img>` 在激活态源码 + 预览 / 非激活态图片预览下的统一渲染。 |
| TASK-016 | 图片拖放 | TODO | 拖放图片导入。 |
| TASK-017 | 大纲侧栏 | DEV_DONE | 已补齐 heading 到 outline item 的提取、右侧悬浮可折叠大纲面板、默认收起入口、独立滚动区与点击后编辑器定位/滚动，并覆盖 renderer 回归测试。 |
| TASK-018 | 查找替换 | TODO | 文档搜索与替换。 |
| TASK-019 | HTML 导出 | TODO | 导出当前文档为 HTML。 |
| TASK-020 | PDF 导出 | TODO | 导出当前文档为 PDF。 |
| TASK-021 | 崩溃恢复 | TODO | 异常退出后的未保存状态恢复。 |
| TASK-022 | 中文 IME 修复 | TODO | 组合输入与光标稳定性。 |
| TASK-023 | round-trip 回归测试 | TODO | 防止 Markdown 风格被重写。 |
| TASK-024 | Playwright 冒烟测试 | TODO | 在测试工作台体系内接入首条 CLI 可触发的打开-编辑-保存-重开冒烟场景。 |
| TASK-025 | 测试工作台窗口 | ACCEPTED | 已交付独立测试工作台窗口、测试模式启动入口、最小 runtime bridge，以及从工作台拉起独立 editor 测试窗口的基础能力，并完成本轮验收复核。 |
| TASK-026 | 场景注册表 | DEV_DONE | 已在 `packages/test-harness` 落地 `TestScenario` / `TestStep` 类型、`createScenarioRegistry` 静态注册表与查询 API，并把 `defaultScenarioRegistry` 接入工作台场景目录面板；种子场景 `app-shell-startup`、`open-markdown-file-basic`。 |
| TASK-027 | 测试运行器 | DEV_DONE | 已在 `packages/test-harness` 落地统一运行器、步骤状态机与终态处理，并接入工作台运行事件流。 |
| TASK-028 | Debug 界面 | DEV_DONE | 已将 runner 事件流接入测试工作台 renderer，交付场景概览、步骤追踪、最近事件流，以及失败 / 中断原因展示。 |
| TASK-029 | CLI 与工件协议 | DEV_DONE | 已提供 `npm run test:scenario` 统一入口、稳定退出码与标准结果工件目录协议。 |
| TASK-030 | visual-test 支持 | TODO | 首版 synthetic gradient 方案已回退；需按真实截图与真实结果来源重做。 |
| TASK-031 | 核心场景扩充 | TODO | 首批可持续使用的核心测试场景集。 |
| TASK-033 | 代码块渲染 | DEV_DONE | 已补齐 fenced code block block map/info string、非激活态等宽渲染与源码态恢复，并覆盖 round-trip 基线回归。 |
| TASK-034 | 行内格式渲染 | DEV_DONE | 已在 `markdown-engine` 建立 canonical `parseMarkdownDocument()` 与完整 inline AST，并接入 `editor-core` / renderer 的非激活态行内渲染；当前支持 bold / italic / inline code / strikethrough 及常见嵌套，光标回到对应 block 后恢复 Markdown 源码态。 |
| TASK-035 | IME 基线保护 | ACCEPTED | 已完成 composition guard、autosave 光标回归修复与段落/标题/列表回归测试，并通过本轮中文 IME 人工验收。 |
| TASK-036 | 外部文件变更检测 | DEV_DONE | 已接入按窗口绑定的当前文档 watcher、外部修改/删除提示、重载 / 保留当前编辑 / 另存为三条路径，以及冲突期间 autosave/Save 的保护规则。 |
| TASK-037 | 偏好设置持久化 | DEV_DONE | 已建立 `app.getPath('userData')/preferences.json` 配置存储，覆盖 autosave 间隔、最近文件上限、应用 UI 字体与字号、文档字体与字号、主题设置；提供 schema 校验、范围 clamp、损坏文件备份恢复与原子写入；通过 `getPreferences` / `updatePreferences` / `onPreferencesChanged` bridge 对 renderer 暴露受限访问；设置页已接入颜色模式、主题家族、刷新主题、应用 UI 字体、应用 UI 字号、文档字号、文档字体与 autosave idle delay；社区主题统一从 `<userData>/themes/<familyId>/<mode>` 扫描，当前主题不支持所选 light/dark 模式时会回退到 `FishMark 默认` 并显示提示；`recentFiles.maxEntries` 仍待 `TASK-006` 接入。 |
| TASK-039 | 分割线渲染 | DEV_DONE | 已补齐 `thematicBreak` block map、`---` / `+++` 分割线解析、非激活态横线渲染与源码态恢复，并覆盖 CRLF 边界回归。 |
| TASK-038 | 跨平台打包 | DEV_IN_PROGRESS | 已接入基于 `electron-builder` 的 Windows 本地 `package:win` 打包入口，并在打包前按需从 `assets/branding/*.svg` 生成 `light` / `dark` 两套 PNG 与 Windows `icon.ico`；当前通过 `afterPack + rcedit` workaround 为应用主程序补写正式图标，同时将 `package` / `release` / `dev` 的 bat/sh 工具统一收口到 `tools/` 目录，并补齐 macOS `CFBundleDocumentTypes` 所需的 `.md` / `.markdown` 文件关联声明；现已提供本地 `package:mac` / `tools/package-macos.sh` 入口，可产出 unpacked `FishMark.app`，但 macOS `.dmg` / `.zip`、正式签名和 `.icns` 仍待后续切片完成。 |
| TASK-041 | 默认 Markdown 切换型快捷键 | DEV_DONE | 已在 `packages/editor-core/src/commands/` 落地三层语义切换器（`semantic-context` / `semantic-edits` / `toggle-*-commands`），并在 markdown extension keymap 中接入 `Cmd/Ctrl+B`、`Cmd/Ctrl+I`、`Cmd/Ctrl+1..4`、`Shift+Cmd/Ctrl+7`、`Shift+Cmd/Ctrl+9`、`Alt+Shift+Cmd/Ctrl+C`；命令级、扩展级与 renderer 回归测试均覆盖到位，对应 IME composition guard、autosave、active block 与 inactive block decorations 未回归。 |
| TASK-043 | 标签页工作区 | ACCEPTED | 已完成 `main` 持有的 workspace snapshot / tab IPC、renderer 标签栏与活动编辑器主链、多标签新建 / 打开 / 切换 / 关闭、`Open...` / 拖入 / 外部打开默认进标签流、标签排序 / 拖出成新窗口，以及 `tabId` 维度的保存 / 另存为 / autosave / 外部文件 watcher / 关闭确认；本轮验收命令已全部通过。 |
