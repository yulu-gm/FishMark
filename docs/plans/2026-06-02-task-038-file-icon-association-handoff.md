# TASK-038 Markdown 文件图标接入 Handoff

## 改了什么

- 新增 `assets/branding/fishmark_file_icon.svg` 作为独立 Markdown 文件图标源。
- 扩展 `scripts/generate-icons.mjs`，在应用主图标之外生成 `build/icons/file/` 下的文件图标 PNG、Windows `.ico` 与 macOS `.icns`。
- 文件图标 PNG 额外生成 1024px；`.icns` 写入 `icp4/icp5/icp6/ic07/ic08/ic09/ic10/ic11/ic12/ic13/ic14` 条目，覆盖常用与 Retina 尺寸。
- 在 `electron-builder.json` 中为 Windows 与 macOS `.md` / `.markdown` 文件关联指定 `icons/file/markdown`，Windows 解析为 `.ico`，macOS 解析为 `.icns`。
- 补充 `src/main/generate-icons.test.ts` 与 `src/main/package-scripts.test.ts` 回归，锁定生成物与打包配置。
- 同步 `MVP_BACKLOG.md`、打包说明、测试用例、决策记录、进度记录与 TASK-038 summary。

## 落点文件

- `assets/branding/fishmark_file_icon.svg`
- `scripts/generate-icons.mjs`
- `electron-builder.json`
- `src/main/generate-icons.test.ts`
- `src/main/package-scripts.test.ts`
- `MVP_BACKLOG.md`
- `docs/packaging.md`
- `docs/test-cases.md`
- `docs/decision-log.md`
- `docs/progress.md`
- `docs/test-report.md`
- `reports/task-summaries/TASK-038.md`

## 已跑验证

- `npm.cmd run test -- src/main/generate-icons.test.ts src/main/package-scripts.test.ts`：先失败后通过。
- `npm.cmd run test -- src/main/generate-icons.test.ts src/main/package-scripts.test.ts src/main/after-pack-win-icon.test.ts src/main/build-win-release.test.ts src/main/build-mac-release.test.ts`：通过，5 个文件、57 项。
- `npm.cmd run generate:icons`：通过，已生成 `build/icons/file/markdown.ico` 与 `markdown.icns`。
- `npm.cmd run lint`：通过。
- `npm.cmd run typecheck`：通过。
- `git diff --check`：通过，仅有 Windows LF/CRLF 提示。
- `npm.cmd run build`：通过。
- `npm.cmd run test`：通过，106 个文件、1175 项。
- `npm.cmd run package:win`：通过，生成 `release/FishMark-Setup-0.2.8.exe`。

## 额外检查

- 已查看 `build/icons/file/icon-256.png`，图标为纸张 + 居中浅色系 FishMark logo。
- `build/icons/file/markdown.ico` 尺寸：`16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256`。
- `build/icons/file/markdown.icns` 条目：`icp4, icp5, icp6, ic07, ic08, ic09, ic10, ic11, ic12, ic13, ic14`。
- `release/win-unpacked/resources/icons/file/markdown.ico` 与 `markdown.icns` 均存在，尺寸/条目同上。

## 人工验收草稿

1. 安装或覆盖安装 `release/FishMark-Setup-0.2.8.exe`。
2. 将 FishMark 设为 `.md` / `.markdown` 文件打开方式。
3. 在 Windows 文件管理器中切换不同图标大小，确认 Markdown 文件显示纸张形态的专用图标，中心 logo 居中且清晰。
4. 双击 `.md` 文件，确认 FishMark 正常打开文档。
5. 在 macOS host 上运行 `npm run package:mac`，检查 `.app/Contents/Resources/markdown.icns` 并用 Finder 验证 `.md` / `.markdown` 文件关联图标。

## 已知风险或未做项

- Windows Explorer 可能缓存旧文件关联图标；覆盖安装后可能需要重新关联或刷新 icon cache 才能看到新图标。
- 本轮只在 Windows host 上完成 Windows package 验证；macOS Finder 图标还需要在 macOS 上做人工验收。
- 应用主图标仍未单独生成 `.icns`，本轮 `.icns` 只覆盖 Markdown 文件关联图标。
