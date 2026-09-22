# FishMark 设计文档

版本：v1.1  
日期：2026-09-22  
范围：面向 macOS 和 Windows 的本地优先 Markdown 桌面编辑器

---

## 1. 产品目标

FishMark 是一个类似 Typora 的 Markdown 桌面编辑器，提供以文档为中心的单栏写作体验。项目目标不是堆功能，而是在保持 Markdown 作为唯一事实来源的前提下，让写作、编辑和审阅过程稳定、安静、可预测，并且默认本地优先。

MVP 应当像一个原生桌面写作工具：
- 打开 Markdown 文件后即可开始编辑
- 光标行为和 IME 输入稳定
- 保持 Markdown 往返保真
- 渲染只是视图层，不替代存储格式
- 在 macOS 和 Windows 上表现一致
- 编辑器壳层清晰表达应用导航、文档工作区、设置入口与状态信息

## 2. 产品原则

- Markdown 文本是唯一事实来源。
- 优先 WYSIWYM，而不是完整 WYSIWYG。
- 本地文件是第一等公民，不依赖账号。
- UX 稳定性优先于功能数量。
- 跨平台一致性很重要。

## 3. MVP 约束

### 2026-09-21 编辑器基础重构现状

生产编辑命令已经由 `@fishmark/editor-model` 的纯语义计划统一决定，`@fishmark/codemirror-adapter` 负责 CodeMirror 事务、选择映射、IME/history、decorations、widgets 与浏览器交互。每个 view 的结构缓存与本地 revision 由 adapter 的 StateField 管理；切换文档或重新加载会重建 session generation，旧计划不能修改新文档。renderer 既有 update listener 仍是文档 change frame 的唯一宿主，不建立第二套发送队列。

M6 / M6.5 已于 2026-09-20 收口：`packages/editor-core/` 已删除，architecture guard 为 7 包 / 13 规则 / `exceptions: []`；canonical snapshot 与共享 render plan 已成为编辑显示主路径，嵌套 list/blockquote 中的 heading、code fence、table、math/Mermaid 等叶子复用同一语义结构。左侧壳层采用常驻 rail + Search/Outline 共用的 docked sidebar，正文采用固定 measure，避免模式切换和普通面板开合导致整篇重新排版。

M7 已于 2026-09-22 收口：HTML export 经 `markdown-presentation` 消费 canonical render plan，Outline 与 document metrics 统一消费同一 `EditorDerivedSnapshot` / revision，renderer 不再为这些消费者维护独立 Markdown parser。当前重构剩余重点转为应用组合层与产品级收尾：RF-506 的最终性能/bundle 预算仍 pending；M8 清理 React/main/preload 组合层，M9 完成性能、真实 Electron E2E 与安全门禁，M10 做兼容/死代码清理和最终验收。

特殊区域的光标视口行为由 `codemirror-adapter/src/viewport-reveal.ts` 开始统一：鼠标点击使用 `preserve`（已可见则不滚），连续键盘导航使用 `nearest`（只做带安全边距的最小修正），显式导航使用 `navigate`（允许居中）。表格和图片已迁入该策略；异步 widget 高度变化造成的 viewport anchor 漂移仍是独立后续问题。

固定技术栈：
- Electron
- React
- TypeScript
- CodeMirror 6
- micromark
- Vite
- Vitest
- Playwright

未经明确批准，不引入新的编辑器内核、云同步、协作能力，或大范围架构迁移。

## 4. 范围

### 当前产品基线

FishMark 当前基线是单窗口多标签页工作区，而不是单文档窗口。

已交付并应视为稳定架构真相的能力：

- 多标签打开、创建、切换、关闭与拖拽排序
- 标签拖出为新窗口
- 工作区级保存、另存为、自动保存、外部文件变更处理与关闭确认
- main 进程持有 workspace snapshot / tab draft / dirty / save state 的 canonical truth
- renderer 通过 controller 订阅和派发工作区命令，不再自行持有可写文档真相
- 面向块的 Markdown 解析与渲染
- 当前块源码编辑，周边块偏渲染展示
- 编辑器壳层采用常驻轻量 rail + 左侧共享 docked sidebar（Search/Outline）+ 多标签工作区画布 + 独立设置抽屉 + 状态条的桌面应用布局
- 正文使用固定 measure；普通 sidebar 开合只改变 document stage 的水平位置，不改变正文列宽/换行
- 表格、图片等特殊编辑区域通过统一 viewport reveal policy 控制 selection 后的滚动

