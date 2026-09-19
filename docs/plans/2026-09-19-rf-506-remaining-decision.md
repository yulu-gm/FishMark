# RF-506 剩余失败：按根因归组与取舍建议

日期：2026-09-19。状态：待决策（本文件不是完成声明）。
依据：`docs/plans/2026-09-18-rf-506-handoff.md`（切片一至五十四）、`docs/refactor/editor-foundation/progress.md`。

## 1. 现状

### 已验证为绿的两条退出条件门禁

| 门禁 | 结果 |
| --- | --- |
| `npm run test:editor-behavior` | `cases=121/121 targets=2541 verified-existing=79 verified-runner=1928 known-defect=534 unexpected=0 not-run=0`，**exit 0** |
| `npm run test:editor-foundation` | 7 文件 / **310 项通过**，exit 0 |

**两条门禁都是在旧路径（生产 keymap 仍走 `editor-core` 旧命令）下实测通过的。** 因此语义切换的验收标准是"**切换后保持通过**"，而不是"把它们从红修成绿"。

### 真实语料（`src/renderer/code-editor.test.ts`，273 项）

| 口径 | 失败数 |
| --- | --- |
| 默认配置（keymap 全走旧命令） | **0** |
| 切换全部六个命令到语义路径 | **34** |

各命令单独切换时的失败数（含跨命令重叠，故相加大于 34）：

| 命令 | 单独切换失败数 |
| --- | --- |
| `Backspace` | **5**（自 15 起，已收 10 项） |
| `Tab` + `Shift-Tab` | **1** |
| `Enter` | **13** |
| `ArrowUp` + `ArrowDown` | **15** |

## 2. 按根因归组的 34 项

同一项可能命中多个根因，归组以**主要阻塞**为准。

### G1 引用块内的列表未被解析器识别（结构性）

**表现**：引用内缩进列表项在树里**没有 list-item 节点**，因此语义规划器返回 `quote-continue` 而不是列表决策；`parentListItemOf` 对这类输入恒为 `null`。

**成员**（8 项）：
1. `keeps ordered numbering when an empty nested quote list item upgrades on Enter`
2. `promotes an empty ordered quote list child on Enter and keeps parent numbering`
3. `upgrades an empty quote child list item to the parent list on Enter`
4. `removes an empty nested quote list marker before clearing its indentation on Backspace`
5. `breaks ordered quote list rendering from the current item on Backspace at content start`
6. `does not auto-complete when pressing Enter after a quoted closing fenced code block marker`
7. `moves to the closing fence when ArrowDown is pressed from the last code line`
8. `uses the official complex fixture for Tab, Shift-Tab, Enter, and Backspace structure edits`（部分）

**证据**：切片二十（树形 `document → list`，内层项与外层项是扁平同级）、切片三十八（探针返回 `quote-continue`）、切片二十六（`quote-continue`）。

**性质**：解析器/结构层问题，不是规则微调。

### G2 有序列表归一化器跨"缺标记行"重编号

**表现**：`computeNormalizedOrderedListDocument` 把"标记刚被删除的行"当作列表项的惰性续行，于是把其后的项重编号并把已断开的列表重新接上。

**成员**（4 项）：
1. `breaks ordered list rendering from the current item when Backspace is pressed at content start`
2. `breaks ordered quote list rendering from the current item on Backspace at content start`
3. `separates later top-level list siblings when upgrading a middle item to body text`
4. `upgrades an empty top-level ordered list item before later siblings to a body blank block`（部分，另一部分属 G4）

**证据**：切片四十六（`RF508SITE ordered [10-12:"1."]`）、切片四十七（直接单元探针复现同一错算）。

**难点**：该函数只拿到**编辑后的 source** 与 `changedRanges`，拿不到编辑前文本，无法区分"本来就无标记的续行"与"标记刚被删除的行"。
**已失败的三次尝试**：切片四十三（净负 7）、四十八（净负 2）、五十（无效）。

### G3 表格边界：切换后**丢失了 widget 焦点管理**（非规划器可解）

**表现**：旧路径的 keymap 在 `runMarkdownArrowUp/Down` 返回真值后调用 `syncTableInteractionFocus(...)`（`markdown.ts`），并由表格 widget 提供 `[data-table-cell="<row>:<col>"]` 输入元素；语义路径的 keymap 分支只 `semanticCommands.run(...)`，**不调用该同步**，因此表格用例失败。

