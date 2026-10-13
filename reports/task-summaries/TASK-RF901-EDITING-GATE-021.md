# RF-901 编辑体验门禁修复

2026-10-13，YULUSTATION。承接 `24571d32a40748e87fe063d06439f6c6d2e63595` 报告验证检查点；公开基线 `59b2f2e369739670b4fc230a79cb05eacb290790`。本批解决原编辑体验门禁的九项失败，完整本地门禁与独立审查 PASS，发布精确身份及 CI 待推送后核验。RF-901/M9 仍进行中。

## 九项失败的归因

规则来源：[已批准的渐进标记显示](TASK-UX-MARKERS-001.md)。编辑正文时列表源码前缀仍隐藏；进入前缀才揭示。规范 Markdown 树与显示草稿分开，保持 Enter/Tab 的结构依据。

| 原失败 | 实际证据与修复 |
| --- | --- |
| bare dash | 未输入空格已显示列表，确为既有产品显示缺陷；仅聚焦编辑、独立首个顶层空项、折叠光标在标记末尾时显示段落草稿。空格后检查当前隐藏源码规则。 |
| bare ordered marker | 同上；保留规范 list 节点，不改变解析器。 |
| bare dash composition | 同一草稿显示缺陷；保持原预编辑文字、位置、源码及光标断言。 |
| dash-space composition | 除旧 active 类名外，隐藏 padding anchor 的透明颜色和负字间距确实隐藏预编辑、将空项光标拉回标记处；复用已有 active anchor 的继承颜色、0.25em 宽及负 margin，净占位为零。 |
| whitespace-only line Chinese input | 正文被字体装饰拆成两个 text nodes，单节点测量误报；同一行跨节点 Range 测量，逐片段校验几何与可见性。 |
| quoted bare marker Tab | 源码、selection 正确，旧 active 类名预期过期；保留原语义断言，增加真实 marker、缩进、caret、引用竖线检查。 |
| quoted padded empty item Tab | 同上。 |
| quoted residual separator Tab | 同上，并保留残留 separator 清理断言。 |
| quoted inner blocks / Enter | 子列表源码隐藏符合批准规则；更新对应类名，增加三个实际 marker 可见检查，保留复合场景的其余结构编辑断言。 |

无序列表可见图形来自 CSS `::before`，不能把透明源码 `-` 当可见标记。探针现在加载默认主题 light/ui/editor/markdown 四层，仍保持其固定窗口和字体协议；不是整个应用或用户自定义主题认证。测量助手加入单节点/分节点 × 普通/透明/hidden/自身 opacity 0/祖先 opacity 0/display none 的 12 个实际 Electron 反例检查，任一不符直接失败。

## 验证与边界

原 main 与检查点均 70/79，九项完整 case 对象相同，证据保留在 `.artifacts/m9-intake/`。本批原始诊断、修改中失败、最终结果保留在 `.artifacts/m9-editing/`，没有覆盖失败证据。

- 新草稿单测 13/13，包含长文档中间行、默认参数、blur/reading/selection、已有/嵌套/引用/多行内容边界。
- native 编辑体验 79/79；三项引用列表父子 marker 横向差均为 22.390625px，caret 同行且在 marker 之后，marker 与引用竖线可见。
- 未调整旧清单时 full regression 为 3552 passed +8 exact known、0 unexpected/skip/errors；仅两条旧 code-editor 失败已变 passed。仅删除这两条旧记录，保留八条解析器失败的身份与指纹，未增加豁免。
- 缩减后 strict PASS：3552 passed +8 exact known、0 skip/unexpected/errors，真实 symlink 执行；lint/typecheck/build 均 exit 0。foundation 310/310、原 bundle 上限、workspace safety 7/7、正式 behavior 121/121 /2541 targets 均通过；formal 中 99 known-defect 保留，0 unexpected/not-run。
- total JS gzip 为 1,434,109 /1,500,000 B，未放宽任何 bundle 检查。
- 独立审查先指出可选显示模式、测量可见性及长文本扫描三项，均已修正；fresh review PASS，独立草稿 13/13 和原 code-editor 两项 2/2。安全探针原有 MaxListenersExceededWarning 保留，未压制或声称解决。

本批没有改变标题留白/超长前缀规则、表格 DOM/原生撤销、系统文件关联、开发者模式、安全设置、依赖、bundle 上限或 CI 配置。预编辑事件是实际 Electron 中的受控组合输入探针，不是 Windows 系统 IME 认证。历史表格 288px 问题、mixed fixture 完整语义性能预算、RF-902/903 和整个 M9 仍未完成。冻结 cp13/cp16 未动，Library 访问阻塞未绕过。
