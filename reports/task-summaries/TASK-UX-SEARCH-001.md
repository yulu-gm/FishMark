# TASK-UX-SEARCH-001：Windows 搜索体验检查点

结果：**FAIL**。状态：**CHANGES_REQUESTED**。搜索修复的定向测试及 Windows 产品交互通过；中文字体/高度问题仍未修复，原完整回归门禁仍因一项 Windows 平台跳过而失败。此为本地检查点，不是发布验收，不推送。

## 来源与隔离

- 基线：官方 `yulu-gm/FishMark` published main `996cb3496986386a56a022583b61af4f5e5e3e54`，tree `728c06f71e6023e249b0d258b3a88a32f1fa11f3`。
- 本地分支：`codex/windows-search-ux-20261008`；独立 checkout 和 `npm ci`，依赖/lockfile 未改。
- 原仓库 `D:\MyAgent\FishMark\FishMark` 的 HEAD 与三个 dirty 文件保持原样；无 reset/force/push/远端分支。
- 此分支不是未发布的 RF901 core `55431408b1361d7d4d51505a81b5db4041cf323b`，没有取得或冒充 cp16。

## 最终实现

1. Ctrl/Cmd+F 聚焦不再被进入编辑模式后的 RAF 抢回；Search 准备期间的 Esc、切 Outline、换文档和卸载会取消过时打开请求。修饰键、已消费事件和 composition/229 边界有回归。
2. 查找沿用 CodeMirror 查询与完整 source match，通过当前 canonical snapshot 定位表格，在布局阶段同步 reveal；当前命中以整格高亮表示，不强行聚焦 cell 或折叠选区。排队的 cell focus 尊重较新的外部焦点，覆盖空查询/无命中。
3. `getSelection()` 可返回活动 plain cell 中与当前规范源码精确对应的 DOM 选区，保留正反向，不改写 CM selection、不建立第二文档。仅自动带入单行非空选择；多行保留原查询。转义竖线解码等 DOM/source 不等时安全回退原 CM 范围。
4. **字体及列宽算法没有改动**。字体实验全部撤回，`table-widget.ts` 最终只导出既有选区读取 helper。

## 新鲜验证

| 验证 | 结果 |
| --- | --- |
| 独立 reviewer：Find hook / search runtime / focus transfer / controller selection | 4 文件 41/41 PASS；2026-10-08 12:12 UTC |
| `npm run typecheck` | PASS，exit 0；12:12:20–12:12:35 UTC |
| `npm run lint` | PASS，exit 0，0 errors / warnings；12:12:21–12:12:35 UTC |
| `npm run build` | PASS；最终产品构建用于下述 Windows v2 实测 |
| `VITEST_MAX_WORKERS=2 npm run test:regression` | **FAIL**，exit 1；224 文件 / 3162 cases：3151 passed、10 exact known failures、1 unexpected skip；0 collection/hook/unhandled errors、0 unresolved baseline |
| `npm run perf:bundle` 原 contract | **PASS**，exit 0；total JS gzip **1429191 / 1430000 B**，余量 809 B；initial 179699/300000、56956/90000、total initial gzip 96451/260000；15 forbidden-initial 与 4 required-lazy 均通过，随后恢复正常 renderer build |
| Windows 产品窗口 v2 | 搜索 **18/18 断言 PASS**，另 1 条拖选前置观察；两项字体场景仍 FAIL，report 总体 FAIL / exit 1；无 runtime errors |

完整回归的唯一 unexpected 为 `file-identity-resolver.test.ts` 的文件 symlink 用例：Windows EPERM 导致测试自身动态 skip。独立 published-main 副本同机运行该文件也是 7 PASS + 1 SKIP；源码经 Git EOL 转换精确匹配基线 blob，原始字节只有 CRLF/LF 差异。这证明是基线平台条件，不改变原 wrapper 的 FAIL，也未改 fixture、跳过规则或权限。十项 exact known 为既有 parser/list 债务，未删除或重录。

UI 总交接为 `.artifacts/windows-search-ux/final-ui-handoff.json`：记录共同协议/fixture hash、最终源码/构建身份及 15 个已记录 probe PID 全部退出。证据根：`.artifacts/windows-search-ux/`，包括 `final-{typecheck,lint,bundle}.result.json`、对应日志、`final-regression-workers2.log`、`final-vitest-full{,.gate}.json`、`v2-candidate/result.json` 和截图。同机纯 main 的 UI 与 symlink 对照位于相邻 `fishmark-search-baseline-main/.artifacts/`。最初有字体实验和探针前置条件错误的失败记录均保留，不能用后续结果覆盖。

