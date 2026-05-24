# TASK-038 品牌 Mark 统一 Handoff

## 改了什么

- 新增 `assets/branding/fishmark_mark.svg` 作为 FishMark 共享品牌形状源。
- 将 welcome 空状态从内联 SVG path 改为读取共享 mark SVG。
- 将 `scripts/generate-icons.mjs` 改为从共享 mark SVG 生成 light / dark 图标。
- 生成图标使用高对比配色：light 为深色圆与亮色鱼形，dark 为亮色圆与深色鱼形；welcome 仍由主题 CSS 控制为淡色。
- 更新 `fishmark_logo_light.svg` / `fishmark_logo_dark.svg` 为同一形状的展示变体。
- 补充回归，覆盖共享 mark 源、welcome 复用共享 SVG、light 图标高对比填充。
- 更新打包说明、进度记录和 TASK-038 summary，避免继续描述旧的黑色鱼身方案。

## 落点文件

- `assets/branding/fishmark_mark.svg`
- `assets/branding/fishmark_logo_light.svg`
- `assets/branding/fishmark_logo_dark.svg`
- `scripts/generate-icons.mjs`
- `src/main/generate-icons.test.ts`
- `src/renderer/editor/WorkspaceShell.tsx`
- `src/renderer/editor/WorkspaceShell.test.tsx`
- `src/renderer/styles/app-ui.css`
- `docs/packaging.md`
- `docs/progress.md`
- `reports/task-summaries/TASK-038.md`

## 推荐验证命令

- `npm.cmd run test -- src/main/generate-icons.test.ts`
- `npm.cmd run test -- src/renderer/editor/WorkspaceShell.test.tsx`
- `npm.cmd run test -- src/main/generate-icons.test.ts src/main/package-scripts.test.ts src/main/after-pack-win-icon.test.ts src/renderer/editor/WorkspaceShell.test.tsx`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`

## 已跑验证

- `npm.cmd run test -- src/main/generate-icons.test.ts`：先失败后通过。
- `npm.cmd run test -- src/renderer/editor/WorkspaceShell.test.tsx`：先失败后通过。
- `npm.cmd run test -- src/main/generate-icons.test.ts src/main/package-scripts.test.ts src/main/after-pack-win-icon.test.ts src/renderer/editor/WorkspaceShell.test.tsx`：通过，4 个文件、38 项。
- `npm.cmd run lint`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过。
- `npm.cmd run generate:icons`：通过，已刷新本地 `build/icons`。
- 已查看 `build/icons/light/icon-512.png` 与 `build/icons/dark/icon-512.png`：形状与 welcome 一致，生成图标使用高对比反色方案。

## 人工验收草稿

1. 打开 welcome 空状态，确认 mark 仍是原 welcome 视觉。
2. 查看 `build/icons/light/icon-512.png`，确认使用同款鱼形，且不是淡灰图标。
3. 在 Windows 桌面或开始菜单刷新 FishMark 快捷方式图标后，确认 light 图标为深色圆与亮色鱼形。

## 已知风险或未做项

- Windows 仍可能缓存旧快捷方式图标，需要刷新图标缓存或重建快捷方式后验收。
- 本轮未生成 macOS `.icns`，也未执行正式 release。
