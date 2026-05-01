# Task Intake: header-zoom-anchor

Task: 临时 bugfix `header-zoom-anchor`
Goal: 修复宽屏或页面放大时 workspace header 被居中推离左上角的问题。
In scope:
- 定位 workspace header 放大后漂移的 CSS 根因
- 让 open-document header 在宽屏和页面缩放下保持左锚定
- 增加 renderer CSS 合约回归测试
Out of scope:
- 不重做 workspace / canvas / tab strip 布局
- 不改动 Markdown 编辑器、保存、主题运行时或窗口状态逻辑
Landing area:
- `src/renderer/styles/app-ui.css`
- `src/renderer/app.autosave.test.ts`
Acceptance:
- workspace header 不再继承共享 `margin: 0 auto` 造成的居中漂移
- 页面缩放到 1.5x 时，header 左边界与 workspace 内容左边界保持一致
- renderer 回归测试、lint、typecheck、build 通过
Verification:
- `npm.cmd run test -- src/renderer/app.autosave.test.ts`
- `npm.cmd run test`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- Electron offscreen 几何验收
Risks:
- 当前工作区有其他未提交改动，本轮不回滚也不吸收无关变更。