仍在 backlog 中、不要在当前文档中描述为已完成的能力：

- PDF 导出
- 完整图片拖入链路
- M8 renderer/main/preload composition cleanup
- M9 最终性能、真实 Electron E2E 与安全 hardening
- M10 dead-code / compatibility purge 与最终架构验收

### MVP 范围外

- 云同步
- 多人协作
- 插件市场
- 移动端应用
- 知识图谱式工作区
- 保存时大范围格式重写

## 5. 架构

FishMark 保持 Electron 三层分离：
- main 负责应用生命周期、菜单、文件对话框和原生集成
- preload 只暴露最小且安全的桥接 API
- renderer 负责 React UI 和编辑体验

renderer 不应直接拿到不受限制的 Node API。文件访问和其他高权限操作都必须通过明确的 IPC 边界暴露。

当前编辑器相关依赖方向固定为：

```text
workspace-domain → workspace-application → main infrastructure
markdown-engine → editor-model → markdown-presentation → codemirror-adapter
                                                     ↓
                                                  renderer
```

`markdown-engine` 只表达 canonical Markdown 结构；`editor-model` 拥有编辑语义与 derived snapshot；`markdown-presentation` 表达可被编辑器/导出复用的语义 presentation；`codemirror-adapter` 只拥有浏览器/CodeMirror 能力。React 组件不能成为新的 Markdown 语义、可写文档状态或滚动策略 owner。

## 6. 编辑模型

磁盘上的文档始终是纯 Markdown 文本。渲染叠加在文本之上，而不是替换文本。

期望交互模型：
- 当前激活块保持 Markdown 源码可编辑
- 非激活块可为了可读性进行渲染
- 选择、撤销重做、IME 行为必须可预测
- 保存时不自动重写整个文档

选择 CodeMirror 6 作为编辑基础，是因为它对状态、事务、选择、装饰和输入行为控制粒度足够细。选择 micromark 作为解析基础，是因为它适合建立 Markdown 结构与块映射。

## 7. 文件与数据规则

- 本地文件内容是权威数据
- 除非用户明确要求转换，保存操作必须尽量保留原 Markdown 风格
- 自动保存绝不能丢失未保存修改
- 崩溃恢复由 main-owned recovery journal + checksummed snapshot 负责，启动时重放有效日志；该保证不扩张为掉电/fsync/硬盘损坏恢复承诺
- 资源文件尽量保持相对路径

## 8. UX 优先级

P0：
- IME 稳定性
- 光标映射
- undo/redo 语义
- autosave 安全性
- Markdown 文本保真

P1：
- 图片粘贴 / 拖放
- 大纲
- 搜索替换
- 导出

P2：
- 主题
- frontmatter UI
- 数学公式
- mermaid
- 本地历史

## 9. 实现说明

解析器与渲染器应可独立测试。编辑器应提供清晰接口来处理文档加载、状态更新和视图同步。可复用逻辑应放在职责明确的小模块中，而不是堆进一个大文件。

所有影响持久化、编辑语义或往返保真的行为变化，都应补测试，并在决策日志中留下记录。

## 10. 编辑器壳层基线

当前壳层采用“永久 rail + 单一共享 sidebar + document stage”的桌面编辑器模型：

- 最左侧 rail 始终存在，承担品牌、Search、Outline、设置等一级入口；阅读模式不再折叠 rail，避免模式切换造成横向 chrome 位移。
- Search 与 Outline 是同一块左侧 sidebar 的 view container，共享一份宽度与持久化偏好；rail 图标只负责切换/收起 view container。
- sidebar 是平面的 docked panel，而不是悬浮玻璃卡片：外层无圆角、阴影或 backdrop blur，与正文之间用单一 1px divider 区分；内部输入框、按钮、outline hover/active 可保留轻微圆角表达交互层级。
- sidebar 宽度拖拽只在 pointerup 时写入全局偏好；拖动过程实时更新 CSS 变量，收起不写 0，窄窗口 clamp 仅影响显示、不覆盖用户保存的宽度。
- 正文采用固定 document measure。在正常宽度下，reading/editing、Search/Outline 切换和常规 panel 拖拽不应改变正文列宽、行数与文档高度；窄到无法容纳固定 measure 时才允许自然 clamp/reflow。
- sidebar 开合恢复 220ms grid track 动画，使 document stage 平滑水平移动；sidebar 内部 header/body 始终按最终宽度排版，由外层 overflow 裁剪并配合淡入/轻位移，因此 Outline 长标题不会在 0→目标宽度期间反复 reflow。
- Search 的查询真值仍是 CodeMirror search state；`Ctrl/Cmd+F` 打开并聚焦 Search，已打开时重复快捷键只重新聚焦而不关闭；切换文档 identity 时清掉旧 query/snapshot，避免跨 tab 显示陈旧结果。
- 设置继续使用独立 overlay/drawer，不参与 sidebar 的共享宽度模型。

