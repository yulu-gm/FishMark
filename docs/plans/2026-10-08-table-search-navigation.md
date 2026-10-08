# 表格搜索导航实施与验证记录

目标是在渲染表格中定位并标识当前搜索命中，同时保留搜索框焦点和完整的源码匹配选区。

实现沿用 CodeMirror 查询和规范文档快照。搜索模块中的延迟加载插件只负责当前单元格的视图投射；不创建第二份解析文档，不将旧 widget offset 作为位置真相，不改冻结 RF901 候选。

## 实施步骤

1. 在 `src/renderer/search-runtime.test.ts` 建立真实 controller 回归，覆盖同格多命中、跨格前后导航、表前插入后的新 offset、源码模式、关闭搜索和排队焦点竞态；先运行并确认失败。
2. 在 `src/renderer/search-runtime.ts` 从当前缓存快照解析完整命中范围，将当前单元格标记投射到已挂载 DOM，保持文本和焦点不变。
3. 由 CodeMirror 先挂载目标视口；在其布局阶段的 scrollHandler 中复用 `computeEditorRevealDelta`，同步完成单元格滚动，避免清除 scrollTarget 后卸载离屏目标的竞态。不保留延后的源码或 DOM 滚动目标。
4. 搜索关闭、源码模式、无有效单元格命中、组合输入或插件销毁时清理标记。仅装饰与视口刷新也重新检查当前状态。
5. 在表格焦点桥中保护非空选区；如果排队后焦点已转至不同外部控件，放弃旧请求。保留 widget 重建退回 body 的既有行为。
6. 运行定向测试、类型检查和 lint；由 Windows 产品窗口验收可见、离屏、前后项、刷新后的选区与滚动几何。

## 行为边界

当前高亮表示命中的整个单元格，不宣称逐字命中高亮。跨单元格或表格语法范围的匹配保留默认源码导航。搜索导航不进入单元格编辑，不改变源码选区长度。表格原生选中文本带入 Ctrl+F 由并行的公开选区能力修复负责。

## 已核实的验证

- 初始两项表格搜索回归在未修改实现上失败，原因是缺失当前单元格投射；扩展后的四项搜索回归通过。
- `npm test -- src/renderer/search-focus-transfer.test.ts src/renderer/search-runtime.test.ts src/renderer/code-editor-table-editing.test.ts packages/codemirror-adapter/src/viewport-reveal.test.ts`：13 项通过。时间仅引用命令报告 `19:45:35`，不将本机输出误标为 UTC。
- 完整 `code-editor.test.ts` 的 273 项中通过 271 项；两个裸尾部 `-`、`1.` 列表标记断言失败。相同断言在单独归档的未改 HEAD `996cb3496986386a56a022583b61af4f5e5e3e54`、同版本已安装依赖上复现；未跳过或改写这些断言。
- 同步滚动实现的 renderer TypeScript、改动 TypeScript 文件的 ESLint 和 `git diff --check` 已通过。
- 已读取 `.artifacts/windows-search-ux/final-search-geometry/result.json` 并检查 `03-refresh.png`。七次下一项、上一项及表前插入后导航均保留六字符 `needle` 源码范围、搜索框焦点、唯一目标单元格和可见几何。插入 31 个字符后，第二张表的 offset 从 1135 变成 1166。
- 上述 UI 报告的整体状态仍是 FAIL：同轮发现表格原生 DOM 选择没有带入 Ctrl+F。不能因本项导航通过而宣称整轮验收通过，主交接记录以随后完整重跑结果为准。

## CJK 修复实验已撤回：保留缺陷与阻塞证据

Windows 正规偏好 `fontFamily=Georgia`、`cjkFontFamily=Microsoft YaHei` 下，显示态中文使用 Microsoft YaHei，进入表格编辑后退回 Noto Sans SC，退出时恢复，造成 1px 表高变化。

曾尝试让 `buildPlainTextFragment` 复用已有 `appendDecoratedPlainText`。已有内容在进入编辑态时字体和高度恢复一致，但真实 End 键定位末尾后输入 `abc` 暴露新回归：编辑态八个字符均使用 Microsoft YaHei，退出后变为中文五字符 YaHei、英文三字符 Georgia。见 `.artifacts/windows-search-ux/final-font-profile/result.json`；1200/900 两种宽度均复现。

随后只在隔离诊断脚本中模拟输入完成后重分字体节点并恢复光标。`.artifacts/windows-search-ux/font-undo-experiment/undo-result.json` 保存两组真实键入、Ctrl+Z、Ctrl+Y 记录：不重建 DOM 时可以撤销和重做 `abc`；重建后两者均不再改变源码或 DOM。该脚本包含 `Hard timeout` 结束错误和关闭记录，不视为整项通过，但两组操作阶段证据完整。

因此一行字体实验及对应三个新增字体回归已撤回，未将输入时 DOM 重建加入生产代码。`table-widget.ts` 仅保留并行 Ctrl+F 选区能力需要的既有选区读取函数导出，`table-widget.test.ts` 与原 HEAD 一致。原始 CJK 字体/1px 高度变化仍未修复；后续方案必须保护原生输入、撤销和组合输入，不能用不安全的重分段掩盖它。列宽算法、样本和阈值均未修改。

回撤后的最终保留代码已复跑搜索、焦点转移、表格编辑、表格 widget 和滚动策略五个测试文件：22 项全部通过（命令报告 `20:10:02`）。renderer TypeScript、改动 TypeScript 文件的 ESLint 和 `git diff --check` 再次通过。最终完整产品重建、总体积和全量质量结论以父级交接记录为准。

完整 RF901 性能矩阵、正式发布采用、提交与推送均不属于本项执行范围。
