# Yulora 测试用例

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
2. 从系统文件管理器拖拽另一个 `.md` 文件到应用窗口内，落点放在编辑区表面。

预期：
- 应用不会把拖入文件内容当作普通文本插入当前编辑器
- 如果当前窗口是空工作区，则在当前窗口打开被拖入文件
- 如果当前窗口已经有文档，则新开一个正常渲染的编辑器窗口打开被拖入文件
- 不会出现原始文本导航窗口或新的独立 dev 实例

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

预期：
- 列表可以正确续项
- 空项时可以退出列表

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
- 在非空引用行按 `Enter` 会续出新的 `> ` 行
- 在空引用行按 `Enter` 会退出当前引用块
- composition 期间不会提前切换装饰，结束后只做一次 flush

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

### TC-034 行内格式渲染

步骤：
1. 输入一组普通段落内的行内格式示例：`**bold**`、`*italic*`、`` `code` ``、`~~strike~~`。
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
- 光标重新进入对应 block 后，完整 Markdown 源码立即恢复并可直接编辑
- composition 期间不会提前抖动，`compositionend` 后只做一次 decorations flush
- link/image 即使本轮不做专门视觉替换，也不会破坏 label/alt children 的行内 decorations

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
7. 在另一个空白文档中只输入一行典型 pipe header，例如 `| a | b | c |`，然后在行尾按 `Enter`。
8. 回到表格内继续使用 `Tab`、`Shift+Tab`、`ArrowUp`、`ArrowDown`、`ArrowLeft`、`ArrowRight`、`Enter`、`Ctrl/Cmd+Enter`。
9. 使用 rail 中的表格图标 tools；分别 hover 或 focus 观察 tooltip 是否显示 `Row Above`、`Row Below`、`Column Left`、`Column Right`、`Delete Row`、`Delete Column`、`Delete Table`，并逐个触发对应动作，尤其验证插入空白列后表格仍保持渲染态。
10. 打开 [docs/test-report.md](/C:/Users/yulu/Documents/Yulora/Yulora/docs/test-report.md)，确认 `## 记录` 下这种没有 delimiter、且记录行之间允许空一行的 pipe rows 也会被识别为表格渲染。

预期：
- 表格默认以渲染态 widget 显示，不回退到整块原始 Markdown 源码态
- 进入表格后，shortcut hint 切换为表格组，例如 `Next Cell`、`Previous Cell`、`Row Above`、`Row Below`、`Next Row / Exit`、`Insert Row Below`
- 左侧 rail 中段切换为表格图标工具列，并带有非硬切的过渡
- 直接点击单元格即可进入对应 cell 的编辑态，不需要先回到原始 Markdown 源码块
- 在仅有 header 行的典型 pipe table 草稿上按 `Enter`，会自动补出 delimiter 行和一个空白 body 行，并把光标放到第一格空白单元格
- 单元格输入会直接改写对应 Markdown 内容，并立即把整张表重排为 canonical 对齐格式
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
1. 在已保存文档中输入单行 HTML 图片，例如 `<img src="assets/branding/yulora_logo_light.svg" alt="Yulora logo" style="zoom:25%;" />`。
2. 再输入包裹式 HTML 图片，例如：
   `<p align="center">`
   `<img src="assets/branding/yulora_logo_light.svg" alt="Yulora logo" width="160">`
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

### TC-071 macOS 启动

预期：
- 应用能在 macOS 上启动
- 应用可以保存文件

## 9. 测试工作台

### TC-080 独立测试工作台启动

步骤：
1. 运行 `npm run dev:test-workbench`。
2. 等待 Electron 窗口启动。
3. 检查首页是否显示 `Yulora Test Workbench`、`Scenario Catalog`、`Debug Stream`、`Test Process`。

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
- `--yulora-ui-font-family` 在 `documentElement` 上被更新为对应值
- `--yulora-ui-font-size` 在 `documentElement` 上被更新为对应值（可在控制台用 `getComputedStyle(document.documentElement).getPropertyValue('--yulora-ui-font-size')` 验证）
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
- `--yulora-document-font-family` 与 `--yulora-document-cjk-font-family` 会按设置更新
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
1. 打开设置页并确认已加载至少一个主题包（含 `Yulora 默认` 或社区主题）。
2. 选择不同主题包，等待界面稳定 1~2 秒。
3. 再切回其他主题包（例如 `Yulora 默认`）。
4. 若某个主题包只支持 `dark` 或 `light`，切换到其不支持的颜色模式。

预期：
- 切换主题时，当前样式与背景/控件配色与旧主题有区别，并在切回后恢复
- 控制台中 `document.querySelectorAll('link[data-yulora-theme-runtime=\"active\"]')` 的数量始终在 `1~5` 之间，且切换后样式链接指向新主题路径
- 主题缺失的 part 不会报错或持久留存旧样式
- 当前主题包不支持所选颜色模式时，界面回退到 `Yulora 默认`，并提示“该主题不支持浅色/深色模式”

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
