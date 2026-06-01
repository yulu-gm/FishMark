# TASK-038 跨平台打包

## 当前状态

状态：DEV_IN_PROGRESS

本轮结果：PASS（icon-refresh 子切片）；2026-05-24 追加品牌 mark 统一 follow-up；2026-06-02 追加 Markdown 文件图标接入 follow-up

`TASK-038` 仍是跨平台打包大任务；图标链路已追加统一到 welcome mark 形状，并接入独立 Markdown 文件图标，但仍保留跨平台安装/启动冒烟作为后续验收项。

## 本轮完成内容

- 2026-05-24 follow-up：新增 `assets/branding/fishmark_mark.svg` 作为共享形状源，welcome 空状态与 icon 生成器复用同一份形状。
- 2026-05-24 follow-up：生成图标不沿用 welcome 的淡灰语气；light 输出为深色圆与亮色鱼形，dark 输出为亮色圆与深色鱼形。
- 原 icon-refresh 子切片修复了 `.ico` 小尺寸缺失问题；2026-05-24 follow-up 保留尺寸集合，并将鱼形区域改为反色高对比填充，避免桌面背景透进鱼形。
- light 图标当前为深色圆与亮色鱼形，dark 图标当前为亮色圆与深色鱼形。
- 扩展 icon 生成尺寸：PNG 输出 `16/24/32/48/64/128/256/512`，Windows `.ico` 内嵌 `16/24/32/48/64/128/256`。
- 补充 `src/main/generate-icons.test.ts` 回归，覆盖 `.ico` 尺寸集合与 light 图标中心黑色像素。
- 已重新生成本地 `build/icons`，并重新产出 Windows package。
- 2026-06-02 follow-up：新增 `assets/branding/fishmark_file_icon.svg` 作为 Markdown 文件图标源，文件图标与应用主图标分离。
- 2026-06-02 follow-up：`generate:icons` 现在生成 `build/icons/file/icon-{16,24,32,48,64,128,256,512,1024}.png`、`markdown.ico` 与 `markdown.icns`，`.icns` 包含常用与 Retina 条目。
- 2026-06-02 follow-up：`electron-builder.json` 中 Windows 与 macOS `.md` / `.markdown` 文件关联统一指向 `icons/file/markdown`，由 electron-builder 分别解析为 `.ico` / `.icns`。

## 验证

- `npm.cmd run test -- src/main/generate-icons.test.ts`：2026-05-24 follow-up 先失败后通过，覆盖共享 mark 源与 light 图标高对比像素。
- `npm.cmd run test -- src/renderer/editor/WorkspaceShell.test.tsx`：2026-05-24 follow-up 先失败后通过，覆盖 welcome mark 复用共享 SVG 形状。
- `npm.cmd run test -- src/main/generate-icons.test.ts`：先失败后通过。
- `npm.cmd run test -- src/main/generate-icons.test.ts src/main/package-scripts.test.ts src/main/after-pack-win-icon.test.ts`：通过，3 个文件、34 项。
- `npm.cmd run lint`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过，保留既有 Vite chunk size warning。
- `npm.cmd run package:win`：通过，生成 `release/FishMark-Setup-0.2.4.exe`，并 patch `release/win-unpacked/FishMark.exe` 图标。
- `npm.cmd run test -- src/main/generate-icons.test.ts src/main/package-scripts.test.ts`：2026-06-02 follow-up 先失败后通过，RED 阶段确认生成器缺少 `fishmark_file_icon.svg` 源、Windows file association 缺失、macOS file association 未指定 icon。
- `npm.cmd run test -- src/main/generate-icons.test.ts src/main/package-scripts.test.ts src/main/after-pack-win-icon.test.ts src/main/build-win-release.test.ts src/main/build-mac-release.test.ts`：通过，5 个文件、57 项。
- `npm.cmd run generate:icons`：通过，生成 `build/icons/file/markdown.ico` 与 `build/icons/file/markdown.icns`；`.ico` 尺寸为 `16/24/32/48/64/128/256`，`.icns` 条目为 `icp4/icp5/icp6/ic07/ic08/ic09/ic10/ic11/ic12/ic13/ic14`。
- `npm.cmd run lint`：通过。
- `npm.cmd run typecheck`：通过。
- `git diff --check`：通过，仅保留 Windows 工作区 LF/CRLF 提示。
- `npm.cmd run build`：通过。
- `npm.cmd run test`：通过，106 个文件、1175 项。
- `npm.cmd run package:win`：通过，生成 `release/FishMark-Setup-0.2.8.exe`，打包产物包含 `release/win-unpacked/resources/icons/file/markdown.ico` 与 `markdown.icns`。

## 人工验收

1. 安装或覆盖安装 `release/FishMark-Setup-0.2.8.exe`。
2. 在桌面快捷方式或开始菜单中切换不同图标大小。
3. 确认 FishMark 图标使用 welcome 同款鱼形，light 图标为深色圆与亮色鱼形。
4. 确认桌面常用图标大小下不再明显发糊。
5. 将 FishMark 设为 `.md` / `.markdown` 文件打开方式，确认 Markdown 文件显示纸张形态的专用文件图标。

## 剩余风险

- Windows 可能缓存旧快捷方式图标；若覆盖安装后仍看到旧图标，需要刷新图标缓存或重新创建快捷方式再验收。
- Windows 文件关联图标也可能受 Explorer icon cache 影响，覆盖安装后可能需要重新关联或刷新缓存才能看到新文件图标。
- macOS 文件关联图标已生成 `.icns` 并写入配置，但本轮运行环境是 Windows，仍需在 macOS host 上执行 `npm run package:mac` 与 Finder 人工验收。
- 应用主图标仍未单独生成 `.icns`；当前变化只覆盖 Markdown 文件关联图标的 `.icns`。
