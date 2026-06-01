# TASK-038 Markdown 文件图标接入 Intake

Task: TASK-038
Date: 2026-06-02

## 背景

用户已确认 Markdown 文件图标采用纸张形态，并要求中心 logo 使用现有浅色系 app icon SVG 方案。文件图标需要和 FishMark 应用主图标分离，接入 Windows / macOS 文件关联，而不是只停留在预览 SVG。

## 范围

- 新增已确认的文件图标源：`assets/branding/fishmark_file_icon.svg`。
- 扩展 `scripts/generate-icons.mjs`，在现有 app icon 生成之外产出 Markdown 文件图标 PNG / ICO / ICNS。
- 在 `electron-builder.json` 中为 Windows 与 macOS `.md` / `.markdown` 文件关联声明专用文件图标。
- 补充生成脚本与打包配置回归测试。
- 同步 TASK-038 文档、测试用例、进度与任务总结。

## 非范围

- 不改变应用主图标默认目录，仍使用视觉浅色系的 `build/icons/dark/`。
- 不执行正式 GitHub Release。
- 不调整 Windows installer wizard 视觉。

## 验收关注

- `npm run generate:icons` 生成 `build/icons/file/markdown.ico` 与 `build/icons/file/markdown.icns`。
- Windows file association 使用 `.ico`，macOS file association 使用 `.icns`。
- 打包产物携带 `resources/icons/file/markdown.ico` 与 `resources/icons/file/markdown.icns`。
- 文件图标视觉为纸张 + 居中的浅色系 FishMark logo。
