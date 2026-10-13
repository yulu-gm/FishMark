# TASK-UX-UI-001 — 极简界面统一

- Goal: 沿用最新编辑器、无明显边框 rail 和紧凑 Search 的视觉语言，统一设置与应用绘制的辅助界面。
- Baseline: `b0fcec272b3a3607fe223f73812b91c3a0572f22`，本轮核实远端 main。原工作副本 HEAD `85df142` 且工作区干净，保留未修改；本轮在独立副本实施。
- In scope: 设置全部五个叶页（主题、排版、自动保存、最近文件、图片）；共享按钮、输入、radio、toggle、slider；快捷键面板、通知、冲突提示、Search/Outline 和工具栏视觉一致性。
- Out of scope: 编辑语义、Markdown 数据、偏好存储模型和功能重构；原生菜单/消息框自绘；历史表格 288px 问题、M9、发布与推送。
- Landing area: `src/renderer/styles/{primitives,settings,app-ui}.css` 及必要的小范围 renderer 控件可访问性与测试。
- Design: astra/high 先读实际实现并检查本轮产品截图；6.1-sol/high 随后实现；astra 独立最终评审。截图结论与具体规格记录在本任务 handoff 和总结中。
- Acceptance: 控件边界与键盘焦点可辨、选中/禁用/危险状态保留；减少玻璃装饰、粗边框、逐行分隔和重复卡片；全部设置功能、文案含义、快捷键、保存及重开行为保持；明暗、窄窗/缩放、滚动可用；文档自适应宽度与侧栏必要留白不变。
- Verification: 新鲜 lint、typecheck、build、完整严格回归（10项精确既有失败，0新增失败，0skip，不变更allowlist）；bundle gzip预算1500000 B；隔离真实产品窗口同协议前后截图、五设置分类切换/关闭/Esc/返回/键盘导航/持久化、明暗窄窗缩放、近期行内标记/光标与Outline跳转回归。
- Risks: 共享CSS影响面、窗口缩放下溢出、透明主题对比度、隐藏radio键盘焦点；不改变编辑核心与偏好写入接口。
- Evidence: `.artifacts/ui-unification/`；独立 appData/userData/sessionData，后台或专用测试窗口，不使用用户编辑文档。
- Doc updates: 本 intake、execution handoff、MVP_BACKLOG、progress、design、test-cases、test-report 和任务总结。历史记录保留，不将本轮视觉优化记为其他里程碑完成。
- Next skill: `.codex/skills/fishmark-task-execution/SKILL.md`，完成后转 `.codex/skills/fishmark-task-acceptance/SKILL.md`。

2026-10-13发布阶段补充：上列初始范围已完成本地验收及独立评审。后续明确授权普通推送main并监测精确提交CI；不force、不新建远端分支，不发布原始取证或私人资料。

## 实际页面检查与设计决定

astra 与主代理查看 `.artifacts/ui-unification/baseline-settled/` 的实际产品截图；此前 `baseline/`、`baseline-full/` 含隐藏窗口未完成动画帧，保留作诊断，不作视觉验收依据。稳定截图在同协议下结束动画、等待字体与绘制；实际交互和动画仍需单独测试。

确认问题：设置面板透明度使背后正文标题与设置内容叠字；700px宽、接近整窗高的面板在单项页留下大块空白；窄窗放大时分类导航占用过多高度；设置大圆角/胶囊与紧凑Search控件形状不一致。

实施方向：不透字的主题化面板、约8–10px单层圆角、有界面板高度；标题和分类导航更紧凑，保留纵向滚动；层级约18/14/13/12px（按现有UI字号缩放），设置控件约32px、Search约30px；去逐行分隔，保留输入边界和明确选中/焦点/禁用/危险态。保留既有Times默认字体family及正文排版，复用现有tokens。原生应用菜单、版本/更新说明/未保存消息框保留系统外观与语义，不扩展自绘架构。

本轮基线：build PASS；文件身份用例8/8 PASS；完整严格回归3485 passed +10 exact known failures、0unexpected、0skip、0collection/hook/unhandled errors。
