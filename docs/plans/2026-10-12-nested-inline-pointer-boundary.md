# 嵌套行内链接的原生末端点击

在 `[**AAA**](url)` 的隐藏态点击 `AAA|`，应进入整个外层链接的源码末端：`[**AAA**](url)|`。该字符串长14；前置20字符时，正确offset为34。进入后仍沿用既有规则显示所属元素的完整标记，源码内每个字符位置保持可编辑。

Windows/Electron41.2.0的真实点击发现：浏览器DOM caret正确返回AAA末端offset26，但CodeMirror的InlineCoordsScan在嵌套零宽标记边界递归溢出。正常select.pointer交易被中断，后续浏览器DOM选区以普通select落在26，绕过既有完整边界映射。

line-block-adapter复用既有DOM caret解析器，仅在段落/标题中无修饰键的左键单击、且规范快照确认命中隐藏行内边界时返回原始offset。现有pre-focus select.pointer交易负责映射到外层末端；已有表格、代码块、标题、列表等交互优先级保持。该路径不扩大普通select语义、不修改依赖或零宽标记DOM/CSS，也不处理已显示源码、内部正文、双击、组合键或DOM caret不可用情形。接管后拖选沿用映射后的源码锚点。

回归覆盖真实DOM节点末端→块交互入口→完整标记映射及拖选锚点；同时覆盖修饰键、右键、双击、已显示源码、内部正文、其他行命中和缺少DOM caret API的回退边界。真实原生验证继续覆盖单格式、嵌套及相邻格式。

隐藏边界由自定义交互入口接管时，先完成focus及其展示更新，再分发select.pointer，仍使用点击前保存的状态映射。这样避免CodeMirror在选区更新中自动focus引发重入；这同样适用于命中该隐藏边界条件的既有列表/标题入口，未调整其他焦点生命周期。回归明确断言focus先于select.pointer，异常接收器为空。Windows原生endpoint6已证明DOM caret26→focus→pointer交易→源码34，无窗口错误。

嵌套链接的title可产生同进程原生浮窗。测试通过正常移动鼠标到自有窗口空白后检查选区不变并采图，保留全部窗口身份、前台、nonce和遮挡防护；旧失败记录不改写为通过。严格Windows symlink回归门禁仍独立适用。

## Subsequent Windows validation

The same product source subsequently passed the complete strict Windows regression: 3485 passing tests, the unchanged 10 exact known failures, zero skipped/unexpected/collection errors. The symlink identity test actually executed after user-approved Developer Mode activation. Standard lint, build and typecheck pass on the tested source. Full commit-specific CI runs after publication. Raw local evidence is preserved separately; no screenshots, archives, credentials or RF901 experiments are added by this publication. The historical table scrollOffset=288 precondition remains unreproduced and is not claimed fixed. M9 is not complete.
