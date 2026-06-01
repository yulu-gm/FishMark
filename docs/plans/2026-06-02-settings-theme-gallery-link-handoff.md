# Settings Theme Gallery Link Handoff

## 改了什么

- 在设置页主题包选择区域下方加入“打开主题页面”链接，目标为 `https://yulu-gm.github.io/fishmark-themes/`。
- 链接点击通过 `WorkspaceShell` 传入的 `onOpenExternalLink` 走现有安全外链打开流程。
- 为链接增加 settings 专用样式，并补充 renderer 测试覆盖点击路由。

## 落点文件

- `src/renderer/editor/settings-view.tsx`
- `src/renderer/editor/WorkspaceShell.tsx`
- `src/renderer/styles/settings.css`
- `src/renderer/app.autosave.test.ts`

## 已跑验证

- `npm.cmd run test -- src/renderer/app.autosave.test.ts -t "hosted theme gallery"`：通过
- `npm.cmd run test -- src/renderer/app.autosave.test.ts -t "settings"`：通过
- `npm.cmd run typecheck`：通过
- `npm.cmd run lint`：通过
- `npm.cmd run build`：通过

## 人工验收草稿

1. 启动 FishMark，打开设置页。
2. 停留在默认的“外观 / 主题”设置分区。
3. 确认主题包选择控件下方显示“打开主题页面”。
4. 点击该链接，确认系统浏览器打开 `https://yulu-gm.github.io/fishmark-themes/`。
5. 返回设置页，确认“刷新主题”和“打开主题目录”仍可正常点击。

## 已知风险或未做项

- 未新增主题下载或安装流程；本轮只嵌入外部主题页面入口。
- 本轮不是 backlog 编号任务，未更新 `MVP_BACKLOG.md`、`docs/progress.md` 或 task summary。
