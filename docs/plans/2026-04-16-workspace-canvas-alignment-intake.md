# Task Intake: workspace-canvas-alignment

Task: 新提案 `workspace-canvas-alignment`
Goal: 在不改动编辑器内核、Markdown 语义和主题系统职责边界的前提下，修正当前 editor shell 的对齐漂移问题，并把状态条提升为应用级固定底栏，让默认浅色主题更接近安静、干净、苹果系写作工具。
In scope:
- 收拢 `workspace` 内的对齐体系，明确区分“顶部信息带”和“独立居中画布”
- 让空态卡片、文档头和编辑器画布共用同一条内容列
- 把状态条从文档流底部改为应用底部固定状态条
- 调整默认浅色主题的壳层视觉：浅灰白背景、半透明白玻璃抽屉、纯白主卡片、深蓝灰文字、少量冷色强调
- 保持设置抽屉、打开文件、保存、自动保存、主题切换和字号偏好正常工作
Out of scope:
- 不新增大纲、最近文件、搜索替换、导出等功能
- 不改动 `CodeMirror`、IME、undo/redo、autosave 核心逻辑
- 不改动 Markdown 渲染语义或 round-trip 行为
- 不引入新的主题格式、设计系统依赖或跨模块重构
Landing area:
- `src/renderer/editor/App.tsx`
- `src/renderer/editor/settings-view.tsx`
- `src/renderer/styles/base.css`
- `src/renderer/styles/app-ui.css`
- `src/renderer/styles/settings.css`
- `src/renderer/styles/themes/default-light/tokens.css`
- `src/renderer/styles/themes/default-light/ui.css`
- 相关 renderer 测试
Acceptance:
- 顶部品牌信息、提示文案和下方主画布的左右边界关系稳定，不再出现空态卡片“歪出另一套轴线”的观感
- 打开文档前后，空态卡片、文档头和编辑器外框都落在同一条居中画布列内
- 状态条固定在应用底部，可持续显示保存状态、字数和平台信息，不随编辑区滚动消失
- 默认浅色主题视觉满足“浅灰白背景 + 半透明白玻璃抽屉 + 纯白主卡片 + 深蓝灰文字 + 少量冷色强调”
- 打开设置抽屉、关闭抽屉、切换主题、编辑文档和自动保存行为无回归
Verification:
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- 人工检查：空态、文档态、设置抽屉、固定状态条、浅色主题观感、窄窗口布局
Risks:
- 如果固定状态条没有给编辑区预留底部空间，最后几行文本可能被遮挡
- 如果继续混用 `workspace` 外边距和 `document-canvas` 自身居中规则，视觉歪斜会继续存在
- 如果把视觉细节硬编码进结构样式，后续主题切换会再次破坏布局一致性
- 如果抽屉和状态条层级处理不当，可能影响焦点恢复或遮罩交互
Doc updates:
- `docs/superpowers/specs/2026-04-16-workspace-canvas-alignment-design.md`
- 如实现后的壳层基线明显变化，更新 `docs/design.md`
- 如人工验收关注点变化，更新 `docs/test-cases.md`
Next skill: `writing-plans`
