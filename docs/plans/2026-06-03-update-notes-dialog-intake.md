# Update Notes Dialog Intake

Task: update-notes-dialog

Goal: 在应用自动更新下载完成后的确认安装界面显示本次更新内容，让用户在选择“立即重启更新 / 稍后”前能看到 release notes。

In scope:
- 复用现有 main 进程原生 `dialog.showMessageBox` 更新确认框。
- 从 `electron-updater` 的 `update-available` / `update-downloaded` payload 中读取可选 `releaseNotes`。
- 将 Markdown 风格 release notes 清洗为适合系统弹窗 `detail` 的纯文本。
- 在没有 release notes 时保留现有版本提示兜底。
- 补充 `src/main/app-updater.test.ts` 回归覆盖。

Out of scope:
- 不新增 renderer 自定义更新弹窗。
- 不新增更新中心、Release 链接跳转或独立 changelog 页面。
- 不改变自动更新启用条件、下载进度状态条、发布脚本或 GitHub Release 上传流程。

Landing area:
- `src/main/app-updater.ts`
- `src/main/app-updater.test.ts`
- `docs/packaging.md`
- `docs/test-cases.md`
- `docs/test-report.md`
- `reports/task-summaries/update-notes-dialog.md`

Acceptance:
- `update-downloaded` payload 带字符串 release notes 时，安装确认弹窗 `detail` 包含版本号和清洗后的更新内容。
- release notes 为 full changelog 数组时，弹窗能显示各版本对应内容。
- `update-downloaded` 没有 release notes 时，弹窗继续显示现有版本安装提示。
- 现有自动更新状态流、下载进度状态条、立即安装行为不回归。

Verification:
- `npm.cmd run test -- src/main/app-updater.test.ts`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`

Risks:
- 不触及 IME、光标、undo/redo、autosave、Markdown round-trip。
- 主要风险是 release notes 来源可选或格式不稳定，因此实现必须把 release notes 作为可选增强并保留兜底文案。

Doc updates:
- `docs/packaging.md` 记录 release metadata 同时影响 GitHub Release 与客户端更新确认弹窗。
- `docs/test-cases.md` 增加 Windows 自动更新确认弹窗更新内容人工验收场景。
- 实现和验收完成后同步 `docs/test-report.md` 与 `reports/task-summaries/update-notes-dialog.md`。

Next skill: $fishmark-task-execution
