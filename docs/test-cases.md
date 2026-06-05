# FishMark 测试用例

本文用于开发自检、评审验收和回归覆盖。

---

## 1. 文件系统

### TC-004 打开现有 Markdown 文件

步骤：
1. 打开应用。
2. 从 `File > Open...` 打开 Markdown 文件，或按 `Ctrl/Cmd + O`。
3. 选择一个 UTF-8 编码的 `.md` 文件。

预期：
- 文件名和路径显示正确
- 文件内容被加载到当前文档文本区域
- 没有编码错误提示

### TC-004A 拖拽打开 Markdown 文件

步骤：
1. 打开应用并先载入一个任意 Markdown 文档。
2. 从系统文件管理器拖拽另一个 `.md` 文件到应用窗口内，落点放在工作区或编辑区表面。
3. 再从系统文件管理器同时选中两个或更多 `.md` 文件，一次性拖入应用窗口。
4. 依次切换这些拖入后创建的标签页，分别编辑并保存其中一个标签。

预期：
- 应用不会把拖入文件内容当作普通文本插入当前编辑器
- 如果当前窗口是空工作区，则在当前窗口打开被拖入文件
- 如果当前窗口已经有文档，则在当前窗口新增标签页打开被拖入文件
- 同时拖入多个 Markdown 文件时，每个文件都会创建自己的标签页，路径、标题和正文内容一一对应
- 连续切换这些拖入标签页时，不会把上一个活动编辑器里的正文同步到刚打开的其他标签
- 保存其中一个拖入标签时，只写回该标签对应的磁盘文件，不会覆盖同批拖入的其他文件
- 只有显式执行 `File > New Window` 时才会打开新窗口
- 不会出现原始文本导航窗口或新的独立 dev 实例

### TC-004B 标签页工作区基础流

步骤：
1. 打开应用，通过 `File > Open...` 打开一个 Markdown 文件。
2. 再通过 `File > Open...` 打开第二个 Markdown 文件。
3. 观察顶部标签栏是否同时出现两个标签，并确认第二个标签处于激活态。
4. 点击第一个标签，确认编辑器切回第一个文档内容。
5. 通过 `File > New` 新建一个未保存标签页，并输入几行文字。
6. 观察新标签上的未保存标记，再切回前两个标签，确认它们内容未被替换。

预期：
- 当前窗口可以同时持有多个 Markdown 标签页
- 新打开的文档不会替换已有标签，而是在当前窗口追加新标签
- 点击标签后，单个活动编辑器实例会切换到对应文档内容
- `File > New` 会在当前窗口创建新的未保存标签页
- 活动标签编辑后，标签栏会显示未保存状态；其他已加载过的非活动标签内容不会被错误清空

### TC-004C 标签排序、关闭与拖出成新窗口

步骤：
1. 在同一窗口中依次打开三个已保存的 Markdown 文档。
2. 拖动第三个标签到标签栏最前面，观察标签顺序变化。
3. 点击一个已保存标签的关闭按钮，确认只移除该标签。
4. 再把剩余任一标签从标签栏向窗口外拖出，直到创建新窗口。

预期：
- 标签栏顺序会按拖动结果更新，不会把活动编辑器实例重建成第二套视图
- 关闭一个已保存标签时，只影响目标标签；其他标签与当前窗口状态保持稳定
- 拖出后的标签会进入新窗口并成为该窗口的活动标签；原窗口保留剩余标签

### TC-004D 逐标签未保存关闭与窗口关闭

步骤：
1. 在同一窗口中打开两个已保存的 Markdown 文档，并分别编辑内容让两个标签都进入未保存状态。
2. 先关闭其中一个 dirty 标签，观察关闭确认流程。
3. 在关闭确认中先走一次取消或返回路径，确认另一个 dirty 标签不受影响。
4. 再次关闭同一个 dirty 标签，并按预期完成保存、放弃或关闭后的处理。
5. 保留另一个 dirty 标签不保存，直接关闭整个窗口。
6. 观察窗口关闭时的确认流程，确认会按当前窗口中剩余的 dirty 标签逐个处理。

预期：
- 关闭单个 dirty 标签时，只处理目标标签的未保存状态，不会把同窗口其他标签一并卷入
- 单标签关闭确认取消后，原窗口与其他 dirty 标签保持原状
- 对目标标签完成保存或放弃后，只有该标签被关闭；其余标签继续保留
- 关闭窗口时，会按该窗口中剩余的 dirty 标签逐个处理未保存状态，而不是只看最后一个活动标签
- 单标签关闭与窗口关闭都不会破坏其他标签的保存状态、路径和编辑内容

### TC-005 保存当前 Markdown 文件

步骤：
1. 打开一个已有的 `.md` 文件。
2. 在临时编辑区修改文本。
3. 从 `File > Save` 保存，或按 `Ctrl/Cmd + S`。
4. 在磁盘上重新读取该文件。

预期：
- 界面显示未保存状态，再切回已保存状态
- 原路径文件内容更新为当前编辑文本
- 没有自动重排整个 Markdown 文档
- 状态条中的保存状态与自动保存状态能够同步反映当前文档状态

### TC-006 另存为已有 Markdown 文件

步骤：
1. 打开一个已有的 `.md` 文件。
2. 修改文本。
3. 从 `File > Save As...` 另存为，或按 `Shift + Ctrl/Cmd + S`。
4. 选择一个新的 `.md` 路径。
5. 在磁盘上读取新文件。

预期：
- 新路径文件成功写入
- 当前文档路径更新为新路径
- 原文件不会被本次另存为覆盖

### TC-008 最近文件列表

步骤：
1. 打开应用，通过 `File > Open...` 打开一个 Markdown 文件。
2. 关闭当前标签页或回到空工作区。
3. 观察空工作区中的最近文件列表。
4. 点击刚才打开的文件项。
5. 将一个最近文件路径在系统外部移动或删除，再从最近文件列表点击该项。
6. 打开设置中的 `最近文件`，把最多保留条数改为 `0`，再恢复为默认值。

预期：
- 最近文件列表显示成功打开或保存过的 Markdown 文档名称与路径
- 窗口高度较小时，最近文件列表在自身区域内滚动，不遮挡或截断列表操作
- 点击最近文件会在当前 workspace 中重新打开该文档
- 失效路径打开失败后会从最近文件列表中清理
- 重复打开同一路径不会出现重复项，而是移动到列表顶部
- 最近文件上限为 `0` 时列表为空，恢复上限后继续按新成功打开 / 保存的文档重建

### TC-007 外部文件变更冲突

步骤：
1. 打开一个已有路径的 `.md` 文件。
2. 在 FishMark 内修改文本，但先不要手动保存。
3. 在系统外部编辑同一路径文件并保存。
4. 回到 FishMark，观察冲突提示。
5. 先点击“保留当前编辑”，等待超过 autosave idle delay。
6. 再按 `Ctrl/Cmd + S`。
7. 重新打开原文件，再次在系统外部修改后点击“重载磁盘版本”。
8. 最后把当前文件在系统外部删除或重命名，回到 FishMark。

预期：
- 外部修改后会出现明确提示，并提供“重载磁盘版本 / 保留当前编辑 / 另存为新文件”
- 选择“保留当前编辑”后，autosave 不会静默覆盖原路径
- 在保留当前编辑状态下按 `Ctrl/Cmd + S` 时，会走 `Save As`，而不是直接覆盖原文件
- 选择“重载磁盘版本”后，编辑器内容与磁盘一致，dirty 状态清除
- 文件被删除或移走后仍有明确提示，且不会继续对失效原路径执行 autosave

### TC-001 新文件往返

步骤：
1. 打开应用。
2. 新建文档。
3. 输入内容。
4. 保存文件。
5. 重启应用并重新打开文件。

预期：
- 内容与输入一致
- 打开时没有编码问题

### TC-002 自动保存

步骤：
1. 打开一个文档。
2. 输入新内容。
3. 不手动保存，先等待停止输入后的自动保存触发。
4. 再次输入新内容，并让编辑器失焦。
5. 如需验证失败安全，模拟一次写入失败。
6. 重新检查当前界面与磁盘文件状态。

