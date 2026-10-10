# 首个 table caret scrollHandler 候选：首项失败，完整撤回

基线 `af688331006ff855d44891c3d6b1e35c5368c9cc`。按 TASK013 实施首个 collapsed table caret 候选；保留语义 `scrollIntoView`，表格 focus 不独立调用 element reveal，使用公开 `EditorView.scrollHandler` 校验当前 document/head、mounted plain cell、焦点、DOM Selection 归属、规范 cell offset 及正行高 Range，再按真实 caret 作最近滚动。已可见 caret 的零位移也正常消费；无效 caret/未知目标返回 false。未写 CM 私有状态、未全局禁滚动或逐帧补偿。

仅修改 `extensions/markdown.ts`，新增 `table-caret-reveal.ts`。首项前没有实现搜索片段、横向嵌套 overflow、跨屏重试或扩展矩阵。候选 patch SHA256 **930aa74b1894bfad5bc69a0da2814f9aef537918edffa0b2b36429a03b1326de**，两个源文件原始字节 SHA256：

- markdown.ts：`2c1968d5a27bcab4e06789b53c41319c1a4dcd28155f0469297716c3bcb95d35`
- table-caret-reveal.ts：`1558fef2e808206df7476fdf131337eba7768bdda306eaa43db40d64b7f014b7`

## 首项 gate FAIL

YULUSTATION，5k/900，沿原公开 offset **fixture setup** 协议，仅 top 区域：1 setup + 首次/重复点击、Tab、Shift+Tab、Down、Up，共7步 acquisition 完成。所有输入仍为真实构建应用的 trusted Electron events，独立 profile。没有把 fixture navigation 称作真实 Search 通过。诊断读取 CM 私有高度表/锚点仅用于观察，不在产品中使用。

首次点击的 cell 顶部可见，scrollTop305。约事件开始58ms内，scroll-write 将它直接写到13841.203125（实际scrollTop13841），**+13536px**。中途连续 rAF 和终态都维持跳后位置；不是最后一帧恢复后误报通过。002-before/after capturePage 实际图像确认从第一行长 cell 跳到13–15后部行。Range 高为0、规范 selection153仍在原cell1:1。

写入栈是 CM `DocView.scrollIntoView → EditorView.measure` 的默认源码矩形滚动，不是候选 handler 的有效 caret 消费，也不是该次 measure 的锚定补偿分支。与原基线相比，应用 `305→455` 独立写入已消失，但默认整个 replacement table 滚动仍发生。

高度表轨迹仍记录从365836.328125降到351463.140625并恢复，表格高14408.28125→35.09375→14408.28125，锚点转为表格后源码4031；全过程记录在report.json的dispatch/dispatch-after/frame/scroll-write/native-call及事件序列中。它证明首项失败，**不验证也不证伪 H1“成功消费后会否再被锚定覆盖”**，因为本次根本没有有效 caret 路由。

03 repeated click之前驱动显式 `prepareVisible` 重新定位，后续零位移不能算首次点击自动恢复。Down/Up分别+6385/-6219仍作为原始数据保留，未独立准备合法起点，不能算额外通过。发现失败后没有执行另一轮候选、没有扩到84步、没有改搜索或重跑caret/undo，未降低样例或放宽门禁。

## 独立审查与撤回

`/root/heading_geometry_review` 只读复核首项和候选源码，结论：首项失败，停止扩大矩阵合理；没有盲吞无效请求；H1尚未测到。上游 `hasOwnedSelection` 只证明节点在editor里，不能识别 preview→plain 后虽仍属editor却没有有效caret几何的选区，可能跳过必要恢复。这是下一阶段应验证的缺口；本轮不继续修改来掩盖失败。

先保存精确patch与两个完整候选源文件，再 `git apply --check --reverse` / `git apply --reverse` 完整撤回。独立审查第二次确认产品 diff HEAD为空，新helper已不存在；table-widget SHA256仍 `1ed5826db1c80f3b71c23ecee2108dfc4c7aac80f48371b0af8ebe4dbeb92079`。renderer构建恢复通过。没有遗留候选产品代码。

验证状态：候选 renderer build PASS、renderer tsc PASS；首项 UI FAIL。恢复后的 renderer build PASS。因停止条件生效，未运行候选完整build/typecheck/lint/full gate、真实Search、扩大矩阵、caret/undo或大表格保存/composition验收，不把类型/构建通过等同修复通过。

既有安全产品仍为caret `a4fb6020952da0ae887db9a4127088023f0d5c01`，undo `8505074869c68554ddbc818fbaaffff6b72ff93c`，此前caret53/53、46/46、25/25、34/34及native99/99、document57/57各两次状态保留，未宣称本轮新复验。此前strict full3313+10 exact known+1 symlink unexpected skip仍FAIL。原生OS IME未测。

候选patch/源文件、7步report/逐帧轨迹/图片/fixture、driver、build/typecheck/恢复log均保存于 `.artifacts/table-scroll-candidate-20261010`，持久归档 `reports/experiments/table-scroll-candidate-20261010` 排除userData。报告仅为失败检查点，不接受产品修复，不push，不代表M9完成。
