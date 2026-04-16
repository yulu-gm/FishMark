# Task Intake: editor-shell-refresh

Task: 新提案 `editor-shell-refresh`
Goal: 在不改变主题系统职责边界的前提下，重做编辑器前端壳层与页面布局，让 Yulora 从“可运行 MVP 壳”升级为更接近桌面编辑器的现代化工作界面。
In scope:
- 重构编辑器主界面的整体信息层级与布局骨架
- 重构空态、文档打开态、设置入口与设置页的壳层呈现
- 优化编辑区容器、元信息区、状态区的组合方式
- 保持字号、颜色、字体仍由主题 token 和偏好设置驱动
- 为后续大纲 / 最近文件 / 搜索等能力预留更自然的版位，但本轮不实现这些功能
Out of scope:
- 不新增大纲、最近文件、搜索替换、导出等新功能
- 不改动编辑器内核、Markdown 渲染语义、active block、IME、undo/redo、autosave 逻辑
- 不把具体颜色、字号、字体写死到结构样式之外
- 不替换现有技术栈，不引入重型 UI 框架
Landing area:
- `src/renderer/editor/App.tsx`
- `src/renderer/editor/settings-view.tsx`
- `src/renderer/styles/app-ui.css`
- `src/renderer/styles/settings.css`
- 可能少量触及主题层结构 token（仅在确有必要时）
- 对应 renderer 测试文件
Acceptance:
- 打开文档前后的页面布局都明显更接近桌面写作工具，而不是 demo 卡片
- 编辑页具备清晰的主次层级：应用壳、文档信息、主编辑区、辅助操作入口
- 界面改版不破坏当前打开 / 编辑 / 保存 / 自动保存 / 设置功能
- 结构样式与主题样式边界保持清晰，切换主题后布局仍成立
- 桌面端与窄窗口下都保持稳定可用
Verification:
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- 人工检查：启动 dev 壳后验证空态、文档打开态、设置页切换与主题切换
Risks:
- 若重排 `App.tsx` 结构不当，可能误伤 autosave、菜单命令、设置切换
- 若编辑器容器层级变化过深，可能影响 CodeMirror 尺寸、滚动或焦点表现
- 若把视觉决策写进结构样式，会与主题系统职责重叠
- 需要避免引入“伪侧栏”或“伪功能入口”造成能力错觉
Doc updates:
- `docs/plans/2026-04-16-editor-shell-refresh-design.md`
- 若最终行为基线变化明显，更新 `docs/design.md`
- 若人工验收关注点变化，更新 `docs/test-cases.md`
Next skill: `executing-plans`，当前已进入按任务逐步实现与验收阶段