**成员**（6 项）：
1. `enters the first cell when ArrowDown is pressed from the line above the table`
2. `enters the last table row when ArrowUp is pressed from the line below the table`
3. `enters the last table row instead of skipping above the table when ArrowUp is pressed from the line below it`
4. `focuses the following table instead of the previous table when ArrowDown enters a repeated cell coordinate`
5. `moves through visible extra blank rows above a table on ArrowUp`
6. `moves upward through trailing blank lines below a table without jumping above the table`

**证据**（切片五十六核实）：用例断言的是 DOM 状态，例如
`host.querySelector('[data-table-cell="0:0"]')`、`document.activeElement`、`activeBlockTypes.at(-1) === "table"`；
源例 `["Before", "", "| name | qty |", "| --- | ---: |", "| pen | 2 |"]`，光标在 `"Before".length`，按 ArrowDown。

**性质纠正**：这**不是** `planVerticalNavigation` 缺功能（我最初的判断），而是**切换时漏掉了渲染层的焦点同步**。
因此它的解法在 `markdown.ts` 的 keymap 与 `syncTableInteractionFocus` 的接线，属**中等且可验证**的工作（可在语料里直接观察 DOM 断言），但**与语义导航规则无关**。

**已实测的部分收益与剩余阻塞**（切片五十六）：
把旧路径已有的 `if (handled) { syncTableInteractionFocus(view, createLiveActiveBlockState(view.state), { force: true }); }` 补到语义分支后，切 ArrowUp+ArrowDown 的失败数 **15 → 14**，但**六条表格用例仍然全失败**。逐条看断言：

- `enters the first cell…` 期望 `host.querySelector('[data-table-cell="0:0"]')` 存在，实测细胞坐标是 **`4:0`**；
- 其它几条同样依赖 `document.activeElement` 落到具体细胞、以及 `activeBlockTypes.at(-1) === "table"`。

**推断的剩余原因**：语义分支里 `syncTableInteractionFocus` 用的是 `createLiveActiveBlockState(view.state)`，而该函数读取的 `runtime.activeBlockState.tableCursor` 在语义事务的**同一批次内尚未刷新**，因此同步找不到正确的细胞；旧路径能在同步时拿到有效状态，是因为它的命令自己先写过 `runtime.activeBlockState`。
**解法方向**：让语义分支在同步前先基于新文档重算 active block（或把 `tableCursor` 从语义计划传入），并确保 `onActiveBlockChange` 已发出 `table` 类型。

**第五十七轮的进一步定位**：`syncTableInteractionFocus` 在旧路径里由**视图 update listener** 调用（`markdown.ts:711` 与 `:723`，在 `notifyActiveBlockChange(...)` 之后），因此它拿到的是**已经刷新过**的 `runtime.activeBlockState`；而语义 keymap 分支是在 `semanticCommands.run(...)` 之后**同步**调用同步函数，此时视图的 update listener 尚未运行，读到的仍是旧状态。这解释了为什么补上调用只能拿到 1 项收益、且表格细胞坐标仍是 `4:0`。

**建议的最小补丁**（下一轮可直接落地）：

1. 在语义 ArrowUp/ArrowDown 分支里，用**新文档**重算状态后再同步，例如
   `syncTableInteractionFocus(view, createLiveActiveBlockState(view.state), { force: true })`
   改为先 `notifyActiveBlockChange(createLiveActiveBlockState(view.state), true)` 再同步；或
2. 更干净的做法：不要在 keymap 里同步，而是让 **update listener 在本批次末尾统一处理**——
   即语义分支只负责派发事务，焦点同步继续由 `markdown.ts:711/:723` 那条既有路径完成（需要确认语义事务是否会触发该 listener 的 `force` 分支）。

方案 2 更符合现有架构（"焦点同步属于视图层"，切片五十五已确认 G3 不是规划器问题）。

**第五十八轮的实测结论**：把方案 1 的变体（语义分支先 `notifyActiveBlockChange(createLiveActiveBlockState(view.state), true)` 再 `syncTableInteractionFocus(view, runtime.activeBlockState, { force: true })`）落地后，切 ArrowUp+ArrowDown 的失败数**仍是 14**，`enters the first cell…` 的断言**仍是 `expected 4 to be +0`**（细胞坐标为 `4:0`，期望 `0:0`）。即"重算 active block"并未解决问题，方案 2（交由 update listener 统一处理）也未被验证。