该壳层的目标是让“内容区的位置变化”和“正文自身排版变化”分离：sidebar 可以让写作区域整体平移，但不应在用户没有主动改变可读宽度时让整篇 Markdown 重新换行。

## 11. 编辑器 Viewport Reveal 与滚动契约

selection 改变后的滚动属于 adapter 层的统一交互策略，不允许 image/table/math 等 widget 各自维护互相冲突的滚动实现。第一版策略定义三种 intent：

- `preserve`：用于鼠标点击。目标已经在 viewport 内时滚动量必须为 0；只有被裁切时才做最小 reveal。
- `nearest`：用于 Arrow/Tab/Enter 等连续导航。目标进入安全边界后不滚；越界时按最近方向做最小修正，目前垂直边距 24px、水平边距 16px。
- `navigate`：用于 Outline、Search next、Go To、footnote jump 等明确“带我去那里”的操作，可将目标放到视口中部。

DOM widget 的 reveal 应在 CodeMirror `requestMeasure` 中读取最终几何并在 write 阶段最多写一次 scroll；focus 使用 `preventScroll: true`，避免浏览器原生 focus 与应用策略同时抢滚动。相同一帧由 mousedown/focus/click 触发的重复请求应合并。当前 table cell 与 image preview 已迁入统一策略；math/Mermaid/footnote 等后续交互应复用同一 owner。

异步图片 decode、Mermaid/math 渲染等导致 widget 高度发生变化时，不应通过“再次把当前 selection 居中”掩盖问题。该类问题属于 viewport anchoring：应记录稳定的视口块身份/块内偏移，在最终测量后补偿上方高度变化。它与 selection reveal 是两个不同职责，后续应作为独立 hardening 处理。

## 12. RF-HARDEN-001：切换前恢复与增量边界（2026-09-17）

恢复业务编排由 `workspace-application/createRecoverableDocumentEdits` 持有，main 只组合磁盘端口和已有文档锁。新会话首次编辑以及非日志变更（如 reload 或保存点改变）先建立持久化基线，普通后续编辑只追加增量。每次用 metadata checkpoint 检测 revision/savedRevision，不导出全文；只有基线失效才导出快照。追加完成后返回 ACK；写失败保留内存、向调用方报告，并禁止 duplicate 绕过失败返回假 ACK。所有追加和快照压缩共用串行队列。异步基线之后、实际 mutation 之前再次校验调用者授权。

最终排空发生在 `will-quit`，保留此前窗口关闭确认和 renderer flush。最多等待 5 秒；超时或失败记录错误，保留已完成日志。恢复跳过快照已覆盖的 revision；client sequence 属于瞬态状态，重放每个 entry 使用独立 recovery client。最后一行写入中断时恢复有效前缀并显式提示；untitled 的 null fileIdentity 是合法持久化状态。这是进程崩溃保证，不承诺掉电或硬盘损坏恢复（尚无 fsync/目录同步保证）。

增量缓存目前只对无全局定义的单行纯文本段落证明块边界不变，直接重建该段 inline，并映射后续 inline/table 的位置；支持正文、行尾/EOF 输入和 Backspace。结构编辑、复杂行内语法和含定义文档显式 full fallback，提供 `fallbackReason/fullParseCount/parsedSourceLength`，不得把 fallback 包装成局部性能。树索引、root fingerprint 和后方位置映射仍有全篇成本。桥接拒绝过期计划，多范围事务保持本地版本单调，selection-only 操作复用同一派生快照；该本地版本不是 main 权威版本。
