<p align="center">
  <img src="assets/branding/yulora_logo_light.svg" alt="Yulora logo" width="160">
</p>

# Yulora

Yulora 是一个面向 macOS 和 Windows 的本地优先 Markdown 桌面编辑器，目标是提供类似 Typora 的单栏写作体验，同时保持 Markdown 文本作为唯一事实来源。

当前仓库处于 MVP 推进阶段，重点放在稳定的编辑体验而不是功能堆叠：IME、光标映射、撤销重做语义、自动保存安全性，以及 Markdown 往返保真优先于花哨能力。

## 当前能力

- 打开 Markdown 文件
- 保存 / 另存为 / 自动保存
- 基于 CodeMirror 6 的单栏编辑体验
- 基于块的 Markdown 视图切换
- 标题、段落、列表、任务列表、引用块等基础渲染
- 原生菜单命令接入
- 测试工作台与 CLI 场景运行入口

## 技术栈

- Electron
- React
- TypeScript
- CodeMirror 6
- micromark
- Vite
- Vitest

## 快速开始

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run dev                 # 启动桌面应用开发环境
npm run dev:test-workbench  # 启动测试工作台
npm run build               # 构建 renderer / electron / cli
npm run lint                # ESLint
npm run typecheck           # TypeScript 检查
npm run test                # Vitest
npm run test:scenario -- --id app-shell-startup
npm run package:win         # 打包 Windows 安装产物
```

## 目录结构

- `src/main/`：Electron main 进程、菜单、窗口与文件系统入口
- `src/preload/`：受限 bridge 和 IPC 暴露
- `src/renderer/`：React UI、编辑器视图、测试工作台界面
- `packages/editor-core/`：编辑器状态与纯逻辑
- `packages/markdown-engine/`：Markdown 解析与 block map
- `packages/test-harness/`：场景注册表、CLI 与测试运行基础设施
- `docs/`：设计、计划、验收与进展文档

## 开发原则

- Markdown 文本是唯一事实来源
- 优先 WYSIWYM，而不是完整 WYSIWYG
- 严格分离 `main / preload / renderer`
- 不向 renderer 暴露不受限制的 Node API
- 保存时避免自动重排整个文档

更多背景可参考 `docs/design.md` 和 `MVP_BACKLOG.md`。
