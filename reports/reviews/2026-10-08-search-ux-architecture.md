# TASK-UX-SEARCH-001 独立结构审查

审查基线：published main `996cb3496986386a56a022583b61af4f5e5e3e54`。审查对象为独立分支 `codex/windows-search-ux-20261008` 的最终未提交搜索差异、回归测试及本轮同步文档。审查人没有修改实现、安装依赖、启动 UI、提交或推送；唯一写入是本记录。

已读取根 `AGENTS.md`、`fishmark-architecture-acceptance/SKILL.md` 及 architecture、testing-verification、documentation、theme-style 四份 reference，并核对 CJK 字体既有设计。以理想 Markdown 编辑器边界审查，没有将原实现作为规则豁免。

## Findings

最终保留的搜索差异未发现阻断性结构问题。审查期间提出的问题已明确处理：

- 延迟 Search 准备完成不能覆盖较新的 Esc、Outline、文档切换或卸载意图；请求身份及相关回归已补齐。
- 表格排队焦点除了保护完整匹配范围，也在空查询、无命中时尊重后来的外部焦点；显式表格导航及工具操作有正例。
- 单元格局部 DOM 范围不能冒充 CodeMirror 已同步的选区。新增 adapter 能力先核对当前 canonical cell、DOM 身份、可编辑 plain 模式、范围归属和全文一致性，才返回精确源投影；不 dispatch、不改写文档或 CM selection。转义管道解码等情况安全回退。
- HTML search input 会移除 CR/LF。原拟议的多行带入会造成显示查询与实际查询不一致；最终仅带入非空单行，多行保持原查询。LF/CRLF 回归覆盖首次打开和已有查询两种情况。
- CJK plain 字体 span 引入英文继承，输入后重分段又破坏原生撤销。相关实验均撤回；最终 `table-widget.ts` 仅导出既有 `readEditableSelection`，字体和列宽算法保持原样。

## 结构与契约核对

Search 表单与面板生命周期仍属 presentation，查询与匹配仍由 CodeMirror 持有。焦点 Hook 不直接承担保存或文档业务。新的选区读取通过公开 controller/adapter 能力进入；没有第二份文档、解析树或可写 selection store。

表格搜索插件每次从当前结构缓存创建派生视图，解析完整匹配范围并查找当前挂载单元格。同步 `scrollHandler` 复用既有 reveal 几何，避免保留会过期的异步 DOM 滚动目标。高亮微任务只更新呈现类，销毁时失效。源码模式、关闭、刷新、跨格匹配及排队焦点均有边界。CSS 复用现有颜色 token，不越权更改主题或布局合同。

`MVP_BACKLOG.md`、`docs/progress.md`、`docs/test-report.md`、`docs/test-cases.md`、`docs/decision-log.md`、执行交接及任务总结一致保留 **CHANGES_REQUESTED / 整体 FAIL**。选区映射限制、单行规则、字体撤回、原门禁失败与未运行范围均已记录；没有宣称 M9/RF901 完成。

## 新鲜验证证据

独立审查最终运行：

```text
npm.cmd exec vitest -- run src/renderer/editor/useFindReplacePresentation.test.tsx src/renderer/search-runtime.test.ts src/renderer/search-focus-transfer.test.ts src/renderer/code-editor-selection.test.ts --maxWorkers=1
```

输出起始时间 `20:12:39`（工具的本机时间），4 文件 **41/41 PASS**，exit 0，5.50 秒。最初配置加载曾因沙箱 `spawn EPERM` 失败；后续同一项目的定向命令通过正式审批运行，没有修改测试入口来绕过限制。最终 `git diff --check` 也退出 0。

此外直接读取父级生成的本轮结果，不冒称这些命令由 reviewer 重跑：

- `final-typecheck.result.json`、`final-lint.result.json`：exit 0。
- `final-bundle.result.json` 及日志：原 contract **PASS**，total JS gzip `1429191 / 1430000 B`，剩余 809 B，门槛未改。
- `final-regression-workers2.log`、`final-vitest-full.gate.json`：224 文件、3162 项，3151 passed、10 exact known failures、1 unexpected Windows symlink skip，0 collection/hook/unhandled errors、0 unresolved baseline；原 wrapper **FAIL**。
- `final-ui-handoff.json`：同一 v2 协议与 fixture 下，搜索断言补丁后 **18/18 PASS**，纯 main 为 4/18；另 1 条拖选前置观察。字体 0/2、整体 UI **FAIL**。15 个已记录 probe PID 全部退出。
- 独立逐项比较 UI 交接中所有 `src/`、`packages/` 文件 SHA256 与当前文件，**0 mismatch**；协议匹配。查看最终 `v2-candidate/03-refresh.png`，确认 Search 查询框和离屏第 35 行命中格同时可见；动态 focus、source range 和几何结论以对应 JSON 断言为证，不由截图单独推出。

上述证据位于 `.artifacts/windows-search-ux/`。完整环境、基线对照和人工步骤见 [任务总结](../task-summaries/TASK-UX-SEARCH-001.md)。

## Open questions / 保留阻塞

- 第三项中文字体/约 1px 高度变化未修，Typora 原生界面对照未运行。普通字体 fallback 违反既有 CJK 选择合同；本轮没有引入未经验证的字体层替代方案。
- Windows symlink 测试的 EPERM 已由同机纯 main 对照归因，但不改变 unexpected skip 及原完整门禁的 FAIL。既有十项 parser/list known failures 也未删除、放宽或重录。
- Chromium `sendInputEvent` 产品路径、合成 composition 回归不等于原生 OS IME或全局系统快捷键验收。Packaged installed release、主题矩阵、首次 paint、完整 M9/ABBA 和远端 CI 未验证。
- 准确 RF901/cp16 仍未获取，本搜索分支不是该候选。RF901 的 `1431588 / 1431000 B`、FAIL +588 B 和 16/24ms 未通过状态保持不变。

## Result: PASS

此 PASS **仅限最终保留的搜索修复的结构审查与已列定向证据**，允许作为可审阅的独立本地检查点保存；不是整项任务、字体修复、完整回归或发布通过。整项任务仍为 **FAIL / CHANGES_REQUESTED**，不得据此采纳 RF901、推送 main 或发布。
