# TASK-UX-UI-001 — 独立设计与最终评审

审查日期：2026-10-13。审查对象为基线 `b0fcec272b3a3607fe223f73812b91c3a0572f22` 上的本地候选 diff；评审未修改产品实现。依据项目 AGENTS、架构验收与任务验收技能及本任务 intake/handoff，独立阅读源码、测试合同、门禁结果和实际 PNG。

## Findings

未发现阻断性结构问题；无新增 P0 / P1 / P2 finding。

- 产品改动限于 renderer 的 `base.css`、`primitives.css`、`settings.css`、`app-ui.css` 与现有样式合同测试。职责仍在视图层；没有新增 Markdown 真相、偏好 owner、业务编排、IPC 或主题运行时路径。
- 默认设置面板从透明玻璃改为主题色的不透明表面，8px 圆角、有界高度和紧凑导航解决基线中的正文透字、装饰过重及窄窗导航占高问题。正文自适应宽度、侧栏必要留白及默认 Times 字体保持。
- 六项预审问题已修复：透明 workspace token 的 alpha、select 箭头空间被 padding 覆盖、禁用按钮 progress cursor、工具栏大圆角与危险状态、导航焦点裁切、设计文档固定 measure 的过时表述。
- 新 surface token 只约束默认应用表面。Pearl Drift 等社区主题已有的显式玻璃覆盖仍有效；本评审不将其描述为全部社区面板不透明，也不要求抹去主题表达。

## 本轮证据

根目录：`.artifacts/ui-unification/`。下列命令由主任务执行；本评审独立读取其输出和结果文件，没有将旧任务门禁冒充本轮结果。

| 验证 | 独立核验结果 |
| --- | --- |
| build | `final-build.result.json` exit 0；构建晚于全部产品 CSS 修改。此后仅测试合同与文档修改；bundle 末尾再次正常构建 renderer。 |
| lint / typecheck | 最后测试合同修改后再次运行，`final-lint.result.json`、`final-typecheck.result.json` 均 exit 0。 |
| 严格回归 | 基线与候选均 3485 passed + 10 exact known failures，零 unexpected / skip / collection、hook、unhandled error；allowlist 未变。 |
| bundle | `final-bundle.result.json` exit 0；JS gzip 1434002 / 1500000 B，initial gzip 101851 / 260000 B，合同 PASS。 |
| 正式编辑行为 | `final-behavior.log`：121/121 cases、2541 targets，0 unexpected、0 not-run。既有 known-defect 目标仍由报告单列，不宣称已修复。 |
| 产品 UI | `candidate-final4/report.json`：43 张截图、29/29 检查。五分类、窄窗 125% 滚动、select/radio/range/toggle 焦点、禁用和透明 token 等检查通过。 |
| 保存与重开 | 同轮磁盘记录为 autosave 3100、recent max 27，Pearl Drift 参数为 iridescence 1.05、enableGrain 0；`reopen-report.json` 3/3 检查通过，其第三项实际检查的是主题选择，不单凭名称推断参数 UI 已重开验证。 |
| 辅助组件像素 | `candidate-surfaces-final/`：真实 React 组件与产品 CSS，标准文档模式，明暗两种宽度共 4 图通过。危险按钮颜色与普通按钮分离，快捷键 surface 不透明。 |

独立查看了稳定基线 `baseline-final/` / `baseline-settled/` 及候选明暗设置、Search、Outline、125% 窄窗和滚动底部、键盘焦点、透明 workspace token、冲突提示与辅助组件截图。没有发现本轮引入的控件遮挡、内容无法到达或焦点不可辨问题。

实际产品取证使用隔离 appData/userData/sessionData 与专用 Markdown fixture，窗口位于屏幕外且 OS 不激活；CDP 页面焦点仿真用于真实 Electron 键盘输入、Tab 与 blur/change。PNG 文件名是请求尺寸，实际 viewport/PNG 尺寸以各 report 为准。稳定截图不等于动画流畅度验证。

## 证据边界与保留记录

- 真实 App 在 trusted Ctrl + 页面焦点仿真下记录快捷键弹层 DOM 存在，但对应产品 PNG 未捕捉到弹层；像素结论来自明确标注的组件 fixture。没有把 fixture 或 DOM 存在判为自然 OS 前台 Ctrl 长按全流程通过。
- 长字体 select 箭头空间由 DOM/computed padding 核验；对应滚动后截图没有展示该控件，不能作为其长值像素证明。
- 通知使用真实应用消息通道注入状态；外部冲突使用专用文件的真实 watcher 流程。两者的证据层级没有混写。
- 早期失焦提交失败、旧 CSS 合同失败、fixture 初始化错误和 125% 描边取整误报均保留。最终证据经过真实输入、磁盘断言、正常退出与独立进程重开校准，不采信早期 `complete` 标记代表全部功能通过。
- 未覆盖 macOS、真实 IME、自然 OS 前台键盘生命周期、原生 About/更新/未保存弹窗及动画性能；原生菜单仅做实例枚举。历史表格 288px 问题、M9、远端 CI 与发布不在此次 PASS 范围。

## 人工复查

1. 逐一切换五个设置叶页，使用返回与 Esc 关闭，再打开确认焦点和状态。
2. 用 Tab/Shift+Tab、方向键和空格操作 select、radio、range、toggle；在 125% 窄窗滚动至底部检查可达性。
3. 修改自动保存与最近文件上限，失焦后关闭并重开，再正常退出专用实例并启动，核对保存值。
4. 对照默认明暗主题与社区主题查看 Search、Outline、危险按钮、通知和文件冲突提示；另在实际前台窗口补查自然 Ctrl 长按和原生弹窗。

## Result

**PASS** — 本地候选的实现、视觉与本轮验收证据通过独立评审。项目任务状态由主任务据此同步；此结论不表示已经推送、发布或完成跨平台验收。
