# update-notes-dialog

结果：PASS

## 完成内容

- 自动更新下载完成后的原生安装确认弹窗现在会显示本次更新内容。
- `releaseNotes` 支持字符串和 full changelog 数组两种 `electron-updater` payload。
- Markdown 风格正文会被清洗成系统弹窗可读纯文本，包含标题、链接、加粗、斜体、行内代码、HTML tag 和 `<br>` 的基础处理。
- release notes 缺失或为空时保留原有版本安装兜底文案。
- 补充了 packaging 说明和 `TC-070C` 人工验收场景。

## 验证

- `npm.cmd run test -- src/main/app-updater.test.ts`：通过，1 个文件 9 项。
- `npm.cmd run lint`：通过。
- `npm.cmd run typecheck`：通过。
- `npm.cmd run test`：通过，110 个文件 1213 项。
- `npm.cmd run build`：通过。
- `git diff --check`：通过，仅输出 Windows LF/CRLF warning。

## 人工验收

1. 安装一个低于 GitHub latest release 的 Windows 安装版 FishMark。
2. 确认 GitHub latest release 正文包含“本次更新”及至少一条面向用户的更新内容。
3. 启动旧版本，等待自动检查并下载更新；或通过 `Help > Check for Updates` 手动触发。
4. 等待下载完成后观察系统安装确认弹窗。
5. 确认弹窗详情区域显示目标版本号和本次更新内容。
6. 点击“稍后”，确认应用继续正常运行。
7. 再次触发或等待更新弹窗，点击“立即重启更新”，确认继续现有安装流程。

## 剩余风险或未覆盖项

- 本轮没有实际创建 GitHub Release 或安装旧版本做端到端升级；真实安装升级链路需要按 `TC-070C` 人工验收。
- 原生系统弹窗只支持纯文本展示，不渲染 Markdown 样式。
- 本轮是无编号 UI polish，未更新 `MVP_BACKLOG.md` 或 `docs/progress.md`。
