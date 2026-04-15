# TASK-032 App Shell Menu Design

## Scope

Task: `TASK-032`
Goal: 把当前临时开发壳调整为更像桌面编辑器的单栏界面，并把 `Open / Save / Save As` 接入应用 `File` 菜单。
In scope:
- 在 `main` 中定义最小应用菜单，提供 `Open...`、`Save`、`Save As...`
- 通过安全 `preload` 事件把菜单命令传到 `renderer`
- 在 `renderer` 复用现有打开/保存链路响应菜单命令
- 收敛当前页面视觉，去掉 demo 卡片感和顶部保存按钮
Out of scope:
- 自定义标题栏
- 最近文件
- 原生菜单之外的更多桌面集成
- Typora 式块级渲染

## Approach

这次不把保存逻辑搬回 `renderer` 或重复实现主进程写文件能力，而是保持当前边界：

1. `main` 负责定义菜单和发出菜单命令
2. `preload` 只暴露有限订阅接口
3. `renderer` 继续维护文档状态，并复用已有 `openMarkdownFile` / `saveMarkdownFile` / `saveMarkdownFileAs` bridge

这样可以满足“菜单属于桌面壳”的产品预期，同时不打破 `TASK-003` / `TASK-004` 已建立的文件读写边界。

## Data Flow

### Open / Save / Save As from Menu

1. 用户点击 `File` 菜单中的 `Open...`、`Save` 或 `Save As...`
2. `main` 通过窗口 `webContents.send()` 发送受限菜单命令
3. `preload` 监听命令 channel，并通过 `window.yulora.onMenuCommand()` 暴露给 `renderer`
4. `renderer` 调用现有处理函数
5. 文件对话框和写盘仍通过已有 bridge 回到 `main`

## UI Direction

- 改成顶部轻量文档栏 + 中央编辑器版心
- 不再使用居中大卡片和大号 CTA
- `Open` 不再作为醒目 hero 按钮长期存在
- 文档名称、路径、保存状态保留，但更像编辑器状态区

## Acceptance

- Windows/macOS 默认菜单中的 `File` 可触发 `Open...`、`Save`、`Save As...`
- 页面不再呈现 marketing/demo 卡片感
- 现有打开、编辑、保存、另存为行为保持可用