预期：
- 停止输入后会触发自动保存
- 编辑器失焦时会触发自动保存
- 自动保存不会弹出另存为对话框，也不会改变当前路径
- 自动保存失败时，当前编辑内容仍保留在内存中，文档保持未保存状态
- 状态条会显示自动保存进行中、已保存或失败等明确状态

### TC-018 编辑器壳层与状态条

步骤：
1. 打开应用并载入一个 Markdown 文档。
2. 调整窗口宽度，观察中间文档画布是否随窗口同步伸缩。
3. 观察左侧窄侧轨是否始终保留。
4. 触发保存、自动保存和文本编辑，观察状态条中的状态与字数变化。
5. 打开设置抽屉，再按 `Esc` 关闭。
6. 在设置抽屉打开期间，在编辑区继续输入文本或切换光标位置。

预期：
- 主界面采用轻侧轨 + 工作区画布 + 左侧设置抽屉 + 状态条的结构
- 文档画布会随窗口大小一起调整，但仍保持适合写作的阅读宽度
- 状态条清晰展示保存状态、自动保存状态和字数
- 打开设置抽屉不会破坏当前文档内容、光标位置、滚动位置或未保存修改
- `Esc` 可以关闭设置抽屉
- 设置抽屉开合过程不会把编辑器重建成另一个文档视图

### TC-019 工作区对齐与固定底栏

步骤：
1. 启动应用，保持空态。
2. 观察顶部品牌信息、右侧提示文案与中间欢迎卡片的相对位置。
3. 打开一个 Markdown 文档。
4. 观察文档头、编辑器外框和空态欢迎卡片是否共享同一条居中画布轴线。
5. 打开一个较长文档并滚动到底部附近。
6. 观察状态条是否仍固定在应用底部，并确认最后几行内容没有被遮挡。

预期：
- 顶部信息带与主画布关系稳定，不会出现空态卡片和文档画布“歪向另一套左边界”的观感
- 空态欢迎卡片、文档头和编辑器外框共用同一条居中画布列
- 状态条固定在应用底部，不随着文档滚动消失
- 滚动到文档末尾时，状态条不会遮挡最后几行内容

### TC-003 崩溃恢复

步骤：
1. 编辑一个已打开文档。
2. 异常终止应用。
3. 重新打开应用。

预期：
- 最近一次未保存状态被恢复

## 2. 编辑行为

### TC-010 标题输入

步骤：
1. 输入 `# hello`。

预期：
- 识别为一级标题
- 光标保持稳定

### TC-011 列表行为

步骤：
1. 输入 `- item`。
2. 按 Enter。
3. 输入第二项。
4. 连续按两次 Enter。
5. 输入以下有序列表与后续段落：
   ```md
   Ordered

   1. Lorem ipsum dolor sit amet
   2. Consectetur adipiscing elit
   3. Integer molestie lorem at massa

   You can use sequential numbers...
   2. ...or keep all the numbers as `1.`
   ```
6. 将光标放在 `You can use sequential numbers...` 开头，按 `Backspace`。
7. 将光标放在 `4. You can use sequential numbers...` 的 `can` 前，按 `Enter`。

预期：
- 列表可以正确续项
- 空项时可以退出列表
- `Backspace` 将段落接回上一条有序列表项后，光标停在接入文本 `You` 之前，不跳到列表末尾
- 有序列表项中间按 `Enter` 分裂当前项后，光标停在新列表项正文开头，不跳到列表末尾
- 后续有序列表 marker 会继续自动归一编号，但归一化不能用整段 list replacement 吞掉光标位置

### TC-011A 列表层级快捷键

步骤：
1. 输入以下无序列表：
   ```md
   - parent
     - child
     - leaf
   - sibling
   ```
2. 将光标放在 `leaf` 内，按 `Tab`。
3. 将光标继续放在 `leaf` 内，按 `Shift+Tab`。
4. 输入任务列表：
   ```md
   - [ ] parent
     - [x] done
     - [ ] next
   ```
5. 将光标放在 `next` 内，按 `Tab`。
6. 如需自动化回归，运行 `npm run test -- packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts`。

预期：
- 二级无序列表项可以继续缩进为三级列表，`Tab` 不会跳到外层 UI 焦点框选
- `Shift+Tab` 会把当前列表项 subtree 升级一层，子列表和延续行跟随移动
- `Tab` / `Shift+Tab` 改变列表层级时，编辑器滚动位置保持稳定，不会因为整段列表被重建而跳动
- 当前 scope 的第一项或唯一项不能被 `Tab` 缩进
- 顶级列表项不能被 `Shift+Tab` 升级
- 任务列表缩进时保留 checkbox 状态
- 有序列表缩进和反缩进后继续按当前 scope 重新编号

### TC-011B 子列表编辑态零位移

步骤：
1. 输入以下多级列表：
   ```md
   - parent
     - child
     1. numbered child
     - grandchild
   ```
2. 把光标分别放到 `child` 和 `grandchild` 内容中，观察 active 编辑态。
3. 再把光标移到列表外普通段落，观察 inactive 阅读态。
4. 在窄窗口下重复上述步骤，确认软换行仍对齐正文起点。
5. 如需自动化回归，运行 `npm run test -- src/renderer/editor-source-layout.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts` 和 `npm run test:list-geometry`。

预期：
- 子列表从阅读态切到编辑态时，同一层级正文起点不能产生任何水平位移
- 子列表从阅读态切到编辑态时，同一层级 marker column 也不能产生任何水平或垂直位移
- 位移容忍度为 `0px`，不允许随着列表层级变深而扩大
- active 行可以显示 Markdown marker，但源码缩进字符不能参与子列表视觉深度计算
- continuation 行和软换行都必须对齐所属列表项正文起点
- 顶级无序列表、有序列表和任务列表的 marker 左边界必须与标题、正文左边界一致，不额外内缩
- 同一层级的无序列表和有序列表 marker 左边界、正文起点必须一致；子列表只通过 depth offset 增加缩进

### TC-011C Typora 式空白行折叠

步骤：
1. 输入以下 Markdown：
   ```md
   Paragraph one

   Paragraph two
   ```
2. 再输入一个包含多个空白源码行的版本：
   ```md
   Paragraph one


   Paragraph two
   ```
3. 将光标放到 `Paragraph two`，让 `Paragraph one` 和两段之间的空白源码行进入 inactive 阅读态。
4. 观察两段之间是否出现额外空白行。
5. 将光标放到 `Paragraph one` 末尾，按 `ArrowDown`。
6. 将光标放到 `Paragraph two` 开头，按 `ArrowUp`。
7. 将光标继续放到 `Paragraph two` 开头，按 `Backspace`。
8. 在普通段落行末按 `Enter`，再按一次 `Backspace`。
9. 输入以下 Markdown，将光标放到 `AAAAA` 行末按 `Enter`：
   ```md
   AAAAA
   BBBBB
   ```
10. 再将光标放到 `Paragraph two` 的块开头按 `Enter`。
11. 使用 CRLF 换行的同样内容重复步骤 3-7。
12. 直接将光标定位到两段之间的空白源码行。
13. 导出 HTML 并用浏览器打开导出文件。

预期：
- inactive 阅读态和 active 编辑态下，每个块间空白 run 只有第一行作为结构性分隔行折叠为 `0` 高度
- 如果块间有 `n(n>1)` 个空白源码行，剩余 `n-1` 行在编辑态和导出 HTML 中保持可见
- 单个分隔行场景中，`ArrowDown` 从上一块内容末尾跳到下一块首行，不进入未渲染的分隔空白行
- 多个空白行场景中，`ArrowDown` / `ArrowUp` 会落到可见的额外空白行，不跳过用户刻意输入的空行
- `Backspace` 从下一块内容开头优先删除上方可见额外空白行；只剩结构性分隔行时，再删除分隔行并把当前内容接到上一块末尾
- 普通段落行末按 `Enter` 在文档末尾只插入一个普通换行；随后按一次 `Backspace` 就能回到上一行末尾
- `AAAAA|` / `BBBBB` 场景中按 `Enter` 只插入一个源码换行，形成 `AAAAA` 与 `BBBBB` 之间的单个结构性分隔行，光标跨过分隔行停到 `BBBBB` 开头
- 如果光标已经处在现有块开头，`Enter` 只插入普通换行，不再额外创建新的结构性空白分隔行
- CRLF 文档只折叠真正的结构性空白行，不会把上一行的 `\r` 位置误判成空白行
- 直接定位到结构性分隔空白行时，光标会归一化到相邻可编辑块，不能停留或编辑该分隔行
- 导出 HTML 使用同样的 `cm-inactive-blank-line` 规则，视觉间距与编辑器 inactive 阅读态一致
- 保存或导出不会删除 Markdown 源码中的空白行

