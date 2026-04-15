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

预期：
- 图片文件写入本地
- 插入 Markdown 引用文本
- 路径正确

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

## 10. 回归规则

每个完成的任务都应记录：
- 跑了哪些测试
- 这些测试是否通过

至少要覆盖本次改动影响到的区域，尤其是文件操作、编辑行为和回归敏感路径。
