# TASK-UX-SEARCH-001 执行交接

## 来源与范围

在独立分支 `codex/windows-search-ux-20261008` 上，以官方 published main `996cb3496986386a56a022583b61af4f5e5e3e54` 为基线。原仓库、用户偏好和 RF901/cp16 交接候选均不修改。本任务修复搜索焦点、表格命中定位与表格局部选区，并调查 Windows 表格中文字体一致性；字体修复因新增字体继承/原生撤销风险撤回，保留为阻塞。

## 实现落点

- `useFindReplacePresentation.ts`、`useEditorFocusPresentation.ts`：明确搜索聚焦意图、异步打开取消与修饰键/IME边界；从现有 controller 接口取得正文选区。
- `editor-selection.ts`、`code-editor.ts`：只把当前活动表格编辑 DOM 中可与规范源码精确对应的选区投射为源范围；无额外文档真相、不写回 CodeMirror 状态。
- `search-runtime.ts`：沿用 CodeMirror 查询和完整匹配范围，通过当前规范快照解析命中单元格，在布局滚动阶段定位并标记当前单元格。
- `extensions/markdown.ts`：排队的表格聚焦不得折叠范围选区或抢走较新的外部焦点。
- `table-widget.ts`：仅导出既有 DOM 范围读取 helper，供选区适配器使用。字体实验已撤回，列宽算法不变。

## 验证与人工验收草稿

本轮结果以 `docs/test-report.md` 与 `reports/task-summaries/TASK-UX-SEARCH-001.md` 的实际记录为准。

1. 在独立产品构建打开有重复关键词和离屏表格的 Markdown，首次/再次按 Ctrl+F、Esc 后重开；确认输入框持续获焦。
2. 在普通正文及能与源码精确对应的活动 plain 表格单元格拖选部分文字，按 Ctrl+F；单行查询应等于所选源码文字，反向选区同样成立；多行选择仅打开并聚焦搜索，不覆盖已有查询。
3. 连续下一项/上一项跨可见及离屏单元格，确认当前单元格高亮、完整匹配范围保留、Search 输入框仍获焦。插入表格前正文后重测。
4. 查找准备期间按 Esc、切换 Outline 或文档，确认过时请求不会重新打开 Search。单元格排队聚焦时改到 Search，确认空查询和无匹配也不抢回焦点。
5. 在隔离偏好中选择 Georgia + Microsoft YaHei，比较混排单元格显示、编辑及退出的真实字形字体与高度；分别在 1200 和 900 窗口宽度观察短文本、长段落、连续词、中英混排及八列表格。

推荐命令：`npm run typecheck`、`npm run lint`、`npm run build`、`npm run test:regression`、`npm run perf:bundle`。定向新增测试包含 search runtime、焦点转移、controller 选区、Find hook 与 table widget。

## 边界与已知问题

真实字体实验中：初版字体 span 能消除进入编辑时的约 1px 差异，却使末尾输入英文继承中文字体；模拟输入后重新分段又使 Ctrl+Z/Y 失效。该诊断有关闭超时错误，不能计为整体通过；全部实验代码已撤回。普通字体 fallback 已被既有 CJK 设计排除，通用修复需要独立字体层能力及专项验证。

表格高亮对象是当前命中的单元格，不是所有子串。若转义竖线解码等导致 DOM 全文与规范单元格源码不一致，局部 DOM 选区不映射，保留 CodeMirror 原范围；本轮不提供任意富文本映射。Typora 原生界面对照、真实系统 IME、主题矩阵、首次 paint、RF901 固定性能矩阵和远端 CI 未运行。显示器/GPU/字体仅按实际证据记录，不用 Mac 结果代替 Windows 基线。

Library 官方 search 下载助手失败于内部 `prepare_materialize` 能力发现，公开 schema 仍存在；没有新 HTTP403，也未取得准确 cp16。继续获取须先修复官方服务或获得独立、合法的新引用/授权，不能从拒绝结果换路下载。RF901 1431588 B 对已批准 1431000 B 仍 FAIL +588 B；本分支使用 published main 原 1430000 B contract，均不得改门槛。
