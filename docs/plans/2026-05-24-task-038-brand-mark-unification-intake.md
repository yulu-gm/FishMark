# TASK-038 品牌 Mark 统一 Intake

## 背景

用户发现桌面图标、`assets/branding` 中的 SVG 与 welcome 空状态 mark 不是同一套视觉。当前 welcome mark 更符合 FishMark 的安静编辑器气质，希望以它为准统一品牌形状。

## 初步定位

- 桌面 / 打包图标由 `scripts/generate-icons.mjs` 从 `assets/branding/fishmark_logo_light.svg` / `fishmark_logo_dark.svg` 生成。
- welcome 空状态在 `src/renderer/editor/WorkspaceShell.tsx` 内联维护一份 SVG path。
- 两条链路各自维护形状，导致品牌样式分叉。

## 本轮范围

- 新增共享 FishMark mark SVG 作为形状源。
- welcome 空状态复用共享 SVG，不再内联维护第二份 path。
- icon 生成器从共享 SVG 生成 light / dark 图标。
- 生成图标不沿用 welcome 的淡灰语气，改为高对比 light / dark 配色。
- 更新相关测试和打包说明。

## 不做

- 不改打包架构、版本号或 release 流程。
- 不执行正式 Windows / macOS release。
- 不把 `TASK-038` 整体标为完成。