### TC-012 代码块

步骤：
1. 输入围栏代码块。
2. 在代码块内输入代码。
3. 按 Tab。

预期：
- 能插入缩进
- 光标保持在代码块内

### TC-013 block map 解析

步骤：
1. 在 `packages/markdown-engine/src/parse-block-map.test.ts` 中使用混合 Markdown fixture。
2. 运行 `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`。
3. 检查 `heading`、`paragraph`、`list`、`blockquote` 的 block 顺序与 offset 断言。

预期：
- 能输出顶层 `heading`、`paragraph`、`list`、`blockquote`
- `startOffset` / `endOffset` 可回拿原始 Markdown 切片
- list 或 blockquote 内部的 paragraph 不会泄漏为顶层 block

### TC-014 active block 跟踪

步骤：
1. 在 `packages/editor-core/src/active-block.test.ts` 中使用混合 Markdown fixture。
2. 分别把选择位置移动到标题、段落、列表、引用块，以及块间空白行。
3. 运行 `npm run test -- packages/editor-core/src/active-block.test.ts src/renderer/code-editor.test.ts`。

预期：
- 光标位于块内部时，能解析出对应的顶层 active block
- 光标位于块末尾换行时，仍保持当前块激活
- 光标位于块间空白区域时，active block 为空
- CodeMirror 选择变化会把 active block 更新推送到 renderer 侧

### TC-015 引用块渲染

步骤：
1. 输入两行引用块，例如 `> Quote line` 与 `> Still quoted`。
2. 把光标移动到引用块外的普通段落。
3. 观察引用块在非激活态的显示。
4. 再把光标移回引用块内部。
5. 如需自动化回归，运行 `npm run test -- src/renderer/code-editor.test.ts`。

预期：
- 非激活引用块显示为带缩进和整块淡色背景的连续区域
- 非激活时 `>` 前缀被隐藏，不破坏原始 Markdown 文本
- 光标重新进入引用块后，完整 `>` Markdown 源码立即恢复并可直接编辑
- 在非空引用行按 `Enter` 会生成引用内结构空行和新的 `> ` 编辑行，即源码形态为 `> text\n>\n> `
- 在空引用行按 `Enter` 会退出当前引用块
- composition 期间不会提前切换装饰，结束后只做一次 flush

### TC-015A 嵌套引用块渲染与编辑

步骤：
1. 输入以下 Markdown：
   ```md
   > outer
   > > **nested**
   >> compact
   >    > spaced

   Paragraph
   ```
2. 把光标移动到 `Paragraph`。
3. 观察四行引用块的非激活态显示。
4. 把光标移回 `nested`、`compact` 和 `spaced` 三行，确认源码前缀可直接编辑。
5. 把光标放在 `> > **nested**` 行末，按 `Enter`。
6. 选中 `> > **nested**` 与新续出的嵌套引用行，触发 `Shift+Ctrl/Cmd+9`。
7. 导出 HTML，并检查导出的引用块行 class 与隐藏 marker。
8. 如需自动化回归，运行 `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/line-parsers.test.ts packages/editor-core/src/commands/semantic-edits.test.ts packages/editor-core/src/commands/toggle-block-commands.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`。

预期：
- 非激活态不会暴露任何合法嵌套引用源码前缀，包括 `> > `、`>> ` 和 `>    > `
- 非激活态按引用深度显示多层 quote rail，并带有 `cm-inactive-blockquote-depth-N` class，深度超过 4 时按 4 样式显示
- 行内格式从最深层引用前缀后开始渲染，`**nested**` 显示为加粗内容
- 光标重新进入对应引用行后，原始 Markdown 前缀完整恢复并可编辑
- 非空嵌套引用行按 `Enter` 会生成同层引用内结构空行和新的编辑行，例如 `> > text\n> > \n> > `
- 空嵌套引用行按 `Enter` 会像列表一样先退出到上一级引用；只有顶级引用空行再次 `Enter` 才退出引用块
- blockquote toggle 对已引用行只移除一层引用，`> > text` 变为 `> text`，`>> text` 变为 `> text`
- HTML 导出使用同样的隐藏前缀和深度 class，不把嵌套 marker padding 漏成可见文本

### TC-015B 引用块内部 block 同构

步骤：
1. 输入以下 Markdown：
   ~~~md
   > 第一段
   >
   > 第二段
   >
   > - item
   >   - child
   > - item 2
   >
   > > 第二层
   > > - nested item
   > >   - nested child
   >
   > > > 第三层
   >
   > ```ts
   > const value = 1;
   > ```
   >
   > $$
   > x^2
   > $$

   Paragraph
   ~~~
2. 把光标移动到 `Paragraph`。
3. 观察引用块非激活态：quote rail 应按 Typora 导出样式显示为透明背景、4px 左边框、15px 左右内边距、无圆角和无 inset shadow；内部段落、列表、代码块和公式按各自 block 样式显示。
4. 在空行输入 `>` 后直接输入 `quote`；另起一处空行输入 `>` 后把光标移动到其他段落；再另起一处空行输入 `>` 后直接按 `Enter`，再输入 `quote`。
5. 把光标放到 `> 第一段` 行末，按 `Enter`。
6. 把光标放到新生成的引用内空行，再按 `Enter`。
7. 输入 `> - item`，把光标放到行末按 `Enter`。
8. 输入 `> - parent\n>   - `，把光标放到空子项末尾按 `Enter`；再输入 `> 1. 111\n> 2. 333\n>   1. 222\n>     1. 1.1\n>     2. `，把光标放到最后一个空有序子项末尾按 `Enter`。
9. 输入 `> - parent\n> - `，把光标放到空顶级项末尾按 `Enter`。
10. 在引用内列表项上使用 `Tab` / `Shift+Tab`；分别在非空列表正文开头、空嵌套列表项末尾、有序列表第二项正文开头按 `Backspace`。
11. 导出 HTML，检查引用内 list / code / math 不退化为普通文本。
12. 如需自动化回归，运行 `npm.cmd run test -- packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/commands/blockquote-commands.test.ts packages/editor-core/src/commands/list-edits.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`，并运行 `FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=blockquote npm.cmd run test:editing-experience`、`FISHMARK_MARKDOWN_EDITING_EXPERIENCE_PROBE_GROUP=list npm.cmd run test:editing-experience` 和 `npm.cmd run test:blockquote-typora-visual`。

