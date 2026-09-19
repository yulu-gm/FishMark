# FishMark 设计文档

版本：v1.0  
日期：2026-04-15  
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

### 2026-09-19 编辑器基础重构现状

生产编辑命令已经由 `editor-model` 纯计划统一决定，`codemirror-adapter` 将计划转换为 CodeMirror 事务。每个 view 的结构缓存与本地 revision 由 StateField 管理；切换文档和重新加载产生新的 session generation，使旧计划不能复用。最终事务仍由 renderer 既有 update listener 统一生成编辑帧，包含原生输入、语义命令、撤销和组合输入，不建立第二个发送队列。

布局暂时仍由 `editor-core` 承担。它复用 canonical tree 的 rich projection，不再为一次输入执行第二次全文解析；物理行和 outline 按不可变文档复用。但 rich projection 的列表和行内派生仍有重复解释，装饰仍有全文更新路径。这些是 M6 前置 RF-701 及 RF-602/603/604 的明确删除责任，不应把事务适配器已经存在等同于薄适配层重构完成。

正式行为观察器读取实际 view 的 canonical snapshot；DOM 可见性由真实元素、computed style 和几何测量判断。性能验收分别报告真实 parser 扫描、同步派发和下一次渲染机会，不能把 parser 调用次数为零当作输入不卡顿。

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
- 编辑器壳层采用轻侧轨 + 多标签工作区画布 + 左侧设置抽屉 + 状态条的桌面应用布局

仍在 backlog 中、不要在当前文档中描述为已完成的能力：

- 崩溃恢复与 workspace session restore
- 搜索替换、HTML/PDF 导出
- 完整图片拖入链路

### MVP 范围外

- 云同步
- 多人协作
- 插件市场
- 移动端应用
- 知识图谱式工作区
- 保存时大范围格式重写
- 自动恢复跨进程崩溃前的完整 workspace session

## 5. 架构

FishMark 保持 Electron 三层分离：
- main 负责应用生命周期、菜单、文件对话框和原生集成
- preload 只暴露最小且安全的桥接 API
- renderer 负责 React UI 和编辑体验

renderer 不应直接拿到不受限制的 Node API。文件访问和其他高权限操作都必须通过明确的 IPC 边界暴露。

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
- 崩溃恢复属于后续 backlog；在落地前，保存 / autosave / close confirmation 必须优先防止当前会话内的数据丢失
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

编辑器主界面不再以单张卡片或整页设置切换作为主要呈现方式，而是采用更接近成熟桌面编辑器的壳层结构：

- 最左侧保留轻量窄侧轨，只承担品牌存在感、查找替换入口与设置入口，不再放未实现功能的占位按钮
- 中间工作区由轻量顶部信息带、独立居中的写作画布和安静的底部状态区组成，主写作区始终保持稳定、清晰、可读
- 设置页是偏离屏幕边缘的悬浮抽屉，通过遮罩覆盖当前工作区，而不是把页面硬挤开；抽屉内部使用可展开分类导航承载现有偏好设置
- 毛玻璃与透明效果只用于抽屉、侧栏、浮层等辅助层，主编辑区保持近实色表面
- 应用底部保留持续可见的状态条，展示保存状态、自动保存状态和字数等信息，但视觉上应保持克制，不抢写作焦点
- 壳层支持阅读模式与编辑模式：已有文档默认进入阅读模式，新建文档默认进入编辑模式；点击正文立即进入编辑模式，按 `Esc` 或点击正文空白区返回阅读模式
- welcome / 空态界面会保留左侧 rail 作为稳定入口；打开文档后，阅读模式会收起左侧 rail、顶部信息带与底部状态条，主工作区同步横向铺满窗口，并保持 workspace 居中与左右留白对称，整体观感尽量安静克制；被收起的 header / status bar 不能继续占据工作区布局轨道

该壳层的设计目标是保持写作工具的秩序感与沉浸感，同时为后续搜索等能力预留自然版位。视觉细节中的字号、颜色和字体仍由主题系统与偏好设置控制，布局层只负责信息层级、容器关系和一致的设计 token。

查找替换作为编辑器浮层能力挂在写作画布之上，由 renderer 侧面板维护临时查询状态，并通过 CodeMirror search state 完成匹配高亮、导航和替换；替换事务必须进入现有 undo / redo history，不能绕开 Markdown 文本真值或 main/preload 边界。
## RF-HARDEN-001：切换前恢复与增量边界（2026-09-17）

恢复业务编排由 `workspace-application/createRecoverableDocumentEdits` 持有，main 只组合磁盘端口和已有文档锁。新会话首次编辑以及非日志变更（如 reload 或保存点改变）先建立持久化基线，普通后续编辑只追加增量。每次用 metadata checkpoint 检测 revision/savedRevision，不导出全文；只有基线失效才导出快照。追加完成后返回 ACK；写失败保留内存、向调用方报告，并禁止 duplicate 绕过失败返回假 ACK。所有追加和快照压缩共用串行队列。异步基线之后、实际 mutation 之前再次校验调用者授权。

最终排空发生在 `will-quit`，保留此前窗口关闭确认和 renderer flush。最多等待 5 秒；超时或失败记录错误，保留已完成日志。恢复跳过快照已覆盖的 revision；client sequence 属于瞬态状态，重放每个 entry 使用独立 recovery client。最后一行写入中断时恢复有效前缀并显式提示；untitled 的 null fileIdentity 是合法持久化状态。这是进程崩溃保证，不承诺掉电或硬盘损坏恢复（尚无 fsync/目录同步保证）。

增量缓存目前只对无全局定义的单行纯文本段落证明块边界不变，直接重建该段 inline，并映射后续 inline/table 的位置；支持正文、行尾/EOF 输入和 Backspace。结构编辑、复杂行内语法和含定义文档显式 full fallback，提供 `fallbackReason/fullParseCount/parsedSourceLength`，不得把 fallback 包装成局部性能。树索引、root fingerprint 和后方位置映射仍有全篇成本。桥接拒绝过期计划，多范围事务保持本地版本单调，selection-only 操作复用同一派生快照；该本地版本不是 main 权威版本。
