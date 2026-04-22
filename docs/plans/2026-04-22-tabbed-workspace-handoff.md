# TASK-043 Execution Handoff

## 改了什么

- 新增 `src/shared/workspace.ts` 与 `src/main/workspace-service.ts`，在 `main` 侧建立窗口 / 标签真值与 workspace snapshot 契约。
- `src/main/main.ts` 已接入 workspace service、窗口注册 / 注销、workspace IPC，以及 `File > New Window` 菜单命令。
- `src/preload/preload.ts` 与 `src/renderer/types.d.ts` 已暴露 `getWorkspaceSnapshot`、`createWorkspaceTab`、`openWorkspaceFile`、`openWorkspaceFileFromPath`、`activateWorkspaceTab`、`updateWorkspaceTabDraft`。
- `src/main/main.ts`、`src/shared/workspace.ts` 与 `src/main/workspace-service.ts` 已补齐标签关闭、排序、跨窗口 move 与拖出成新窗口的 workspace 原语；已有 workspace 窗口时，外部打开 / 拖入文件默认走当前窗口标签流，不再走“已有文档就新开窗口”的旧分支。
- `src/renderer/document-state.ts` 与 `src/renderer/editor/App.tsx` 已从单一 `currentDocument` 迁移到“标签栏 + 活动标签编辑器”主链，当前支持多标签新建 / 打开 / 切换 / 关闭、标签排序与拖出成新窗口，以及活动标签草稿同步回 `main`。
- `autosave`、手动保存与外部文件冲突当前先继续围绕活动标签工作；已补齐 main / preload / renderer / test-workbench 相关测试，并同步更新 backlog、progress、test-report、decision-log、test-cases 与 task summary。
- follow-up 修补：外部文件冲突 banner 的“重载磁盘版本”改为复用当前 `tabId` 就地换入磁盘内容，不再额外追加同路径标签；窗口外一次拖入多个 Markdown 文件时会按顺序追加多个标签页。
- follow-up 修补：主进程文件 watcher 现在会屏蔽当前活动文件由应用自身保存触发的写回事件，避免一编辑或 autosave 后立刻误报“当前文件已被外部修改”。

## 落点文件

- `src/shared/workspace.ts`
- `src/main/workspace-service.ts`
- `src/main/workspace-service.test.ts`
- `src/main/main.ts`
- `src/main/main.test.ts`
- `src/main/application-menu.ts`
- `src/main/application-menu.test.ts`
- `src/preload/preload.ts`
- `src/preload/preload.contract.test.ts`
- `src/preload/preload.test.ts`
- `src/renderer/document-state.ts`
- `src/renderer/document-state.test.ts`
- `src/renderer/editor/App.tsx`
- `src/renderer/editor-test-driver.ts`
- `src/renderer/editor-test-driver.test.ts`
- `src/renderer/app.autosave.test.ts`
- `src/renderer/test-workbench.test.tsx`
- `src/renderer/styles/app-ui.css`
- `src/renderer/types.d.ts`
- `MVP_BACKLOG.md`
- `docs/acceptance.md`
- `docs/test-cases.md`
- `docs/test-report.md`
- `docs/decision-log.md`
- `docs/progress.md`
- `reports/task-summaries/TASK-043.md`

## 本轮验证

- `npm run test -- src/main/workspace-service.test.ts src/preload/preload.contract.test.ts src/preload/preload.test.ts src/main/application-menu.test.ts src/main/main.test.ts src/renderer/document-state.test.ts src/renderer/editor-test-driver.test.ts src/renderer/app.autosave.test.ts src/renderer/test-workbench.test.tsx`
- `npm run test -- src/renderer/app.autosave.test.ts src/main/workspace-service.test.ts src/preload/preload.contract.test.ts src/renderer/test-workbench.test.tsx`
- `npm run test -- src/main/external-file-watch-service.test.ts src/renderer/app.autosave.test.ts src/main/workspace-service.test.ts src/preload/preload.contract.test.ts src/renderer/test-workbench.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

## 当前已交付能力

- 当前窗口可以持有多个 Markdown 标签页，且活动标签切换会驱动唯一的活动编辑器实例切换内容。
- `File > New` 会在当前窗口创建新的未保存标签页。
- `File > Open...`、拖入文件与外部打开文件会在当前窗口追加新标签，而不是替换已有文档或默认新开窗口。
- 活动标签编辑后的 dirty 状态会同步到标签栏；保存、另存为、autosave 与外部文件 watcher 都已按活动 `tabId` 工作。
- 当前活动文件由应用自身保存或 autosave 触发的写盘，不会再被 watcher 误判成外部修改并弹冲突提示。
- 外部文件冲突时，“重载磁盘版本”会在当前标签内就地换入磁盘内容，不会再复制出同路径新标签。
- 从系统资源管理器一次拖入多个 Markdown 文件时，会在当前窗口按顺序追加多个标签页。
- 标签可以在当前窗口内排序、关闭，并可拖出成新窗口；关闭单个标签与关闭窗口时都会按窗口标签序列处理未保存状态。
- 同路径 reload 成功后会清掉外部文件冲突提示；已加载过的非活动标签 payload 不会被后续 strip-only snapshot 错误清空。

## 后续可选 Follow-up

1. 如果产品仍要求“直接拖进另一个已打开窗口”，可在现有 shared/main/preload cross-window move 原语之上补 renderer drop target 交互。
2. 如后续要做会话恢复，可在现有 workspace snapshot / tab session 基础上继续叠加窗口 / 标签持久化，而不必回退当前架构。

## 已知风险与未做项

- 当前 `WorkspaceWindowSnapshot` 只有 `activeDocument` 携带完整正文；inactive tab 仍只保留 strip metadata，因此 renderer 只能保住“已加载过的标签正文”，不能凭空还原从未激活过的标签内容。
- shared/main/preload 已有 cross-window move 原语，但 renderer 侧还没有“直接拖进另一个已打开窗口”的 drop target 交互；当前用户可用路径是“拖出成新窗口”。