预期：
- `>` / `> ` 空引用行作为引用内结构空行，marker 不可见，不把上下内容拆成两个独立视觉引用块
- 引用块基础视觉 computed style 与 Typora 导出样式对齐：`border-left: 4px solid #dfe2e5`、`padding-left/right: 15px`、透明背景、无圆角、无 box-shadow
- 引用内列表具有 `cm-inactive-list` class，列表深度从引用内容起点计算，而不是把 quote 前缀算入缩进；引用内子列表继续按外部列表缩进规则渲染
- 第二层、第三层引用内的字体、content offset、行距与外部引用规则一致，不被误判为 `cm-inactive-code-block`
- 引用内 fenced code 和 block math 复用外部代码块 / 公式预览规则，同时保留 blockquote line class
- 顶层裸 `>`、`>text`、嵌套 `> >` 和 `> >text` 都按引用语法提交；活动行只有未输入正文的裸 marker 可临时显示最后一个 `>` 作为光标锚点
- 已提交引用块内输入内层裸 `>` 时形成嵌套引用活动行并显示光标；继续输入正文形成 `> >text` 后隐藏完整 quote prefix，光标仍落在嵌套引用内容列
- 顶层裸 `>` 行尾按 `Enter` 也会提交为引用块并续出引用内编辑行，例如输入 `>` 后按 `Enter` 再输入 `quote` 得到 `> \n> quote`；引用内 `> >` 行尾按 `Enter` 同理提交为嵌套引用并得到 `> > \n> > nested`
- 光标移出裸 `>` 空引用行后，该行进入 inactive 引用渲染，marker 不可见但 quote rail 保持连续
- 引用块提交态激活时不显示原始 quote prefix，光标和正文起点停在引用内容列
- 输入 `>` 后继续输入正文，文本留在引用块内并形成 `>quote`，不会插入到引用块前面
- 非空引用行 Enter 后源码为 `> text\n>\n> `，光标落到最后一个 `> ` 之后
- 非空嵌套引用行 Enter 后源码为 `> > text\n> > \n> > `，结构空行与新编辑行都保持同一嵌套引用层级，不露出裸 `>` 文本
- 在嵌套引用空行 Enter 会逐级退出到父引用层级；在顶级引用空行再次 Enter 才退出引用块，光标落到外部普通空段落 surface
- 引用内非空列表项按 Enter 创建同级引用内列表项；空子项按 Enter 升级为父列表项；空顶级引用列表项按 Enter 先创建引用内结构空行再退出为引用正文，例如 `> - parent\n> - ` 变为 `> - parent\n>\n> `
- 引用内嵌套有序列表空子项按 Enter 升级到父列表时，编号和外部正文列表完全一致继续递增，例如 `>   1. 222\n>     1. 1.1\n>     2. ` 升级后得到 `>   1. 222\n>     1. 1.1\n>   2. `，不会重启为 `>   1. `
- 引用内有序列表续项会继续归一编号；`Tab` / `Shift+Tab` 只调整 quote 前缀后的列表缩进；列表正文开头 `Backspace` 删除 list marker 但保留引用前缀，空嵌套列表项先删除 marker 再逐次清理 quote 前缀后的缩进
- 引用内有序列表第二项正文开头 `Backspace` 和外部有序列表一致，会在引用内插入结构空行并把当前项断开为引用正文，例如 `> 1. 内容\n> 2. 内容2` 变为 `> 1. 内容\n>\n> 2.内容2`
- HTML export 使用 parser-owned `innerBlocks`，不通过 export 侧正则二次猜测引用内语法

### TC-016 代码块渲染

步骤：
1. 输入一个 fenced code block，例如：
   ~~~md
   ```ts
   const answer = 42;
     console.log(answer);
   ```
   ~~~
2. 仅输入一行 ```` ``` ```` 或 ```` ```ts ````，然后按 `Enter`。
3. 把光标移动到代码块外的普通段落。
4. 观察代码块在非激活态的显示。
5. 将光标放到代码块下方紧邻的空行或下一行行首，按一次 `Backspace`。
6. 再把光标移回代码块内部任一代码行。
7. 如需自动化回归，运行 `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts` 与 `npm run test -- src/renderer/code-editor.test.ts`。

预期：
- 在仅输入 opening fence 后按 `Enter`，编辑器会自动补全成对 closing fence，并把光标放到中间空行
- 非激活代码块显示为等宽字体的连续代码区域，保留缩进与换行
- opening / closing fence 在非激活态被隐藏
- 在代码块下边界按 `Backspace` 时，编辑器会先整体切回代码块源码态，并把光标放到最后一行代码内容末尾，而不是直接落到 closing fence 上
- 光标重新进入代码块后，完整 Markdown 源码立即恢复并可直接编辑 opening / closing fence 与 info string
- 点击代码块底部附近或 closing fence 对应位置时，不会只漏出孤立的 ```` ``` ````；代码块要么保持完整非激活态，要么整体回到源码态
- 保存后 fenced code block 的 info string 与原始 Markdown 结构保持不变
- `Enter`、`Tab` 与 `Shift+Tab` 继续沿用普通 CodeMirror 文本编辑语义，不因代码块渲染额外劫持

### TC-017 分割线渲染

步骤：
1. 输入两个分割线示例：`---` 与 `+++`；其中 `+++` 至少覆盖一组“前后不留空行、直接贴正文”的写法，例如：
   `+++`
   `分割线`
   `+++`
2. 把光标移动到分割线外的普通段落。
3. 观察分割线在非激活态的显示。
4. 在该组紧贴正文的 `+++` 示例下方另起一行，只输入单个 `-`。
5. 再把光标移回任一分割线所在行。
6. 如需自动化回归，运行 `npm run test -- packages/markdown-engine/src/parse-block-map.test.ts`、`npm run test -- packages/editor-core/src/active-block.test.ts` 与 `npm run test -- src/renderer/code-editor.test.ts`。

预期：
- `---` 与 `+++` 都会被识别为 top-level 分割线
- 非激活态分割线显示为连续横线，而不是原始 marker 文本
- 在紧贴正文的 `+++` 下方输入单个 `-`，不会让上方已存在的 `+++` 分割线失效；该单个 `-` 自身也不会被识别为分割线
- 光标回到分割线后，原始 Markdown 源码立即恢复并可直接编辑
- 用 CRLF 文本替换当前文档后，分割线装饰不会整体错位
- 现有 heading、paragraph、list、blockquote 与 code block 渲染不回归

### TC-017A 鼠标点击文本命中行稳定

步骤：
1. 输入包含 heading、blockquote、fenced code block、分割线、表格和普通段落的混合 Markdown。
2. 把光标移动到最后一个普通段落，让前面的块进入 inactive 阅读态。
3. 分别点击 blockquote 后、code block 后、分割线后、表格后的普通文本中心位置。
4. 如需自动化回归，运行 `npm run test:cursor-hit-geometry`（Windows PowerShell 可用 `npm.cmd run test:cursor-hit-geometry`）。

预期：
- 点击可见文本中心时，CodeMirror `posAtCoords` 命中的源码行必须与可见文本所在行一致。
- 不需要把鼠标刻意偏到文字上方才能把光标放进目标行。
- 分割线、表格等块级渲染的视觉间距不能通过 CodeMirror 测量不到的 vertical margin 实现。
- 现有 list geometry、active block 切换、undo / redo 与 IME composition guard 不回归。

### TC-017C Markdown 文法编辑体验探针

步骤：
1. 运行 `npm run test:editing-experience`（Windows PowerShell 可用 `npm.cmd run test:editing-experience`）。
2. probe 必须启动 Electron/Chromium 页面，把 CodeMirror 作为真实编辑区操作。
3. 中文输入必须通过编辑区的原生文本插入路径触发，删除必须派发真实 `Backspace` 键盘事件，引用块选区必须通过鼠标拖拽建立。
4. 每一种 Markdown 文法都用独立用例覆盖，至少包含普通段落、标题、列表、引用块、围栏代码块、分割线源码行、表格。
5. 引用块必须额外覆盖 `> ` 后继续输入中文、内容中删除、内容起点删除引用 marker、引用块下方 Backspace 回到引用行、拖拽选中整行内容。
6. 列表必须额外覆盖：在列表后的纯空格行输入中文；在列表项末尾连续按 `Enter` 两次退出列表后输入中文；以及退出列表后在空行按一次 `Backspace`。输入场景下文本必须成为独立正文行，不能继承列表缩进或写回上一条列表项。
7. 表格必须额外覆盖：点击最后一行单元格不能自动跳出；先聚焦单元格，再点击表格下方空白行或空白画布并立即输入中文；也要覆盖从最后一行单元格按 `Enter` / `ArrowDown` 退出表格后立即输入，以及在表格下一行输入单个 `-`。

预期：
- focused 引用块源码前缀保持真实可编辑文本，不能使用会干扰 IME、光标或选区的 active hidden marker。
- 中文输入后，文档源码与屏幕可见文本必须同步出现，不允许输入期间不可见、鼠标移出后才刷出内容或拼音串。
- 列表后的纯空格行上，光标必须归一化到正文左边界；输入正文时要替换掉不可见缩进空格。
- 列表项末尾连续按两次 `Enter` 退出列表时，源码必须保留一个结构分隔空行；随后输入的正文不能成为上一条列表项的 lazy continuation，正文左边界必须与普通段落一致。
- 列表项末尾连续按两次 `Enter` 退出列表后，空行上的第一次 `Backspace` 必须直接回到上一条列表项末尾，不能要求用户再按第二次。
- Backspace 在引用块内容起点可以移除当前引用 marker；从引用块下方删除时可以自然回到引用行。
- 鼠标拖拽可以选中引用块整行可见内容。
- 表格下方的可见光标必须是输入真值；点击空白画布后，DOM focus 必须回到 CodeMirror，中文不能写入任何单元格。
- 表格后一行普通文本不能因为缺少空白分隔就被解析成新表格 row；headed pipe table 的 body 行必须至少包含一个 pipe。
- 表格下一行输入单个 `-` 时，`-` 必须成为表格外的新列表 marker，既不能写进单元格，也不能让前面的表格退回原始 Markdown 源码态。
- 新增或调整 Markdown 文法渲染时，应给该文法补一个独立 editing-experience 用例，而不是只依赖 parser 或 jsdom 测试。

### TC-034 行内格式渲染

步骤：
1. 输入一组普通段落内的行内格式示例：`**bold**`、`*italic*`、`` `code` ``、`~~strike~~`、`1111<br>22222222222`。
2. 再输入两组嵌套示例：`***both***` 与 `~~**mix**~~`。
3. 额外输入三种块内示例：`# Heading with **bold**`、`- Item with *italic*`、`> Quote with code`（其中 `code` 部分使用反引号包裹）。
4. 把光标移动到这些 block 外的普通段落，观察非激活态渲染。
5. 再把光标移回任一包含行内格式的 block，观察源码态恢复。
6. 切换到中文输入法，在包含行内格式的文档中进行一次 composition 输入，再结束 composition。
7. 如需自动化回归，运行 `npm run test -- packages/markdown-engine/src/parse-inline-ast.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/derived-state/inactive-block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts`。