## 原基线、补丁后与未完成项

- 原始焦点竞态由定向红绿测试定位；纯 main 实际窗口的首次 Ctrl+F 本次可通过，但 Esc 后重开失败，不能说首次必现。普通正文/表格局部选择带入在原版失败。同协议 v2 原版搜索断言 4/18 通过，补丁后 18/18 通过（另有 1 条拖选前置观察）。最终补丁的选择带入、Esc 后重开、可见/离屏表格跳转通过。
- 最终功能协议 v2 使用独立的 48 行远表，命中第 35/48 行，以真实 cell rect 验证可见性，不能仅依赖新增 marker。源码完整匹配、唯一当前格、Search 焦点及插入 31 字符前缀后的新 offset 同时验证。v2 与早期两行样例结果不作数值性能对比，未改 cp13/cp16 固定 fixture。
- 显式 Georgia + Microsoft YaHei 时，混排表格高度 **162.1875 → 161.1875 → 162.1875 px**，实际中文字体在编辑时变为 Noto Sans SC；1200/900 宽度均复现。五类静态样例的列宽观察不能否定用户在其他内容/字体上的反馈。
- 字体 span 实验曾修复静态高度，却让中文末尾追加 `abc` 继承中文字体；输入后重分段又使真实 Ctrl+Z/Y 失效。该诊断全部关键阶段有证据，但关闭阶段有 `Hard timeout`，不得称整项通过。产品中没有保留实验。
- 既有 `2026-04-17-cjk-font-preferences-design.md` 明确排除普通字体 fallback。无需改变 active DOM 的通用修复需要独立字体层能力，涉及 face/weight/style/缺失字体与 Unicode 范围，应另行精确设计及验收；本轮未启动输入模型重构。
- **Typora 实际界面对照未运行**。只查阅官方表格/书写区宽度说明，未据此猜测自适应列宽公式。Native IME、主题矩阵、首次 paint、M9 ABBA 性能矩阵、完整 release E2E/远端 CI 均未运行。

## Windows 固定规格建议

HZ-YULU-PC：Windows 11 Enterprise 25H2 / 26200.9457 x64；Ryzen 9 9900X 12C/24T；96 GiB RAM；Node24.14.0 / npm11.9.0 / Electron41.2.0 / Chrome146.0.7680.179。交流电、Balanced；主屏 VG27AQ1A 2560×1440@144Hz、DPR1，窗口 1200×800 与产品最小 900×600。完整 GPU 查询确认 RTX4070Ti、ANGLE D3D11、driver32.0.16.1088；不能用早期不完整 basic 枚举推断 GPU。

测试为生产构建 main/preload/renderer 经隔离 Electron launcher 运行，`isPackaged=false`，不是已安装 release 验收。appData/userData/sessionData、fixture 和本轮 PID 独立；未改用户日常偏好。后续 Windows 基线应固定这些条件与明确字体 profile，另记真实 OS IME、主题、首次 paint 和电源/后台负载，不能套用 Mac 数字。

## 人工验收

1. 使用隔离构建打开含重复词与长表的 Markdown，Ctrl+F、Esc、再 Ctrl+F，确认输入框保持焦点。
2. 正反向拖选正文或可精确映射的 plain cell 单行文字再 Ctrl+F；查询应等于选择。多行选择应保留原查询。
3. 前后跳转第 35/48 行等离屏命中，确认目标可见、整格标记、完整匹配与 Search 焦点；在表前插入正文后重测。
4. 记录 Georgia + YaHei 在显示/编辑/退出的真实字体与高度：本检查点该项仍失败，不应作为已修复发布。

## RF901 / Library 边界

Windows 官方 Library search 下载助手失败于内部 `prepare_materialize` 能力发现；公开 schema 仍存在，没有新的 HTTP403，也没有候选包。未换路、猜 URL、代理或重传规避限制。继续获取须修复官方服务或取得独立合法引用/明确新授权。

RF901 1431588 B 对用户批准 1431000 B 仍 **FAIL +588 B**，16/24ms 目标仍未通过；RF901 未采用，RF902/903 未启动。本次 1429191 B 是独立 published-main 搜索分支的 Windows 结果，不能替代 RF901 候选测量。
