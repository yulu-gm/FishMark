# TASK-UX-UI-001 — 极简界面统一

状态：**ACCEPTED / PASS**；实现、本地门禁与astra独立评审通过。已获授权普通推送main，发布状态以远端精确提交及对应CI结果为准。

## 范围与结果

从已发布 main `b0fcec272b3a3607fe223f73812b91c3a0572f22` 创建独立副本，保留用户原目录及其 HEAD `85df142`。实际设计检查发现设置玻璃表面透字、单项页过高、控件圆角和字号不统一、窄窗导航占高等问题；astra/high给出视觉方向，6.1-sol/high完成实现，astra/high独立复核。

产品 diff 仅涉及四份 renderer 样式及对应样式契约测试：

- 设置五个叶页（主题、排版、自动保存、图片、最近文件）采用最高680px的平实面板、紧凑标题和导航，移除逐行分隔与玻璃高光；窄窗导航两行排列，内容独立滚动。
- 共享约18/14/13/12px字体层级、6px控件/8px表面圆角及32px设置输入高度。Search保持紧凑，rail去重复边框。
- 快捷键提示、通知、外部修改冲突、表格工具栏和tooltip同步轻量表面。按钮、输入、select、radio、toggle、slider保留边界、focus-visible、选中、禁用和危险状态。
- 默认Times UI字体、明暗语义色、社区主题显式CSS覆盖、正文自适应宽度及侧栏必要留白保持。默认表面从workspace色取不透明RGB，防止alpha主题色导致正文透出；Pearl Drift自己的视觉覆盖仍有效。

没有变更Markdown、编辑语义、行内标记/光标、outline跳转逻辑、main/preload、设置文案/快捷键/存储或原生菜单/消息框。没有新增控件框架或依赖。

## 验证与证据

本机为 yuluStation / Windows / Node v24.13.0，依赖来自冻结lockfile。根证据目录为 `.artifacts/ui-unification/`。

| 检查 | 结果 |
| --- | --- |
| lint / typecheck / build | PASS；最后测试契约修改后lint/typecheck再次通过，产品CSS构建通过 |
| 原版严格回归 | PASS：237文件、3495 tests；3485 passed +10 exact known，0 skip / unexpected / errors |
| 候选严格回归 | PASS：同样3485 passed +10 exact known，0 skip / unexpected / errors；`final-vitest-full.gate.json` |
| 真实symlink | 8/8 PASS；`baseline-file-identity.log`，全量候选中同样未跳过 |
| bundle | PASS：JS gzip 1434002 / 1500000 B，initial gzip 101851 / 260000 B；`final-bundle.log` |
| 正式editor behavior | PASS：121/121 cases、2541 targets，0 unexpected、0 not-run；`final-behavior.log`，完整JSON位于 `.artifacts/editor-behavior/report-1791859729559.json` |
| 产品UI矩阵/持久化 | PASS：`candidate-final4/report.json` 43截图、29/29 checks；`reopen-report.json` 3/3 checks；`candidate-surfaces-final/` 4张组件截图 |
| 独立设计/最终review | PASS，无新增P0/P1/P2；`reports/reviews/2026-10-12-ui-unification.md` |

实际窗口检查使用真实构建的main/preload/renderer及独立appData/userData/sessionData，唯一测试文档为专用fixture。窗口放在屏幕外并保持OS未激活；CDP页面焦点仿真使原生输入、Tab、blur/change链路可执行，不调用用户窗口focus。截图等待字体和动画完成，不把稳定帧当动画流畅度测试。PNG实际尺寸和CSS视口记录在report中，文件名中的请求尺寸不是实测尺寸。

29项检查包括五设置叶页窄窗底部可达、slider/toggle键盘焦点和参数落盘、输入框真实字符与Tab提交、Space返回/Esc关闭及焦点恢复、radio/select可见焦点、禁用图片重置、alpha主题色不透字、Outline跳转、五类通知和真实文件watcher冲突/重载。独立进程重开核验自动保存3100、最近文件27、Pearl Drift主题选择；原报告第三项标签写theme parameter，实际断言仅为主题包ID，`verification-label-note.json`已明确，不将其称参数UI重开验证。参数1.05/0在同轮磁盘记录中核验。

辅助组件截图使用真实React组件与产品CSS、受控props，覆盖快捷键层、冲突、通知、表格工具栏的明暗与窄窗。真实App在trusted Ctrl键+CDP页内焦点路径下记录弹层DOM可见，但对应PNG未捕捉到弹层；快捷键像素结论来自组件fixture，不称自然OS前台长按生命周期通过。长字体select箭头空间由DOM/computed样式核验，对应滚动后PNG不作为该控件像素证明。通知的状态注入与真实外部文件watcher冲突分别记载，不混用证据。

早期诊断保留：隐藏窗口未完成动画、DOM赋值未提交React状态、无页面焦点导致blur不提交、键盘焦点前置条件与125%描边像素取整断言需要校准、测试强制退出截断recovery等探针问题；这些结果不能作为功能通过证据。首次严格回归发现一个旧玻璃CSS契约断言，按新语义槽更新后原完整门禁通过；未扩大allowlist或新增skip。

## 前后对比

最终对比基于 `baseline-final/` 与 `candidate-final4/` 同协议原始PNG生成，包含浅色主题页、深色主题页、125%窄窗图片页及Search。四页PDF、可缩放HTML和截图来源SHA256放在 `.artifacts/ui-unification/deliverables/`：`FishMark-UI-before-after.pdf`、`FishMark-UI-before-after.html`、`sources.json`。已核对配对图片尺寸一致、PDF四页及HTML预览。所有历史失败与诊断目录保留。

对比PDF已交付用户。私人Library标识、上传回执和本地版本元数据处理记录仅保存在忽略的deliverables目录，不纳入仓库。

## 人工复查步骤

1. 打开设置，逐一切换五个叶页；用返回按钮和Esc关闭，再打开确认焦点与当前页行为。
2. 用Tab/Shift+Tab浏览分类、输入、select和radio；检查焦点轮廓、方向键选择、toggle与slider状态。
3. 修改自动保存延迟和最近文件上限，移出输入框，关闭设置并重开，再重启专用实例确认保存。
4. 切换浅色/深色与Pearl Drift；调整窗口并放大到125%，滚动至各页底部，确认控件与页尾状态可达。
5. 打开Search、Outline与表格工具栏；检查通知、危险按钮和外部文件冲突提示，确认正文宽度和编辑行为保持。

## 发布与边界

本地验收后，已按用户既有授权进入main普通推送及精确提交CI验证阶段。原始截图、测试profile和用户资料不纳入提交。macOS、真实IME、原生OS消息框和自然Ctrl长按弹层生命周期未在本轮验证；不宣称完整跨平台验收或动画性能验收。历史表格288px问题和M9状态不变。