预期：
- 非激活态段落中的 `**bold**`、`*italic*`、`` `code` ``、`~~strike~~` 会显示为渲染态，Markdown markers 被隐藏
- `***both***` 与 `~~**mix**~~` 的嵌套样式会保持叠加，不会丢失内层样式
- heading、list、blockquote 内的行内格式在非激活态同样成立
- `<br>` 在非激活态显示为真实行内换行；光标回到同一行后，源码 `<br>` 仍可见，且后续文本保持在下一视觉行
- 光标重新进入对应 block 后，完整 Markdown 源码立即恢复并可直接编辑
- composition 期间不会提前抖动，`compositionend` 后只做一次 decorations flush
- link/image 即使本轮不做专门视觉替换，也不会破坏 label/alt children 的行内 decorations

### TC-014-LINK 链接显示与编辑

步骤：
1. 输入一个普通资源链接，例如 `[FishMark](https://fishmark.app)`，再输入一段普通段落。
2. 把光标移动到普通段落，让链接所在 block 进入非激活态。
3. 观察链接行的可见内容和样式。
4. 按住 `Ctrl`（macOS 为 `Command`）点击链接文本，或把光标放在链接源码范围内按 `Ctrl+Enter`（macOS 为 `Command+Enter`）。
5. 再点击链接所在行的非链接区域或用键盘把光标移回该 block。
6. 如需自动化回归，运行 `npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts packages/editor-core/src/extensions/markdown.test.ts src/renderer/code-editor.test.ts src/preload/preload.test.ts src/preload/preload.contract.test.ts src/main/main.test.ts`。

预期：
- 非激活态只突出显示链接 label，`[]()` 与 destination 语法不作为正文视觉重点出现。
- `Ctrl/Command+点击` 与 `Ctrl/Command+Enter` 会通过受限 bridge 请求系统浏览器打开链接。
- 光标回到链接所在 block 后，完整 Markdown 源码恢复并可继续编辑。
- renderer 不直接获得 Node shell 能力；main 进程只允许 `http:` / `https:` / `mailto:` 外部链接协议。

### TC-045-FOOTNOTE 脚注语法

步骤：
1. 输入包含有效脚注、未定义脚注和重复定义的 Markdown，例如：
   ```markdown
   Paragraph with a footnote[^note] and missing[^missing].

   [^note]: Footnote **body**
   [^note]: duplicate
   ```
2. 再输入一个围栏代码块，代码块内容包含 `[^code]: not a footnote`。
3. 把光标移动到普通段落之外，观察非激活态脚注引用和脚注定义。
4. 点击脚注引用所在段落，再点击脚注定义所在行，观察源码态恢复。
5. 点击状态栏 `</>` 切换到整篇源码模式，再切回默认 WYSIWYM。
6. 导出 HTML。
7. 如需自动化回归，运行 `npm.cmd run test -- packages/markdown-engine/src/parse-inline-ast.test.ts packages/markdown-engine/src/parse-markdown-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts`。

预期：
- 有效 `[^note]` 只在存在唯一有效 `[^note]:` 定义时渲染为脚注引用。
- 脚注引用所在 block active 后立即恢复完整 Markdown 源码，可直接编辑 `[^note]`。
- 有效脚注定义在非激活态显示为脚注定义阅读态，active 后恢复 `[^note]: Footnote **body**`。
- 未定义引用、重复定义和 malformed 定义保持源码文本，不被静默删除、合并或重写。
- 代码块、列表子块或引用块里的脚注形态文本不会被提升成文档级脚注定义。
- 源码模式下脚注引用和定义全部显示原始 Markdown，不显示脚注 preview decoration。
- HTML 导出包含脚注区域和反向链接，且不会改变 Markdown 保存目标或 dirty 状态。

### TC-046-MATH 数学公式语法

步骤：
1. 输入包含行内公式、块级公式、坏公式、货币文本、转义美元符号和代码内容的 Markdown，例如：
   ~~~markdown
   Inline $x^2$ and escaped \$x$.

   $$
   a + b
   $$

   Price is $5 and $6.

   `$not_math$`

   ```tex
   $not_math_either$
   ```
   ~~~
2. 把光标移动到公式之外，观察非激活态公式预览。
3. 点击行内公式所在段落和块级公式所在块，确认源码态恢复。
4. 点击状态栏 `</>` 切换到整篇源码模式，再切回默认 WYSIWYM。
5. 导出 HTML。
6. 如需自动化回归，运行 `npm.cmd run test -- packages/markdown-engine/src/parse-inline-ast.test.ts packages/markdown-engine/src/parse-block-map.test.ts packages/markdown-engine/src/parse-markdown-document.test.ts packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts src/main/analyze-renderer-bundle.test.ts src/main/editor-math-preview-assets.test.ts`，并运行 `npm.cmd run perf:bundle`。

预期：
- `$x^2$` 解析为 parser-owned inline math，`$$...$$` 解析为 parser-owned block math。
- 未闭合 `$`、货币文本、转义 `\$`、code span 和 code fence 内的 `$` 保持普通文本或原代码内容。
- 非激活态公式使用 KaTeX 预览，并随预览按需加载 KaTeX CSS / font assets；公式渲染失败时显示源码 fallback，不阻塞输入。
- active 公式所在行 / 块恢复完整 Markdown 源码并可直接编辑。
- 源码模式下不显示公式 preview widget，全部显示原始 Markdown。
- HTML 导出包含 KaTeX `renderToString` 生成的 MathML 与内联基础 CSS，不残留 `fonts/...` 等外部资源 URL，可作为单文件离线阅读；导出不改变 Markdown 保存目标或 dirty 状态。
- `perf:bundle` 必须显示 `katex` 是 lazy chunk，且 `forbiddenInitialSourceGroup:katex` 通过。

### TC-051-MERMAID Mermaid / diagram code fence 渲染

步骤：
1. 输入包含有效脚注、未定义脚注、行内 / 块级公式和 Mermaid fence 的 Markdown，例如：
   ~~~markdown
   # 验收样本

   普通脚注引用[^first]，第二个引用[^second]，未定义引用[^missing]。

   行内公式：$a^2 + b^2 = c^2$

   块级公式：

   $$
   \int_0^1 x^2 dx = \frac{1}{3}
   $$

   ```mermaid
   graph TD
     A[Start] --> B[End]
   ```

   坏 Mermaid：

   ```mermaid
   graph TD
     A -->
   ```

   [^first]: 这是脚注内容。
   [^second]: 这是第二条脚注。
   ~~~
