# 长表格滚动：限定诊断与可证伪设计（未实现）

基线 `38422aed07234e6641fac9c15b6adf62b38e52af`；产品仍为 `a4fb6020952da0ae887db9a4127088023f0d5c01`，保留原生撤销 `8505074869c68554ddbc818fbaaffff6b72ff93c`。本轮只读源码、旧证据及一次隔离真实窗口观测，不修改产品、不推送。交下一轮 6.1 sol 实现；此设计未经候选实测，不能算修复通过。

## 结论与证据强度

建议先试一个方案：**保留当前源码滚动目标，让 CM 完成目标视口挂载与测量；在公开 `EditorView.scrollHandler` 中，针对已验证的表格目标一次性按实际 caret/匹配片段几何完成滚动并返回 true。表格焦点回调不再另行写 scrollTop。** 不取消所有表格的 `scrollIntoView`，不另加每帧恢复位置。

已证实有三个相互作用的环节：

1. `extensions/markdown.ts:253–299` 焦点微任务调用 `requestEditorElementReveal`。`viewport-reveal.ts:197` 的 oversized 分支把整个高 cell 的上边缘对齐，即使用户点中的部分已可见。04/05 和本轮均看到 `305 → 455.484375` 的请求（浏览器存储约 455）。这一步根本没有以实际 caret 为目标。
2. `semantic-keypress.ts:110` 对包括 unchanged 在内的已处理语义事务都请求滚动。表格覆盖整个源码范围的 block replace；`TableWidget` 未覆写 `coordsAt`。CM 默认矩形是**整张表格的 top/bottom、压扁后的横向边缘**，不是 cell，也不是源码字符所在行。注意 `flattenRect` 只压扁宽度，不能把它误述为已经得到一个表格底部点。`nearest` 对超高矩形、正向 head 的分支最终偏向下边缘，实测随后写到 `13841.203125`。
3. 活跃 cell 改变会令 widget `eq` 不同并重算装饰，DOM 可复用并不意味着高度表保留原测量。CM 的 block 高度重建先采用 `estimatedHeight`；默认 -1 转为当前 lineHeight。重复 focus/mousedown 事务和派生装饰事务之间，暂时缩小的高度表可使下一次锚点落在表格后方。后续测量恢复真实高度，无滚动目标时 CM 用该锚点的高度差补偿 scrollTop。

本轮只读观测沿用 5k/900、21 步 navigation 夹具，真实已构建应用、独立 profile、无产品变换；6 次首次/重复点击仍全部复现原失败。首个点击的关键状态：

| 阶段 | 高度表中的表格 / 锚点 |
| --- | --- |
| 点击前 | 表格源码 8–3860，高 14408.28125；scrollTop=305；总估高 365836.328125 |
| 第一轮派生装饰事务后 | 表格高降为 35.09375；总估高 351463.140625；DOM cell 高仍为 6845.859375 |
| 后续同步事务 | 锚点换为源码 4031（表格后段落），旧 top=244.890625；目标 head=153 仍在表格内 |
| CM 测量恢复后 | 表格恢复 14408.28125；该段落新 top=14618.078125；差值 14373.1875 |
| 应用/CM 滚动 | 应用请求 455.484375，然后 CM 默认源码几何请求 13841.203125 |

该基线保留 scrollTarget，所以最后走目标滚动分支。旧失败候选 05 删除 scrollTarget 后，实测从约 455 再写到 14838.84375，调用栈在 `EditorView.measure` 锚定分支。两次 acquisition 的初态不同，**不能把本轮的 14373.1875 冒充 05 精确锚差**；05 未记录私有锚点字段。新观测直接证明高度坍缩及锚点错选机制，与 05 的锚定调用栈一致。最终候选仍须证明处理目标后没有稍晚一轮锚定残留。

## 公开接口和实现边界

实际依赖 `@codemirror/view@6.41.0`；本地 `dist/index.js` SHA256 `c52b64a68ead2cf4683b8a2e5691ce6e168cdb843824aeba3f556bc977303319`。优先读取锁定版本本地 JS/d.ts；官方文档站本次 403，另核对了同版本官方 GitHub 源码。