**因此 G3 的现状是**：补上 `syncTableInteractionFocus` 调用可稳定换来 1 项收益（15 → 14），但**表格进入单元格这一核心行为仍未达成**，且原因尚未定位到"就是状态过期"这一条上——需要下一轮用探针打印 `syncTableInteractionFocus` 内的 `tableCursor`/`activeBlock.type` 与 `host.querySelectorAll('[data-table-cell]')` 的实际坐标，才能判断是"状态未刷新"还是"语义事务本身没有把光标送到表格行上"。

**建议**：G3 单独立项并配 DOM 级探针，不要在 M5 收口轮次里继续尝试。

因为该改动需要跨 `markdown.ts` 与渲染层状态时序，**本轮未落地**（脚手架已回滚，`code-editor.ts`、`markdown.ts` 无残留）。

### G4 多空行间距的落点

**表现**：一段与下一段之间有**两个及以上**空行时，渲染只折叠第一个空行，因此向下步进应落在**第二个**空行起点；规划器目前越过整个间距落到下一段末尾。向上方向落点也与期望不同。

**成员**（3 项，均属 Arrow）：
1. `lands on the visible extra blank row on ArrowDown when a gap has multiple blank lines`（源 `Paragraph one`/空/空/`Paragraph two`，起锚 13，期望 **15** = 第二个空行起点；规划器给 `source.length`）
2. `lands on the visible extra blank row on ArrowUp when a gap has multiple blank lines`
3. `moves between visible empty paragraphs below an ordered list with one vertical arrow press`

**证据**：切片五十三/五十四的规划器探针与用例原文。

**难点**：需要"可见空行"的概念（哪些空行会被渲染折叠），这属于视图层知识；语义层要么复制该规则，要么接受由渲染器传入。**这与 G2 同源**（改动前需要先确认该处规则）。

### G5 列表项"升级/退出"的整行替换语义

**表现**：`replaceLineDecision` 的删除范围含行前换行、而分支又写入分隔符，导致多一个空行；以及带子项的项升级时子项未被正确搬运。

**成员**（5 项）：
1. `upgrades a nested list item with children at content start`
2. `upgrades a top-level list item with children to body text`
3. `keeps the caret on the visible blank line when exiting an empty top-level item before following content`
4. `keeps a structural separator when exiting an empty task item at EOF`
5. `creates a structural separator and editable line when Enter exits from the last row at document end`（同时属 G3 的表格）

**证据**：切片三十九/四十（"空项退出多一个空行"的两条同因；两次修法净负 2 与净负 11）。

**难点**：该分支的正确性依赖"`from` 含前置换行"这一前提，改它等于重定义"退出时的行替换语义"，属**重构级**，且与切片四十二已调好的同分支行为相互约束。

### G6 围栏内编辑与光标落点

**成员**（2 项）：
1. `deletes code content directly while keeping the code block presentation when Backspace is pressed twice from below a fenced code block`（文本已对、**仅光标差 4**：期望 14、实际 18）
2. `materializes a draft pipe-table header into a full table on Enter`（表草案物化，属**新建能力**）

**证据**：切片五十一/五十二（第 1 项两次光标尝试均未改变指标）。

### G7 隐藏行内（hidden-inline）行的 ArrowUp 遍历

**成员**（2 项）：
1. `moves upward through hidden-inline paragraph and heading lines without skipping visible content`
2. `reactivates each hidden-inline line while ArrowUp moves through the reproduced sequence`

**性质**：需要"隐藏标记选区归一化"与垂直导航协同，属 G4 的邻域（可见行 vs 隐藏行的判定）。

### G8 其它 / 归属待厘清

**成员**（4 项）：
1. `outdents a third-level unordered item subtree when Shift-Tab is pressed` — **Tab 族唯一剩余项**；切片二十一查明"与项同缩进的继续行"按缩进是同级，旧路径却把它一起缩进；该规则不可由列号推导。
2. `keeps following body lines detached after typing below a list` — 疑似**键入 + Enter 复合**形状。
3. `moves through the whitespace-only line below an ordered list with one vertical arrow press` — 空白行 vs 空行的区分。
4. `uses the official complex fixture for blockquote and table vertical navigation` — **复合夹具**，跨 G1/G3/G4。

