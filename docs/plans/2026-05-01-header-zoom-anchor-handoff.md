# Handoff: header-zoom-anchor

日期：2026-05-01

## 改了什么

- 在 `.app-header` 上显式设置 `justify-self: start` 和 `margin: 0`，覆盖 `.app-header, .error-banner` 的共享居中规则。
- 在 `src/renderer/app.autosave.test.ts` 中新增 CSS 合约测试，防止 workspace header 在宽屏 / 放大时再次被居中。

## 落点文件

- `src/renderer/styles/app-ui.css`
- `src/renderer/app.autosave.test.ts`

## 根因

`.app-header` 与 `.error-banner` 共用 `width: min(100%, var(--fishmark-workspace-max-width)); margin: 0 auto;`。宽屏或页面放大后，workspace 可用宽度变化会让 header 继续按自身 max-width 居中，视觉上离开 workspace 左上角。

## 推荐验证命令

- `npm.cmd run test -- src/renderer/app.autosave.test.ts`
- `npm.cmd run test`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`

## 人工验收草稿

1. 打开 FishMark 并打开 `README.md`。
2. 放大窗口或使用页面缩放到约 150%。
3. 确认顶部文档 header 仍贴在 workspace 左上角，没有漂到页面中间。
4. 切换阅读 / 编辑状态，确认 reading mode 下隐藏 chrome 的行为未变化。

## 已知风险或未做项

- `git diff --check` 的全仓检查仍会报 `tmp/test.md` 的既有尾随空格；本轮改动文件的 diff-check 已通过。
