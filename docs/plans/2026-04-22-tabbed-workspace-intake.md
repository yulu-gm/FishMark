Task: tabbed-workspace
Goal: 为 FishMark 引入默认单窗口多标签页工作区；已有文档时再次打开文件默认新增标签页，只有明确 `File > New Window` 时才创建新窗口；同时支持标签排序、拖出成新窗口与逐标签未保存关闭流程。
In scope:
- main 中的 `WorkspaceGraph` 与 `TabSession` 全局真值
- 文档会话从单一 `currentDocument` 迁移到 `tabId` 维度
- `File > New` / `Open...` / `New Window` / 外部打开 / 拖入文件 的统一窗口与标签决策
- 标签栏 UI、活动标签切换、标签关闭、拖拽排序、拖出成新窗口
- 保存、另存为、autosave、外部文件变更、关闭确认按 `tabId` 工作
- 相关设计、验收、测试、进度文档更新
Out of scope:
- 应用重启后的标签页或窗口布局恢复
- 分屏编辑、固定标签页、预览标签页、最近文件入口扩展
- 将 CodeMirror 或文件系统能力迁移到 main / renderer 边界之外
Landing area:
- `src/main/`
- `src/preload/`
- `src/shared/`
- `src/renderer/`
- `docs/design.md`
- `docs/acceptance.md`
- `docs/test-cases.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/`
Acceptance:
- 当前窗口可同时打开多个 Markdown 标签页
- `File > New` 在当前窗口创建未保存标签页
- 已有文档时 `Open...` / 拖入 / 外部打开默认新增标签页
- 只有 `File > New Window` 打开新窗口
- 标签页支持排序与拖出成新窗口
- 关闭单个标签页只处理该标签页未保存状态
- 关闭窗口时逐个处理该窗口中的未保存标签页
- 不破坏现有保存、autosave、外部文件变更、IME 与 round-trip 基线
Verification:
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- 相关 renderer / main / preload 定向 Vitest 回归
Risks:
- `currentDocument` 心智模型升级为 `window -> tabs -> active tab session`，重构面较大
- 主进程持有全局工作区与草稿真值后，IPC 若设计不清晰，容易出现镜像状态
- 拖出成新窗口与窗口关闭流程容易踩到 flush 时序、dirty 判断和 IME 稳定性
- 单窗口只挂载一个活动编辑器实例，会把标签恢复逻辑的正确性要求拉高
Doc updates:
- `docs/superpowers/specs/2026-04-22-fishmark-tabbed-workspace-design.md`
- `docs/design.md`
- `docs/acceptance.md`
- `docs/test-cases.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/`
Next skill: $fishmark-task-execution