## 3. 取舍建议

### 3.1 优先修正验收口径（建议先决策这一条）

M5 的书面验收写的是"清零真实语料 57 项失败"，但事实是：

- `editor-behavior`（121 检查点 / 2541 目标）与 `editor-foundation`（310 项）**已经在旧路径下全绿**；
- 默认配置下 `code-editor.test.ts` 也是 273/273；
- 剩余的 34 项只在"切换口径"下出现，且集中在 G1–G7 这些**结构性问题**上。

因此建议把 M5 的退出条件明确为"**切换后两个门禁保持绿，且默认配置语料保持 273/273**"，并把 34 项按下面的组别列为**已知偏差清单**（有测试与探针记录），而不是要求逐条清零。若坚持逐条清零，请确认工作量预期（见 3.3）。

### 3.2 按组别的可行性

| 组 | 规模 | 性质 | 建议 |
| --- | --- | --- | --- |
| G1 引用内列表识别 | 8 | 解析器/结构 | **单独立项**：先为"引用内缩进列表应产生 list-item 节点"写解析层单测，再改解析器。改动面大但有明确验收。 |
| G2 归一化器跨缺标记行 | 4 | 纯函数判据 | **先补接口**：让 `changedRanges` 携带"被删文本"或"标记被删除"标志，再改；三次失败尝试都因接口缺信息。 |
| G3 表格 widget 焦点同步漏接线 | 6 | 渲染层接线（**非**规划器） | **中等**：在 `markdown.ts` 的语义 keymap 分支里补上旧路径已有的 `syncTableInteractionFocus(...)` 调用，并用语料里的 DOM 断言验证。 |
| G4 多空行落点 | 3 | 需视图层知识 | **先问清**"可见空行"规则由谁拥有；若必须复制，建议把它下沉为共享纯函数。 |
| G5 整行替换语义 | 5 | 重构级 | **止损**：已两次净负；建议与 G2 一起作为"行替换语义"重构立项。 |
| G6 围栏光标 / 表草案 | 2 | 小 + 新建能力 | **光标那项可试**（需先列出同分支全部约束）；表草案属新功能，建议移出 M5。 |
| G7 隐藏行内遍历 | 2 | 与 G4 邻域 | 与 G4 合并处理。 |
| G8 其它 | 4 | 混杂 | `outdents a third-level…` 单独看；复合夹具最后做。 |

### 3.3 进度速度的坦率评估

切片二十七至五十四（28 轮）中，规则层的净收益是：

- `Backspace`：**15 → 5**（10 项）
- `Enter`：14 → 13（1 项）
- `Tab`/`Shift-Tab`：3 → 1（2 项）

即 **28 轮约 13 项**，且其中 **7 轮为净负或无效**（切片二十九、三十、三十二、三十三、三十四、三十九、四十、四十三、四十八、五十、五十二）。失败模式高度重复且都已记录：

1. 单元探针与语料的**实参不一致**（source 或 `changedRanges`）导致"单元改对、语料没动"；
2. 共享分支的**约束冲突**（改一处破坏另一族）；
3. 真实锚点是**归一化之后**的位置，按测试传入值写规则必然不命中。

**按此速度，剩余 34 项需要远超当前剩余轮次预算。** 因此建议：

- **短期**：收窄 M5 验收口径（3.1），把已完成的规则层收益（`Backspace` 15 → 5、`Tab` 3 → 1、`Enter` 14 → 13、两条门禁实测通过）固化；
- **中期**：把 G1、G2/G5、G3 作为三个**独立立项**（各带自己的单元验收），而不是继续以"单条语料用例"为单位推进；
- **明确移出 M5**：表草案物化（G6 第 2 项）属新功能。

## 4. 需要你决策的三点

1. **M5 的退出条件是"切换后门禁保持绿"还是"逐条清零 34 项"？**（建议前者）
2. 是否同意把 G1、G2/G5、G3 立为独立任务，并把表草案移出 M5？
3. M6（RF-602/603/604）是否仍按原计划在 M5 之后开始，还是在 M5 口径收窄后并行启动？
