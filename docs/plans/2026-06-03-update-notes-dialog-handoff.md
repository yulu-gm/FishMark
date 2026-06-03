# Update Notes Dialog Handoff

Task: update-notes-dialog

## 改了什么

- 在 `src/main/app-updater.ts` 中为自动更新确认安装弹窗增加 release notes detail。
- 支持 `electron-updater` 返回的字符串 `releaseNotes` 和 full changelog 数组。
- 将 Markdown 标题、链接、加粗、斜体、行内代码、HTML tag 和 `<br>` 清洗为系统弹窗可读纯文本。
- 在 `update-available` 已带 release notes、`update-downloaded` 未带 release notes 时保留前者作为兜底。
- release notes 缺失或为空时继续显示原有 `FishMark <version> 已准备好安装。`。
- 在 `docs/packaging.md` 记录 release metadata body 会影响客户端更新确认弹窗。
- 在 `docs/test-cases.md` 增加 Windows 自动更新确认弹窗更新内容人工验收场景。

## 落点文件

- `src/main/app-updater.ts`
- `src/main/app-updater.test.ts`
- `docs/packaging.md`
- `docs/test-cases.md`
- `docs/plans/2026-06-03-update-notes-dialog-intake.md`

## 推荐验证命令

- `npm.cmd run test -- src/main/app-updater.test.ts`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `git diff --check`

## 人工验收草稿

1. 安装一个低于 GitHub latest release 的 Windows 安装版 FishMark。
2. 确认 latest release 正文包含“本次更新”和至少一条用户可读更新内容。
3. 启动旧版本，等待自动更新下载完成，或通过 `Help > Check for Updates` 手动触发。
4. 在“安装更新”系统弹窗中确认详情区域显示目标版本号和本次更新内容。
5. 先点“稍后”，确认应用继续运行。
6. 下一次出现弹窗时点“立即重启更新”，确认继续现有安装流程。

## 已知风险或未做项

- 本轮没有实际发布新 GitHub Release 或安装旧版本客户端做端到端升级；真实升级链路仍需按 `TC-070C` 人工验收。
- 原生系统弹窗只显示纯文本，不渲染 Markdown 样式；这是本轮确认过的取舍。
- 本轮不是 backlog 编号任务，未更新 `MVP_BACKLOG.md` 或 `docs/progress.md`。
