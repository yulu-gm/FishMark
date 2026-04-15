# TASK-004 Save / Save As Design

## Scope

Task: `TASK-004`
Goal: 建立已打开 Markdown 文档的最小保存闭环，支持 Save 和 Save As。
In scope:
- 已打开文档的手动保存
- 已打开文档的另存为
- renderer 中最小 `dirty` 状态
- 保存中 / 已保存 / 失败的最小反馈
- 主进程文件写入失败映射

Out of scope:
- 未命名新建文档
- 自动保存
- 快捷键
- CodeMirror 6 接入
- 崩溃恢复

## Current Constraints

- 文件系统和系统对话框必须只在 `src/main/` 中访问。
- `preload` 只暴露最小 bridge。
- `renderer` 当前仍以临时 `<textarea>` 作为编辑表面。
- 保存不能重排整个 Markdown 文档，只能按当前内存文本原样写回。

## Recommended Approach

采用延续 `TASK-003` 的最小闭环方案：

1. 在 `src/shared/` 新增保存结果类型与 IPC channel 常量。
2. 在 `src/main/` 新增保存服务，分别处理“按当前路径保存”和“通过保存对话框另存为”。
3. 在 `src/preload/` 暴露 `saveMarkdownFile()` 与 `saveMarkdownFileAs()`。
4. 在 `src/renderer/document-state.ts` 中增加 `dirty` 和 `saveState`，并在保存成功后同步当前路径与内容。
5. 在 `src/renderer/App.tsx` 中增加 Save / Save As 按钮和最小状态文案。

这个方案的优点是：
- 与现有 open 流程保持一致，风险最低。
- 不提前引入多余抽象。
- 可直接为 `TASK-005` autosave 复用保存链路。

## Data Flow

### Save

1. 用户修改 `<textarea>`，renderer 把当前文档标记为 `dirty=true`。
2. 用户点击 `Save`。
3. renderer 调用 `window.yulora.saveMarkdownFile({ path, content })`。
4. `preload` 通过 IPC 转发到 `main`。
5. `main` 原样写入 UTF-8 文本。
6. 成功后返回当前文档元数据。
7. renderer 清除 `dirty`，更新错误提示和保存状态。

### Save As

1. 用户点击 `Save As`。
2. renderer 调用 `window.yulora.saveMarkdownFileAs({ currentPath, content })`。
3. `main` 打开保存对话框。
4. 若用户取消，返回 `cancelled`，renderer 保持原状态。
5. 若用户确认路径，`main` 写入内容并返回新路径与文件名。
6. renderer 用新路径替换当前文档，并清除 `dirty`。

## Error Handling

保存结果延续 `TASK-003` 的稳定结构：

- `success`: 返回保存后的文档元数据。
- `cancelled`: 仅用于 `Save As` 取消。
- `error`: 返回稳定错误码和展示消息。

当前最小错误码：
- `dialog-failed`
- `write-failed`

本轮不额外暴露底层系统错误细节，只给稳定用户消息。

## Renderer State

`AppState` 增加：

- `saveState: "idle" | "saving"`
- `isDirty: boolean`

规则：
- 打开文档成功后：`isDirty=false`
- 修改文本后：若内容与最近成功保存内容不同，则 `isDirty=true`
- 保存成功后：`isDirty=false`
- 保存失败后：保留 `isDirty=true`
- 另存为取消后：保留原路径与 `isDirty`

## Tests

先写失败测试，再写实现。

### Main

- 直接保存成功时写入目标路径
- 写入失败时返回 `write-failed`
- 另存为取消时返回 `cancelled`
- 另存为成功时返回新路径和文件名

### Renderer

- 编辑后文档进入 dirty 状态
- 保存成功后清除 dirty
- 保存失败后保留 dirty 和错误
- 另存为成功后更新路径与文件名
- 另存为取消后不改变当前文档

## Verification

- `npm run test -- src/main/save-markdown-file.test.ts src/renderer/document-state.test.ts`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Docs Expected To Update

- `docs/decision-log.md`
- `docs/test-report.md`
- `docs/progress.md`
- `reports/task-summaries/TASK-004.md`
