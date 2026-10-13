# TASK-UX-UI-001 — execution handoff

- Baseline: `b0fcec272b3a3607fe223f73812b91c3a0572f22`。独立副本实施；原工作副本未改动。实现阶段不推送；2026-10-13验收后已获授权推进main普通推送与精确提交CI验证。
- Scope: 沿用编辑器、rail 和紧凑 Search 的视觉语言，统一五个设置叶页及应用绘制的辅助界面。未改编辑语义、Markdown、偏好接口或存储模型。
- Landing files: `src/renderer/styles/{base,primitives,settings,app-ui}.css`、`src/renderer/app.autosave.test.ts`；相关设计、决策和测试文档由主任务同步。

## 实现

共享 UI 字号、6px 控件圆角、8px 表面圆角及轻阴影；默认设置表面由正式 `workspace-bg` 语义槽取色并将 alpha 设为 1，消除背后正文叠字。设置限高、紧凑头部/导航、小屏横向分类，保留内容滚动。去除装饰玻璃、重复卡片和逐行分隔，保留输入边界、选中态、禁用态、危险态及可见键盘焦点。Select 为箭头预留 40px；表格删除按钮保留危险色。

Times 默认字体、自适应正文宽度、侧栏必要留白及全部偏好功能保留。社区主题显式覆盖设置表面的玻璃样式仍生效；默认 opaque 合同不强行遮盖社区主题表达。原生菜单与消息框保留系统实现。

更新既有样式 contract，验证设置消费 `ui-surface-bg`，且该 token 仍映射到正式 `workspace-bg`；不把主题语义测试简单删掉。完整严格回归的原有 10 项精确失败名单未改。

## 验证协议与证据

证据位于 `.artifacts/ui-unification/`。实际产品测试使用已构建 main/preload/renderer，独立 appData/userData/sessionData 和专用 Markdown；真实窗口 `showInactive` 放在 `[-10000,-10000]`，未调用窗口或 webContents 的 focus。交互使用 DOM click、Electron trusted 字符/Tab/Space/Escape；CDP 仅启用页内 focus emulation，使 input/change/blur/focusout 正常进入 React，OS 窗口仍未聚焦。报告同时保存事件 ledger、偏好磁盘值和最终窗口状态。

- `candidate-final4/`：最终完整实际产品矩阵，含五设置分类明暗、大/窄窗口、125% 滚动、slider/toggle/输入/select/radio 焦点、disabled 图片重置、Search/Outline、五种通知及实际磁盘冲突。
- 实际产品结果：43 张截图，29/29 checks；正常 `app.quit` 后独立新进程 3/3 checks（自动保存3100、最近文件27、选中Pearl Drift），没有此前探针截断 recovery 引起的回放警告。主题 slider=1.05/toggle=0 已在首进程磁盘验证；reopen旧label“theme parameter”实际断言的是主题选中ID，不能记作参数重开断言。
- Ctrl-hold 在实际完整产品的 trusted Electron 键输入 + CDP 页内焦点仿真下触发快捷键面板 DOM 状态；`shortcutActivation.visible=true`、`osWindowFocused=false`。其实际产品 PNG 没显示面板，因此该 PNG 不作为弹层像素证据；像素由单独标注的组件 fixture 覆盖。受控完整产品路径仍不等同真实系统前台键盘人工操作。
- 长字体选择及 select computed `padding-right=40px` 已通过；对应 `long-font-selection` PNG 停在排版底部，未显示该 select，不把它当作长值与箭头间距的像素证据。正常 select 与键盘焦点有其他实际产品截图。
- `candidate-surfaces-final/`：4 张实际 React 组件与 CSS 的受控 props 截图（ShortcutHintOverlay、NotificationHost、ConflictBanner、TableToolbar），使用标准 HTML 模式及明暗 tokens；属于组件像素证据，不冒充自然完整应用生命周期。
- 组件结果：4/4 图均有shortcut/conflict/notification；浅色danger `rgb(139,30,30)`、普通 `rgb(72,80,93)`；深色danger `rgb(254,202,202)`、普通 `rgb(212,219,229)`，危险态没有混回普通色。默认快捷键表面明/暗均为opaque。
- `baseline-final/` 为同样 showInactive/负坐标可靠基线；`baseline-aux3/` 可作部分窄窗/参数对照。早期 `baseline/`、`baseline-full/` 动画未完成，不作视觉验收依据。
- `candidate-final/`、`candidate-final2/`、`candidate-final3/`、`candidate-aux4/5/7/`、`candidate-surfaces/2/3/` 保留探针校准和失败记录。数字 DOM setter 未进入 React、inactive 页未发 blur、125% 下严格 2px 焦点断言、fixture 路由/doctype 等已校准；这些失败没有触发产品数据代码变更。
- 最终实际 viewport 以 report 为准：文件名 `1200` 对应 1216×889 CSS px；窄窗125% 对应 720×543 CSS px / 900×679 PNG，产品最小窗口宽度生效；组件 1200/720 文件对应 1216/736 CSS px。

## 推荐验证命令

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:regression
npm run perf:bundle
npm run test:editor-behavior
node .artifacts/ui-unification/run-capture.cjs .artifacts/ui-unification/<fresh-candidate>
node .artifacts/ui-unification/run-capture.cjs .artifacts/ui-unification/<fresh-candidate> reopen
node .artifacts/ui-unification/run-surfaces.mjs .artifacts/ui-unification/<fresh-surfaces>
```

Build/bundle 会改写 dist；截图应在对应候选构建完成后运行，禁止与改写 dist 的操作并发。主任务负责新鲜门禁、最终验收结论及文档状态一致性。

## 人工验收草稿与边界

依次查看五设置叶页明/暗、窄窗125%顶部和滚动底部，检查内容、选中与禁用状态；Tab 导航到控件，查看可见焦点。修改自动保存为3100、最近文件为27，Tab失焦后核对磁盘，关闭/重开面板，再正常退出/跨进程读取。Pearl Drift参数 slider/toggle 应响应键盘并自动保存。查看Search、Outline跳转、通知、冲突以及组件短快捷键/表格危险按钮像素。

原生 Electron 菜单已从实际实例枚举，保留 File/Edit/View/Window/Help 和可调用 handler；该产品既有菜单没有 Settings/Preferences 项，不能声称原生菜单打开设置通过。About、更新和未保存系统弹框未做自然显示验收，不改自绘。社区动态 shader 的连续运动不是本轮截图协议的验收结论。页内焦点仿真与实际系统前台键盘操作的边界需保留在验收报告。

此前冲突探针使用 `app.exit` 截断 recovery shutdown，导致辅助重开回放警告；最终脚本先重载专用冲突文件清除 dirty，再 `app.quit` 走实际 shutdown，不删除隔离存储来伪造重开通过。此前隔离进程已关闭。

## 交给验收

实现与必要 contract 已落地；本轮辅助验证不代替 `$fishmark-task-acceptance` 的最终 PASS/FAIL。主任务在 bundle、正式编辑行为 smoke 和独立评审完成后统一更新 backlog、progress、任务总结及最终报告。