2. 把光标移动到 Mermaid fence 与脚注引用之外，观察非激活态渲染。
3. 点击 Mermaid 预览所在区域或把光标移动进 fence 内容，确认源码态恢复。
4. 点击状态栏 `</>` 切到整篇源码模式，再切回默认 WYSIWYM。
5. 导出 HTML。
6. 如需自动化回归，运行 `npm.cmd run test:mermaid-footnote-render`、`npm.cmd run test -- packages/editor-core/src/decorations/block-decorations.test.ts src/renderer/code-editor.test.ts src/renderer/export-html.test.ts src/main/editor-math-preview-assets.test.ts packages/editor-core/src/decorations/mermaid-preview-renderer.test.ts`，并运行 `npm.cmd run perf:bundle`。

预期：
- 非激活态有效 `mermaid` fence 显示为 SVG 图，不显示 ```` ```mermaid ```` 源码块。
- Mermaid 语法错误不会崩溃编辑器，并以原始 fenced code block fallback 显示源码。
- 光标进入 Mermaid fence 后完整恢复原始 fenced code block，可直接编辑源码。
- Mermaid runtime 只通过 lazy preview module 加载，`perf:bundle` 中 `requiredLazyChunk:mermaid` 与 `forbiddenInitialSourceGroup:mermaid` 均通过。
- Mermaid 渲染使用 strict security，并清理 SVG 内 `<script>`、事件属性和 `javascript:` 属性值。
- 源码模式下 Mermaid、脚注和数学公式都回到原始 Markdown，不显示 preview widget。
- HTML export 不注入 Mermaid runtime script，当前首版以代码块形式输出安全源码 fallback。
- `npm.cmd run test:mermaid-footnote-render` 会加载 `fixtures/test-harness/mermaid-footnote-math.md`，生成 `.artifacts/visual-verification/mermaid-footnote-render-probe.png`，截图中应能看到 `first` / `second` 上标脚注标签、行内 / 块级公式和 Mermaid 流程图。

### TC-018-SEARCH 查找替换

步骤：
1. 打开一个包含重复词的 Markdown 文档，例如 `alpha beta` 和 `Beta alpha`。
2. 点击左侧 rail 的查找入口，或在编辑区按 `Ctrl+F`（macOS 为 `Command+F`）。
3. 在 `Find` 中输入 `beta`，观察匹配计数和正文高亮。
4. 使用上一项 / 下一项按钮在匹配之间切换。
5. 在 `Replace` 中输入 `gamma`，点击 `Replace` 替换当前匹配。
6. 再点击 `All` 替换剩余全部匹配。
7. 按 `Ctrl+Z`（macOS 为 `Command+Z`）撤销上一步替换。
8. 如需自动化回归，运行 `npm run test -- src/renderer/code-editor.test.ts src/renderer/editor/WorkspaceShell.test.tsx`。

预期：
- 查找范围覆盖当前全文，大小写不敏感，匹配项在 CodeMirror 正文中高亮。
- 面板显示当前匹配序号和总匹配数；无查询或无匹配时给出稳定状态。
- 上一项 / 下一项只移动当前匹配，不改写 Markdown 文本。
- `Replace` 只替换当前匹配，`All` 替换剩余全部匹配。
- 替换操作进入 CodeMirror history，撤销 / 重做保持自然，不触发整篇 Markdown 重排。
- 查找替换面板只通过 renderer 的 CodeMirror 控制器工作，不新增 main/preload 文件或 Node 能力暴露。

### TC-060-SOURCE 整篇源码模式

步骤：
1. 打开一个包含标题、链接、图片、表格、任务列表、引用块、代码块、分割线和行内格式的 Markdown 文档。
2. 确认默认视图仍显示现有 WYSIWYM 阅读 / 编辑效果。
3. 在状态栏点击 `</>` 按钮。
4. 观察正文所有 Markdown 语法是否以原始源码显示。
5. 在源码模式下移动光标、输入文本，并按 `Ctrl/Cmd+Z` 撤销。
6. 切换到同一窗口中的其他标签页，再切回当前标签页。
7. 再次点击 `</>` 按钮切回默认 WYSIWYM。
8. 导出 HTML 或保存当前 Markdown 文件。

预期：
- `</>` 按钮使用 `aria-pressed` 表示源码模式状态。
- 源码模式是当前窗口级开关，同一窗口切换标签后仍保持当前 view mode。
- 标题、链接、图片、表格、任务列表、引用块、代码块、分割线和行内格式全部显示原始 Markdown，不显示 preview widget、隐藏 marker、任务 checkbox widget、表格 widget 或代码高亮。
- 切换源码模式不改写 Markdown 文本，不触发保存，不重置 undo / redo。
- 切回默认 WYSIWYM 后，已有阅读态、编辑态和 active block 行为恢复。
- 保存和 HTML export 仍以原始 Markdown 为输入，不受 view mode 影响。

### TC-040 大纲侧栏

步骤：
1. 打开一个包含多级标题的 Markdown 文档，例如依次包含 `# Title`、`## Section`、`### Detail`。
2. 观察右侧，仅显示一个很小的展开 icon，大纲面板默认不展开。
3. 点击展开 icon，确认右侧出现悬浮样式的大纲面板，且正文编辑区仍与其平级显示，不被遮挡。
4. 滚动正文编辑区到文档中后部，观察右侧大纲面板是否仍固定在自己的位置。
5. 如果标题很多，继续滚动右侧大纲面板，确认它可以独立滚动而不带动正文滚动。
6. 点击任一大纲项，例如 `Section` 或 `Detail`。
7. 使用面板顶部的收起按钮把大纲重新折叠，只留下右侧小型展开 icon。
8. 编辑标题文本后，再观察重新展开的大纲是否同步更新。
7. 如需自动化回归，运行 `npm.cmd run test -- src/renderer/outline.test.ts src/renderer/code-editor-view.test.tsx src/renderer/code-editor.test.ts src/renderer/app.autosave.test.ts`。

预期：
- 默认状态下只显示一个小型右侧展开入口，不会占用正文阅读区域
- 展开后右侧会显示基于 heading 的悬浮大纲面板，文本内容与当前 Markdown 标题一致
- 大纲面板与正文编辑区平级存在，不互相遮挡
- 大纲不会随着正文滚动而移出视口
- 大纲内容过长时，只滚动大纲区域本身，不会带动正文一起滚动
- 点击大纲项后，编辑器光标会跳到对应 heading，并把该位置滚动到可见区域
- 收起后恢复为小型展开入口
- 修改标题文本或重新打开文档后，大纲会同步刷新
- 现有 autosave、active block 与设置抽屉交互不回归

### TC-042 表格编辑上下文

步骤：
1. 打开一个包含 pipe table 的 Markdown 文档，例如：
   `| name | qty |`
   `| --- | ---: |`
   `| pen | 2 |`
2. 把光标停在普通段落中，按住 `Ctrl/Cmd` 1 秒。
3. 确认 shortcut hint 仍显示默认文本组，例如 `Bold`、`Italic`。
4. 再把焦点移入表格任意单元格。
5. 再次按住 `Ctrl/Cmd` 1 秒，观察 shortcut hint 与左侧 rail。
6. 直接用鼠标点击一个单元格，例如 `2` 所在单元格，并输入新文本把它改为 `20`。
6A. 在任一单元格中输入或粘贴 `**A**`、`*B*`、`` `C` ``、`p<br>en` 这类行内格式内容，观察单元格内显示效果。
7. 在另一个空白文档中只输入一行典型 pipe header，例如 `| a | b | c |`，然后在行尾按 `Enter`。
8. 回到表格内继续使用 `Tab`、`Shift+Tab`、`ArrowUp`、`ArrowDown`、`ArrowLeft`、`ArrowRight`、`Enter`、`Ctrl/Cmd+Enter`。
9. 使用 rail 中的表格图标 tools；分别 hover 或 focus 观察 tooltip 是否显示 `Row Above`、`Row Below`、`Column Left`、`Column Right`、`Delete Row`、`Delete Column`、`Delete Table`，并逐个触发对应动作，尤其验证插入空白列后表格仍保持渲染态。
10. 打开 [docs/test-report.md](/C:/Users/yulu/Documents/Yulora/Yulora/docs/test-report.md)，确认 `## 记录` 下这种没有 delimiter、且记录行之间允许空一行的 pipe rows 也会被识别为表格渲染。

