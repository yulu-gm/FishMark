# 表格 caret 几何恢复：中断现场 checkpoint 015（尚未验收）

本 checkpoint 保存从失败 014（445bb780a4f2401750d8c46dfe9a61c60f000d6d）重新独立推进的候选，**不是已验收修复、发布或 M9 完成**。014 的拒绝补丁和原始失败证据保持原样。

## 候选与已有证据

Chromium 在 plain cell 原生 Selection 为 DIV/childIndex=0 时可能返回零高 Range；相同文本位置的临时 Text Range 有真实 21px 行高。候选只读原生选区，按等价 Text 边界或相邻完整 grapheme 读取几何；不插入字符、不改 Selection、不替换原生 undo 节点。表格专用一次性 scrollHandler 保留 CM scroll target，核对 immutable doc、canonical head、cell 归属、plain 模式及真实 offset 后才消费。横向先处理 table 自身 overflow，再处理 editor scroller。

06-final-5000-900、07-final-5000-1200 各完整 21 步，合计12次可见首/重复点击位移0；已消费的键盘目标遵循真实 caret 的24px边距，完整事件记录未见消费后额外锚定跳动。04-pixels 的12帧证明中间版本首项原生21px caret；不能把该中间版本像素成绩计为最终全矩阵像素验收。

完整 build、typecheck、lint 通过；相关测试40/40。完整回归3338 PASS、10 exact known failures、2 unexpected：Windows symlink permission skip，以及旧整cell mock的78px期待与新caret测量不一致。未调整allowlist或系统权限。

独立审查指出 P2：搜索隐藏语法或未证明文本投影时，新handler交回CM整表几何。当前候选还需修复该回退，更新旧测试为真实caret行矩形并保留键盘可达性。搜索驱动08语法错误、09从BODY发送Ctrl+F未取得Find输入框，均不得计通过；原始错误保留。20k、最终历史/列表caret矩阵、复杂真实输入/保存等尚未完成；OS IME、Typora对照和混合bidi仍未测。

## 中断与续接

最后一次修改工具在读取文件时因exec-server transport closed失败；旧测试和搜索驱动焦点修正未写入。恢复后一次只读exec实际成功，核对仍为上述HEAD及10个候选文件。先保存当前未验收源码与原始证据，再继续缺失验证；不覆盖中断现场，不push。

原始证据位于 `.artifacts/table-caret-recovery-20261010/`，持久归档 `reports/experiments/table-caret-recovery-interrupted-20261010/`（排除userData，逐blob校验SHA256）。此机YULUSTATION的Windows11/i7-13700K/RTX4070/DPR1基线沿用已固定记录，不混用旧9900X或Mac测量。

标题边界用户已确认：固定留白，超长空格/tab前缀显示源码；本候选不混入标题改动。冻结cp13/cp16、Library访问阻塞和RF902/903均未触及。
