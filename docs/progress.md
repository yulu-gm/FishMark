# Yulora 进展记录

工作流状态：

`TODO` -> `DEV_IN_PROGRESS` -> `DEV_DONE` -> `REVIEW_IN_PROGRESS` -> `CHANGES_REQUESTED` / `ACCEPTED` -> `CLOSED`

## 当前项目判断

截至 2026-04-15，项目处于“可运行骨架 + 最小 CodeMirror 编辑闭环”阶段，而不是“完整 Markdown 编辑器”阶段。

从源码可确认的已完成内容：
- Electron 主进程已能创建窗口
- preload 已通过 `contextBridge` 暴露最小 API
- React 渲染器已能显示最小文档界面
- 已建立安全的 Markdown 文件打开 bridge、UTF-8 读取与错误映射
- renderer 已具备当前文档状态，并能把已打开文档加载到 CodeMirror 6 编辑器中
- 存在主进程文件打开测试和 renderer 文档状态测试
- 基础目录边界已建立：`apps/desktop`、`packages/editor-core`、`packages/markdown-engine`、`tests/e2e`

从源码可确认的未完成内容：
- 已接入 micromark，并能在 `packages/markdown-engine` 中生成最小 top-level block map
- 已能基于光标位置跟踪当前 top-level active block，并把结果从 CodeMirror 控制器桥接到 renderer
- 已实现标题、段落、列表与引用块的 top-level 非激活态渲染，激活块仍保持 Markdown 源码态
- 尚未实现 crash recovery、image import、outline、search、export

当前工作区依赖已安装，并已在 2026-04-15 本轮会话中重新验证 `lint`、`typecheck`、`test`、`build`。其中 `test` 与 `build` 在当前沙箱环境下会遇到 Vite / Vitest 的 `spawn EPERM` 限制，需要在提权环境下运行才能得到通过证据。

## 人工验收建议

如果你现在想人工验收，请验 `TASK-001`、`TASK-002`、`TASK-003`、`TASK-004`、`TASK-007` 和 `TASK-032`：
- `TASK-001`：确认开发壳能启动，界面能显示占位内容和 preload 平台字段
- `TASK-002`：确认目录边界存在且未破坏根目录当前可运行外壳
- `TASK-003`：确认可以通过系统文件对话框打开 UTF-8 `.md`，并把内容加载到当前文档界面和 CodeMirror 编辑区中
- `TASK-004`：确认编辑后会进入 dirty 状态，`Save` 会写回当前路径，`Save As` 会写入新路径并切换当前文档路径
- `TASK-007`：确认 CodeMirror 编辑区可输入，undo / redo 快捷键可用，且保存链路仍与当前编辑文本保持一致
- `TASK-032`：确认 `File` 菜单提供 `Open...`、`Save`、`Save As...`，同时页面壳层不再呈现居中 demo 卡片样式

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
| TASK-012 | 列表与任务列表渲染 | DEV_DONE | 已补齐列表项 block metadata、非激活态列表/任务列表渲染、Enter 续项与空项退出规则，并新增 harness scenario 覆盖回归路径。 |
| TASK-013 | 引用块渲染 | DEV_DONE | 已为 top-level 引用块补上非激活态淡色背景与缩进显示，隐藏 `>` 前缀，并在激活时恢复完整 Markdown 源码态；新增 blockquote 交互与 composition flush 回归测试。 |
| TASK-014 | 链接显示与编辑 | TODO | 链接文本渲染与浏览器打开。 |
| TASK-015 | 图片粘贴 | TODO | 粘贴图片落盘。 |
| TASK-016 | 图片拖放 | TODO | 拖放图片导入。 |
| TASK-017 | 大纲侧栏 | TODO | 基于标题的大纲导航。 |
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
| TASK-034 | 行内格式渲染 | TODO | bold / italic / inline code / strikethrough 的激活切换。 |
| TASK-035 | IME 基线保护 | ACCEPTED | 已完成 composition guard、autosave 光标回归修复与段落/标题/列表回归测试，并通过本轮中文 IME 人工验收。 |
| TASK-036 | 外部文件变更检测 | TODO | 外部修改当前文件时的提示与冲突处理，避免 autosave 覆盖。 |
| TASK-037 | 偏好设置持久化 | TODO | 最小配置存储，承载 autosave 间隔、最近文件上限、字体主题等。 |
| TASK-039 | 分割线渲染 | DEV_DONE | 已补齐 `thematicBreak` block map、`---` / `+++` 分割线解析、非激活态横线渲染与源码态恢复，并覆盖 CRLF 边界回归。 |
| TASK-038 | 跨平台打包 | DEV_IN_PROGRESS | 已接入基于 `electron-builder` 的 Windows 本地 `package:win` 打包入口，并在打包前按需从 `assets/branding/*.svg` 生成 `light` / `dark` 两套 PNG 与 Windows `icon.ico`；当前通过 `afterPack + rcedit` workaround 为应用主程序补写正式图标，同时提供仓库根目录 `package-win.bat` 可用入口与 `package-macos.sh` 预留入口，macOS 产物、签名和 `.icns` 仍待后续切片完成。 |