- `EditorView.scrollHandler` 是公开接管接口，返回 true 消费这一次滚动，禁止在回调中启动 editor update。现有 `src/renderer/search-runtime.ts:88` 已使用它。CM 6.41.0 的目标分支在 handler 返回后清除目标、重置本轮局部锚定基准并继续测量。因此本设计利用现有滚动生命周期，而不是写私有锚点。这个具体执行次序是锁定版本源码事实，并非对未来版本的 API 保证。[官方 editorview](https://github.com/codemirror/view/blob/6.41.0/src/editorview.ts)、[官方 extension](https://github.com/codemirror/view/blob/6.41.0/src/extension.ts)。
- `requestMeasure` 可用于几何读写协调，但其 write 先于最终目标/锚定分支。把 cell 滚动留在这里、再加一个 handler，会保留双重所有者，不能作为候选。
- `WidgetType.coordsAt` 是公开坐标扩展，可从根本上改善 widget 的源码到像素投影；但本任务首个候选不选它：它影响所有坐标查询、选择绘制和其他命中路径，且单独修改不能消除应用的第二次滚动，仍须处理 pointer preserve 意图。[官方 tile 调用](https://github.com/codemirror/view/blob/6.41.0/src/tile.ts)。
- `scrollSnapshot()` 公开，但记录的是文档块锚点和相对距离，不是 cell caret。它绕过普通 scrollHandler，且不能替代有意的跨屏导航，不用于本修复。
- 不修改 `viewState`/heightMap/scrollTarget/scrollAnchor，不 patch CM measure，不全局关闭滚动或浏览器锚定，不强制所有 table 保持挂载，不伪造固定 estimatedHeight，不通过隐藏布局变化或循环 scrollTop 补偿掩盖问题。本轮观察器读取私有字段仅作诊断，不能进入产品。
- 精确的已测高度缓存属于另一项可选公开 `estimatedHeight` 优化，须考虑文档、列宽、字体、主题、DPR、活动模式失效；当前不纳入第一候选。也不通过让 `eq` 忽略活动 cell 来阻止必须的 preview/plain 同步。

## 第一候选的最小改动点

1. **`viewport-reveal.ts` 或邻接小模块**：新增表格专用的目标解析/几何读取/一次性消费逻辑。复用已有 delta 计算中对小目标的最近滚动；不更改图片或其他块的通用 oversized 行为。目标携带 view/session/document 代次、规范 table/cell 身份、源码 range、意图。不能只按 activeElement 或 CSS class 接管任意滚动。新导航覆盖旧请求；完成、失效、销毁即清理。
2. **`extensions/markdown.ts`**：在现有表格选择/跨格调用边界记录 pointer-preserve 或 keyboard-nearest 意图；保留既有语义事务及其 scrollIntoView。焦点微任务维持 preventScroll 和原选择策略，但表格不再调用独立 element reveal 写滚动。在 markdown 扩展中注册只处理已核验 collapsed table target 的 handler。搜索 range、source mode、表格外、过期请求均不误吞。若发现某个非事务焦点路径没有滚动目标，只能在正常更新边界安排一次显式 offset effect；绝不在 handler 内 dispatch。
3. **`src/renderer/search-runtime.ts`**：保留查询/结果真实性校验、非折叠搜索选区、搜索框焦点和离屏挂载行为。现有 search handler 使用同一几何帮助函数，把整 cell 矩形改为实际匹配片段，单独拥有已核验搜索 range；与 collapsed handler 的谓词互斥，不靠不透明 precedence 顺序获胜。现有 handler 无须另造第二套搜索状态。
4. **测试/探针及必要的局部几何帮助函数**。首候选不改 semantic transaction 适配器、撤销、组合输入状态机、TableWidget 的原节点保存恢复、列表 caret CSS 或列宽算法。如必须新增 preview 源码映射，仅增加可验证的局部几何映射；不得重建 cell 编辑 DOM 来方便测量。

### 几何及意图契约

- pointer 点击：在默认鼠标选择完成、preview/plain 转换稳定后，读取归属当前 cell 的真实 DOM Selection/Range。caret 已在可见客户区则 delta=0（pointer 不套键盘舒适边距）。超高 cell 的中部可见也不对齐 cell 顶边。不能在 mousedown 的旧 selection 上提前认定最终 caret。
- keyboard 跨格/输入：使用现有焦点和 selection 逻辑确定最终 cell/offset；只让 caret 越过安全边界的部分滚入，沿用已有边距并限制在实际可用客户区内。目标是 caret，不是高达数千像素的 cell。range 高度大于视口时按活动端/实际可见片段处理，不能退回整个 cell 上边缘。
- 必须校验 DOM Range 归属、连接状态、规范 offset、有限且有正行高的矩形；不能把 stale/零高 Range 当成功。优先原生 collapsed Range/client rect；空 cell、软换行 affinity、双向文本等没有可靠 caret 几何时，最多允许与该请求绑定的一次正常布局重测，仍无效即把该用例标失败并停止宣称修复。不可用插入隐藏字符或改 Selection 的方式“测出”caret。
- 搜索保持非折叠规范选区和搜索框焦点，用只读临时 DOM Range 表示命中片段。preview textContent 与源码不恒等（转义、实体、hardBreak 等），不得直接 source-offset 减起点后无条件数 textContent；只可在验证一一对应时使用该捷径，否则使用规范 inline/source 映射。匹配隐藏语法时须落到对应可见 token 边界并记录语义，不得声称隐藏文本本身可见。无法准确映射的类别是明确停止点，不能静默吞掉滚动后算成功。
- 使用真实 clipping/client 区域而非含边框滚动条的外框；横向还须处理 `.cm-table-widget` 自身 overflow-x 容器，再处理外层 scroller。先读完全部矩形、后按真实滚动量换算和写入，避免通过滚整个页面使列“可达”。CSS transform/zoom 时按实际比例换算，不能假定固定 DPR。当前只证明 DPR1。
- handler 不改变焦点、选择、文档或历史，只完成当前已核验目标的滚动并 return true。一个已可见目标的零位移也是正常消费，不能 return false 让 CM 又按整张表格滚。
- 未挂载目标仍保留 CM 原滚动目标以推进虚拟化。只有挂载后且身份/几何可证实时消费；未解析时不能一律 true。第一候选若在正确挂载时机仍拿不到目标，记录失败并停止，不增加永久强制挂载或无限重试。未知目标可走原默认行为，但不计为通过。

## 预期事件顺序与可证伪假设

1. 用户事件 → 记录当前表格操作意图 → 原语义事务更新规范 selection，并保留 scrollTarget；已有派生装饰事务正常运行。
2. 既有 DOM 复用/原节点恢复 → 正常焦点微任务和浏览器默认 selection 完成；此时不独立滚动。
3. CM 按目标更新 viewport、挂载 replacement、测量真实高度，期间允许估高收敛；不能跳过虚拟化机制。
4. 最终 scrollHandler 核验目标、读取最终 caret/匹配矩形和 clipping 区，零次或必要的一次受控滚动；返回 true，不 dispatch。
5. CM 消费目标并重新建立正常锚定基准；下一轮测量和后续 idle frame 不应再出现将该 cell 推离视口的额外位移。

核心假设 H1：由同一个 CM 滚动目标在最终阶段完成 cell reveal，可以同时去掉独立 element reveal 与错误整块几何，并让本轮估高恢复不再触发错误旧锚补偿。**源码支持这一预测，尚没有候选运行证据。** 若首个 5k/900 top 点击在 handler 前、或消费后仍出现大跳，H1 被证伪，停止扩展；保留序列再判断是否另需高度估计生命周期修复，不能追加 rAF 拉回。

需要的观测严格限于现有探针加少量字段：事件序号/时间、transaction selection 与 scroll flag/effect、目标身份和意图、handler 命中/拒绝原因、scroll 写入归属及值、DOM/native selection 和有效 caret 矩形、cell/widget 身份与矩形、viewport/visibleRanges、几何/高度变更标志。诊断可额外只读锚点和高度表，产品不可依赖它们。覆盖从 mousedown 到最后 click/微任务/测量及闲置帧；不能只比较 550ms 最终截图。固定 observation 结束，禁止无限采样。

## 分阶段验证与停止条件

先对单个 5k/900 top 首次/重复点击实施候选；若六种基本操作（首次、重复、Tab、Shift+Tab、Down、Up）任一几何/焦点/历史不符，停止，不扩大矩阵。

通过后复跑同协议 5k/20k × 900/1200 × top/middle/bottom：原 24 个可见点击必须 24/24 保持真实 caret 可见且无不必要位移；48 个键盘动作须从独立准备好的合法可见起点测试，不能沿着旧失败位置串测后算成功。除原 84 步外，补高 cell 顶部/中部/底部点击、部分可见/完全离屏格、左右溢出列、空格及富文本格、Tab 末行追加、跨屏/段落出口、输入增高及删除缩小、文档末尾、窗口收窄、滚轮中止待办。已有 Search acquisition 不完整，需修正驱动命中检查并走真实 Find UI 验收顶/中/底、next/previous、离屏结果及隐藏语法类别；公开 offset fixture 不能替代搜索通过。

真实 caret 需自有前台窗口像素证据辅以 DOM/规范选区；capturePage/零高 Range 不能独立证明 native caret。点击已可见 caret 的容许误差仅为量化/设备像素误差，不是固定补偿参数。最近滚动的期望值由当次几何计算并验证，不能用“少于某个大像素阈值”放宽。

最终候选需独立审查、build/typecheck/lint、相关测试与完整回归，并重跑 caret 53/53、普通46/46、扩展25/25、窄窗34/34；原生表格撤销99/99与文档撤销57/57各两次。大表格另测实际输入/保存/undo，不能用短夹具成绩替代。原生 undo 节点身份、规范文本、选区或 IME 行为被改动则回退候选；未做真实 OS IME 时继续明确未测。既有 symlink unexpected skip 不获新批准就仍使严格门禁失败。

发现额外 CM 锚定大跳、目标被虚拟化移除、测量不能稳定、未挂载目标不可达、search focus/选区被抢、原节点被替换或新增重复历史帧，均停止并保留失败证据。不靠降低样例长度、放宽 allowlist、固定像素补偿、每帧恢复 scroll、全局禁滚动或混入高度缓存来“通过”。

## 本轮交付与状态

新增 passive run 位于 `.artifacts/table-scroll-design-20261010/01-5000-900-passive`，完整 21 步，复现六次 click 失败；未运行修复候选。观察器直接读取 CM 私有状态、委托原 dispatch/scroll setter，未写锚点字段。保存诊断 runner、报告、截图、fixture 和精确版本哈希，排除 userData；持久归档 `reports/experiments/table-scroll-design-20261010/`。

本轮未重复 build/full test（产品零修改）；上一阶段通过与失败保持原状态：build/typecheck/lint 通过，strict full 3313 PASS +10 exact known +1 symlink unexpected skip FAIL，caret 和 undo 矩阵已通过；不得把本轮诊断记为新修复验收。Typora、OS IME、冻结 cp13/cp16、Library 阻塞均未触及。M9 未完成。
