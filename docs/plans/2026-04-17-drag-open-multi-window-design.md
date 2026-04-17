# 拖拽打开 Markdown 多窗口设计

## 目标

让用户把 `.md` 文件拖入 Yulora 窗口时获得稳定、可预测的行为：

- 当前窗口为空工作区时，在当前窗口打开文件
- 当前窗口已存在文档时，新开一个受控编辑器窗口打开文件
- 不再出现 Chromium 直接导航到 `file://...` 或开发版拖拽时启动第二个独立实例的情况

## 约束

- 保持 `main`、`preload`、`renderer` 分层
- 不向 `renderer` 暴露不受限制的窗口管理能力
- 拖拽打开只支持 Markdown 文件，非 Markdown 文件应被忽略且不得触发默认导航
- 开发版和打包版都应沿用同一套拖拽打开语义

## 方案

### 1. 开发版也启用单实例锁

开发版已经使用独立的应用名和 `userData` 路径，因此可以安全申请单实例锁。这样系统把文件投递给应用时，会回到当前主进程，而不是再起一个新的 `Dev_app` 进程。

### 2. 在主进程窗口层阻断默认导航和异常新窗

为每个编辑器窗口注册：

- `webContents.on("will-navigate")`：阻断窗口被拖入文件或外部链接直接导航
- `webContents.setWindowOpenHandler(() => ({ action: "deny" }))`：阻断 Chromium 默认弹窗

这层保护用于兜底，不依赖 renderer 是否先拦到事件。

### 3. 由 renderer 捕获拖拽，再由 main 决定开窗策略

renderer 继续在窗口级捕获 `dragover` / `drop`，阻止默认行为，并提取被拖入的 Markdown 路径。随后通过一个新的受限 IPC 把以下信息发给主进程：

- `targetPath`
- `hasOpenDocument`

主进程返回结构化结果：

- `open-in-place`
- `opened-in-new-window`

其中：

- `hasOpenDocument === false`：返回 `open-in-place`，renderer 再走现有 `openMarkdownFileFromPath()`
- `hasOpenDocument === true`：主进程直接 `openEditorWindow({ startupOpenPath })`，并返回 `opened-in-new-window`

### 4. “是否已有文档”的判定

本次实现以 renderer 当前是否存在 `currentDocument` 为准。这样可以保护已打开文件和未保存的临时文档，避免拖拽新文件时覆盖当前编辑状态。

## 测试

- `src/main/runtime-environment.test.ts`
  - 开发版也应申请单实例锁
- `src/main/runtime-windows.test.ts`
  - 新窗口应注册导航/弹窗保护
- `src/preload/preload.contract.test.ts`
  - 新拖拽 IPC 使用共享 channel 常量
- `src/renderer/app.autosave.test.ts`
  - 空工作区拖入 Markdown 时在当前窗口打开
  - 已有文档时拖入 Markdown，会请求主进程开新窗口