预期：
- 表格默认以渲染态 widget 显示，不回退到整块原始 Markdown 源码态
- 进入表格后，shortcut hint 切换为表格组，例如 `Next Cell`、`Previous Cell`、`Row Above`、`Row Below`、`Next Row / Exit`、`Insert Row Below`
- 左侧 rail 中段切换为表格图标工具列，并带有非硬切的过渡
- 直接点击单元格即可进入对应 cell 的编辑态，不需要先回到原始 Markdown 源码块
- 非活动单元格里的 `**A**`、`*B*`、`` `C` ``、`p<br>en` 会按现有 inline 规则渲染，其中 `<br>` 显示为真实换行；当前正在编辑的活动单元格继续显示原始 Markdown 文本，保证 caret 与输入稳定
- `**`、`*`、`` ` `` 这类未闭合或不完整的 inline marker 在单元格里不会被错误扩成重复 marker 预览，而是按原始文本显示
- 在空白或已有内容的单元格里通过输入法输入 `·`、中文或其他 composition 字符时，组合态期间不会提前触发整表 rewrite；`compositionend` 后会等待 post-composition `input`，若浏览器未补发再走 fallback 单次提交，焦点不退出表格
- 在仅有 header 行的典型 pipe table 草稿上按 `Enter`，会自动补出 delimiter 行和一个空白 body 行，并把光标放到第一格空白单元格
- 单元格输入会直接改写对应 Markdown 内容，并立即把整张表重排为 canonical 对齐格式
- 表格列宽会根据当前单元格内容自然撑开，不再固定把整张表强行拉伸成等分列
- `Tab` / `Shift+Tab` 在单元格之间移动，`ArrowUp` / `ArrowDown` 会在同列上下移动
- `ArrowLeft` / `ArrowRight` 只会在 caret 到达单元格边界时跨到前后单元格；否则保留原生文本内移动
- `Enter` 会跳到下一行同列；如果当前已经是最后一行，则退出表格并把焦点还给正文编辑区
- `Ctrl/Cmd+Enter` 会在当前行下方插入新行
- rail 中的图标 tools 能完成增删行列和删除整表，hover / focus 时会显示 tooltip，且焦点保持在逻辑上合理的单元格
- 插入空白列后，formatter 会生成合法 delimiter，表格不会掉回普通段落或原始 pipe 文本
- `docs/test-report.md` 这类 loose headerless pipe rows 会按表格渲染，而不是退回成多段普通 pipe 文本

## 3. 输入法

### TC-020 中文 IME

步骤：
1. 切换到中文输入法。
2. 输入标题、列表和普通文本。

预期：
- 不丢字
- 输入过程中不跳光标

## 4. 图片

### TC-030 粘贴图片

步骤：
1. 复制一张图片。
2. 粘贴到编辑器中。
3. 把光标留在刚插入的图片 Markdown 所在段落中。
4. 再把光标移动到其他普通段落。

预期：
- 图片文件写入本地
- 插入 Markdown 引用文本
- 路径正确
- 激活图片所在段落时，图片上方仍能看到原始 Markdown 源码，图片预览同时保留
- 光标移到其他段落后，图片语法会折叠为稳定预览

补充回归：
1. 在已保存文档中输入单行 HTML 图片，例如 `<img src="assets/branding/fishmark_logo_light.svg" alt="FishMark logo" style="zoom:25%;" />`。
2. 再输入包裹式 HTML 图片，例如：
   `<p align="center">`
   `<img src="assets/branding/fishmark_logo_light.svg" alt="FishMark logo" width="160">`
   `</p>`
3. 分别把光标留在图片源码内，以及移到其他普通段落。

补充预期：
- 单行 `<img ...>` 与包裹式 `<p><img></p>` 都会渲染为图片预览
- `style="zoom:25%;"` 与 `width="160"` 会体现在预览尺寸上
- 激活态依然保留 HTML 源码在上方，图片预览在下方
- 预览不再显示额外的大卡片背景，版式更接近正文流中的 Typora 图片
- 点击任意图片预览时，光标会直接跳回对应图片源码的起始位置

### TC-031 拖入图片

步骤：
1. 把图片拖入编辑器。

预期：
- 图片被插入
- 文件被保存到本地

## 5. 搜索

### TC-040 查找

步骤：
1. 输入多个关键字。
2. 在文档中搜索。

预期：
- 匹配项被高亮
- 可以在匹配项之间导航

## 6. 导出

### TC-050 导出 HTML

步骤：
1. 把当前文档导出为 HTML。
2. 打开导出的文件。

预期：
- 内容与源文档一致
- 样式基本保留

### TC-051 导出 PDF

步骤：
1. 把当前文档导出为 PDF。

预期：
- 排版可读
- 没有被截断

## 7. 性能

### TC-060 长文档

步骤：
1. 打开一个 5000 行以上的文档。
2. 滚动。
3. 编辑文本。

预期：
- 应用保持可用
- 输入体验没有明显卡顿

## 8. 跨平台

### TC-070 Windows 启动

预期：
- 应用能在 Windows 上启动
- 应用可以保存文件

### TC-070A Windows 应用图标

步骤：
1. 运行 `npm.cmd run package:win` 生成 Windows 安装包。
2. 安装或覆盖安装 `release/FishMark-Setup-<version>.exe`。
3. 在桌面快捷方式或开始菜单中切换不同图标大小观察 FishMark 图标。

预期：
- 图标中间鱼身为黑色实体，鱼眼保留为反白小孔。
- 桌面常用图标大小下不应明显发糊。
- 打包产物内的 `resources/icons/dark/icon.ico` 至少包含 `16/24/32/48/64/128/256` 尺寸。

### TC-070B Windows Markdown 文件图标

步骤：
1. 运行 `npm.cmd run package:win` 生成 Windows 安装包。
2. 安装或覆盖安装 `release/FishMark-Setup-<version>.exe`。
3. 将 FishMark 设为 `.md` / `.markdown` 文件的打开方式或默认应用。
4. 在文件管理器中切换不同图标大小观察一个 Markdown 文件。
5. 双击该 Markdown 文件。

预期：
- Markdown 文件使用独立纸张图标，而不是直接复用 FishMark 应用圆形图标。
- 文件图标中心使用浅色系 FishMark logo，位置与比例居中稳定。
- 生成产物内的 `build/icons/file/markdown.ico` 至少包含 `16/24/32/48/64/128/256` 尺寸。
- 打包产物内包含 `resources/icons/file/markdown.ico`。
- 双击 Markdown 文件会用 FishMark 打开。

### TC-070C Windows 自动更新确认弹窗更新内容

步骤：
1. 安装一个低于 GitHub latest release 的 Windows 安装版 FishMark。
2. 确认 GitHub latest release 正文包含“本次更新”及至少一条面向用户的更新内容。
3. 启动已安装的旧版本，等待自动检查并下载更新；或通过 `Help > Check for Updates` 手动触发。
4. 等待下载完成后观察系统安装确认弹窗。
5. 分别点击“稍后”和下一次弹窗中的“立即重启更新”验证两条路径。

预期：
- 弹窗仍显示“立即重启更新 / 稍后”两个选择。
- 弹窗详情区域显示目标版本号，并展示本次更新内容。
- GitHub Release 正文中的 Markdown 标题、加粗、行内代码和链接会被清洗为可读纯文本。
- release notes 缺失时，弹窗仍显示版本已准备好安装的兜底说明。
- 点击“稍后”不会退出应用；点击“立即重启更新”会继续现有安装流程。

### TC-071 macOS 启动

预期：
- 应用能在 macOS 上启动
- 应用可以保存文件

### TC-071A macOS Markdown 文件图标

步骤：
1. 在 macOS 上运行 `npm run package:mac`。
2. 检查 `release/mac-arm64/FishMark.app/Contents/Resources/markdown.icns` 是否存在。
3. 将 FishMark 设为 `.md` / `.markdown` 文件的打开方式。
4. 在 Finder 中观察一个 Markdown 文件图标，并双击打开。

预期：
- `.md` / `.markdown` 文件关联到 FishMark。
- Finder 中 Markdown 文件使用独立纸张图标，中心为浅色系 FishMark logo。
- `markdown.icns` 包含常用与 Retina 图标条目，避免高分屏下明显发糊。
- 双击 Markdown 文件会用 FishMark 打开。

## 9. 测试工作台

### TC-080 独立测试工作台启动

步骤：
1. 运行 `npm run dev:test-workbench`。
2. 等待 Electron 窗口启动。
3. 检查首页是否显示 `FishMark Test Workbench`、`Scenario Catalog`、`Debug Stream`、`Test Process`。

预期：
- 首个窗口是独立测试工作台，而不是普通编辑器壳
- 测试工作台显示场景列表、debug 区和测试进程区的基础页壳
- 没有直接污染正常编辑器启动流程

### TC-081 从工作台拉起独立 editor 测试窗口

步骤：
1. 在测试工作台中点击 `Open Editor Test Window`。
2. 观察是否拉起第二个 Electron 窗口。
3. 关闭第二个 editor 窗口。
4. 保持测试工作台窗口打开。

预期：
- 会打开一个单独的 editor 测试窗口
- 关闭 editor 测试窗口不会连带关闭测试工作台
- debug 和测试进程信息仍应以测试工作台为主承载面

### TC-082 正常开发壳不受测试模式影响

步骤：
1. 关闭测试工作台相关窗口。
2. 运行 `npm run dev`。
3. 观察首个 Electron 窗口。

预期：
- 正常开发命令仍进入普通编辑器壳
- 不会误显示测试工作台界面

### TC-083 测试工作台实时 debug 状态

步骤：
1. 运行 `npm run dev:test-workbench`。
2. 观察 `Debug Stream` 默认显示 `Idle`，且 `Recent events` 为空。
3. 选择 `app-shell-startup` 并点击 `Run Selected Scenario`。
4. 确认 `Debug Stream` 会显示 `Running`、当前步骤和最近事件。
5. 等待场景结束，确认状态切换为 `Passed`，步骤区显示每步状态与耗时。
6. 选择 `open-markdown-file-basic` 并再次运行。
7. 确认 workbench 显示 `Failed`，并展示失败步骤、错误类型和错误消息。
8. 再次运行任一场景，在执行中点击 `Interrupt Active Run`。
9. 确认 workbench 显示 `Interrupted`，并展示中断步骤和原因。

预期：
- debug 面板会实时刷新场景状态、当前步骤和最近事件
- 步骤追踪区会显示每步状态与耗时
- 失败时可看到失败步骤和错误消息
- 中断时可看到中断原因，且事件流会保留最近终态事件

## 11. 偏好设置与主题

### TC-090 应用 UI 字体与字号

步骤：
1. 打开设置页。
2. 在“应用 UI 字体预设”选择一个明显不同的系统字体，例如 `Segoe UI` 或 `Aptos`。
3. 在“应用 UI 字号”输入 `24` 并失焦。
4. 观察按钮、标题、输入框标签等全局 UI 的文字样式与大小是否变化。
5. 重启应用并再次打开设置页。

预期：
- 应用 UI 字体预设存在，且为下拉框
- 应用 UI 字体变化后，按钮和标题等非编辑内容优先使用所选字体
- 应用 UI 字号变化后，按钮和标题等非编辑内容的字体大小同步变化
- `--fishmark-ui-font-family` 在 `documentElement` 上被更新为对应值
- `--fishmark-ui-font-size` 在 `documentElement` 上被更新为对应值（可在控制台用 `getComputedStyle(document.documentElement).getPropertyValue('--fishmark-ui-font-size')` 验证）
- 重启后字体与字号值仍保留

### TC-091 文档字号

步骤：
1. 在任一文档中输入一段正文。
2. 打开设置页，在“文档字号”输入 `26` 并失焦。
3. 切回编辑区。

预期：
- 正文段落文字可读性明显变化，编辑区与 Markdown 渲染态都以新字号显示
- 控件区/侧边信息不应随“文档字号”变化（避免与“应用 UI 字号”混淆）

### TC-092 文档字体与中文字体预设

步骤：
1. 打开设置页，在“文档字体预设”选择一个明显不同的系统字体，例如 `Georgia` 或 `Segoe UI`。
2. 在“中文字体预设”选择一个系统中已安装的中文字体，例如 `Source Han Sans SC`、`PingFang SC` 或 `霞鹜文楷`。
3. 回到编辑区，输入一段中英混排正文，例如 `Hello 中文 world 测试`。
4. 再输入一段包含行内代码和代码块的内容，例如 `` `中文 code` `` 与三引号代码围栏。
5. 把“中文字体预设”切回“系统默认”，再次观察正文。
6. 如系统中存在一个会话前可见、会话后不可用的字体名，可验证缺失字体时不弹错并保持界面可用。

预期：
- `--fishmark-document-font-family` 与 `--fishmark-document-cjk-font-family` 会按设置更新
- 正文中的西文、数字等保持使用文档主字体
- 正文中的中文字符优先使用“中文字体预设”指定字体
- 行内代码与代码块继续使用现有等宽字体，不受中文字体预设影响
- “文档字体预设”与“中文字体预设”均为下拉框，不再存在自由输入框
- 中文字体切回“系统默认”后，中文字符恢复跟随文档主字体
- 所选字体不可用时静默回退，不出现报错弹窗

### TC-093 主题包扫描与刷新

步骤：
1. 关闭应用。
2. 在应用用户数据目录的 `themes` 下新建一个主题包目录（例如 `themes/demo/`）。
3. 在该目录内创建合法的 `manifest.json`，并至少提供与 `supports` 对应的 `tokens`、`styles.ui`、`styles.editor`、`styles.markdown` 文件，写入明显差异样式。
4. 重启应用后打开设置，确认“主题包”列表出现该目录对应主题。
5. 保持应用运行，删除该目录后返回设置页。
6. 点击“刷新主题”。

预期：
- 启动时会扫描到新建的合法主题包，并能在“主题包”里出现
- 缺少 `manifest.json` 的目录不会出现在列表中
- manifest 非法的目录不会出现在列表中
- 运行时不会自动丢失刚创建的主题配置
- 删除目录后，点击“刷新主题”会在列表中移除该主题，不会要求重启

### TC-094 主题切换生效

步骤：
1. 打开设置页并确认已加载至少一个主题包（含 `FishMark 默认` 或社区主题）。
2. 选择不同主题包，等待界面稳定 1~2 秒。
3. 再切回其他主题包（例如 `FishMark 默认`）。
4. 若某个主题包只支持 `dark` 或 `light`，切换到其不支持的颜色模式。

预期：
- 切换主题时，当前样式与背景/控件配色与旧主题有区别，并在切回后恢复
- 控制台中 `document.querySelectorAll('link[data-fishmark-theme-runtime=\"active\"]')` 的数量始终在 `1~5` 之间，且切换后样式链接指向新主题路径
- 主题缺失的 part 不会报错或持久留存旧样式
- 当前主题包不支持所选颜色模式时，界面回退到 `FishMark 默认`，并提示“该主题不支持浅色/深色模式”

### TC-095 打开主题目录

步骤：
1. 打开设置页，定位到“主题包”所在行。
2. 点击“打开主题目录”按钮。
3. 观察系统文件管理器打开的位置。

预期：
- 系统会直接打开统一主题安装目录 `<userData>/themes/`
- 即使当前选中的是 builtin 主题，也不会跳到 `src/renderer/theme-packages/`
- 目录不存在时会先创建再打开，不会弹出错误

### TC-096 autosave idle delay 变更重排 pending timer

步骤：
1. 打开任意文档并输入内容，确保出现 dirty 状态。
2. 在设置页将“空闲触发时长”设为 `10000`，并回到编辑区继续输入一个字符后保持空闲。
3. 等待 3 秒内不要触发自动保存（理想是持续显示未保存）。
4. 立即将“空闲触发时长”改为 `1000`，等待 2 秒并观察状态。

预期：
- 变更前，10 秒窗口内不应触发保存；变更为 1000ms 后应在新窗口内触发保存
- 自动保存状态从“未保存”进入“保存中/已保存”时应使用新时长
- 保存延迟变更不依赖下一次编辑输入，当前挂起的保存任务也能按新配置执行

## 12. 回归规则

每个完成的任务都应记录：
- 跑了哪些测试
- 这些测试是否通过

至少要覆盖本次改动影响到的区域，尤其是文件操作、编辑行为和回归敏感路径。
