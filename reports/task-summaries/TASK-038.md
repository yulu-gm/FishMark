# TASK-038 跨平台打包

## 当前状态

状态：DEV_IN_PROGRESS

本轮结果：PASS（icon-refresh 子切片）；2026-05-24 追加品牌 mark 统一 follow-up

`TASK-038` 仍是跨平台打包大任务；图标链路已追加统一到 welcome mark 形状，但不把整个跨平台打包任务标为完成。

## 本轮完成内容

- 2026-05-24 follow-up：新增 `assets/branding/fishmark_mark.svg` 作为共享形状源，welcome 空状态与 icon 生成器复用同一份形状。
- 2026-05-24 follow-up：生成图标不沿用 welcome 的淡灰语气；light 输出为深色圆与亮色鱼形，dark 输出为亮色圆与深色鱼形。
- 原 icon-refresh 子切片修复了 `.ico` 小尺寸缺失问题；2026-05-24 follow-up 保留尺寸集合，并将鱼形区域改为反色高对比填充，避免桌面背景透进鱼形。
- light 图标当前为深色圆与亮色鱼形，dark 图标当前为亮色圆与深色鱼形。
- 扩展 icon 生成尺寸：PNG 输出 `16/24/32/48/64/128/256/512`，Windows `.ico` 内嵌 `16/24/32/48/64/128/256`。
- 补充 `src/main/generate-icons.test.ts` 回归，覆盖 `.ico` 尺寸集合与 light 图标中心黑色像素。
- 已重新生成本地 `build/icons`，并重新产出 Windows package。

## 验证

- `npm.cmd run test -- src/main/generate-icons.test.ts`：2026-05-24 follow-up 先失败后通过，覆盖共享 mark 源与 light 图标高对比像素。
- `npm.cmd run test -- src/renderer/editor/WorkspaceShell.test.tsx`：2026-05-24 follow-up 先失败后通过，覆盖 welcome mark 复用共享 SVG 形状。
- `npm.cmd run test -- src/main/generate-icons.test.ts`：先失败后通过。
- `npm.cmd run test -- src/main/generate-icons.test.ts src/main/package-scripts.test.ts src/main/after-pack-win-icon.test.ts`：通过，3 个文件、34 项。
- `npm.cmd run lint`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run build`：通过，保留既有 Vite chunk size warning。
- `npm.cmd run package:win`：通过，生成 `release/FishMark-Setup-0.2.4.exe`，并 patch `release/win-unpacked/FishMark.exe` 图标。

## 人工验收

1. 安装或覆盖安装 `release/FishMark-Setup-0.2.4.exe`。
2. 在桌面快捷方式或开始菜单中切换不同图标大小。
3. 确认 FishMark 图标使用 welcome 同款鱼形，light 图标为深色圆与亮色鱼形。
4. 确认桌面常用图标大小下不再明显发糊。

## 剩余风险

- Windows 可能缓存旧快捷方式图标；若覆盖安装后仍看到旧图标，需要刷新图标缓存或重新创建快捷方式再验收。
- macOS `.icns` 仍不在本轮范围内。
