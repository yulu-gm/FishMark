# 表格真实横向溢出：本地 checkpoint 017

本阶段只修复已复现的水平裁切与跨列漏揭示。严格全量门禁仍 FAIL，Esc 关闭搜索的布局选择仍待用户答复；未推送，不代表 M9 完成。起点为本地 a86c057eb1d86b7f66e5bd66b0273f1e7119a858，本总结、三个产品文件和本阶段证据在同一本地提交，精确提交身份由 Git 与交接回复给出。

## 原因与最小修复

真实 64 列 fixture 包含 380 字符无空格长文本以及末列 `end-target-top`。原表格自身 `overflow:hidden`，Search 打开后 table scrollWidth/clientWidth=326/310，但 wrapper=310/310，末列命中字形 x758.69–769.33 超出 wrapper 右边界753.86。改为 table overflow visible 后由既有 wrapper 承担水平滚动：327/310，scrollLeft17，字形进入 x741.69–752.33。未改列宽算法。这是极窄列的可达性测试，不能称其整体布局易读或 Typora 对照通过。

另一缺陷是水平揭示复制 `{...rect}`。实际 DOMRect 的几何属性位于 prototype getter，复制后丢失 top/bottom/width/height，跨列 Right 虽被 handler 消费，却未执行必要的纵向揭示。改为显式保留六个属性。三个新测试覆盖真实横移＋离屏 Y，以及水平 clamp0＋上/下离屏 Y；既有可见 Y 用例保留。

失败场景13与修后14的 fixture SHA256 均为 `008a3a5ac18d05d444182bb7022eb9ac7aed9a447f30073250b727e88224afef`，前九步 canonical selection 一致。修后14完整13步：鼠标末列点击、ShiftTab/Tab、Left/Right、Search 与真实水平 wheel。Left 去长列末端需纵向374→13153，caret y673.94–694.94；Right 回短列起点原 caret y−12611.52，修后仅一次 handler 内写入13153→447，caret y94.48–115.48，消费后采样稳定。wheel内部位置17→0，Enter 再揭示17。步骤011只是重新输入查询，不具备独立 handler 揭示证据；真正恢复命中与水平位置的是013。最终文档字节与 fixture 相同，无源码、原生 Selection 或 history 改写。

## Esc 的独立诊断与暂停边界

同 fixture、canonical range 保持，正常 Esc 仍 −68297px；仅清空 query 为0；仅改变宽度的诊断 CSS 操作为−24187px；宽度保持、清空 query 后仅 public editor focus 为−37265px。focus 单独改变高度446554→403710，说明不能只解决 sidebar 动画。独立场景不能相加推导总位移。原 width-only 使用诊断 inline CSS，不能称产品验收。sidebar-only 场景实际误中 toolbar，采集无效，保留但排除。

关闭搜索的交互选择已交由父任务询问用户，尚未答复；按照后续明确指示暂停相关 UI 实现。语义 source match/relative-Y API 原型已从产品撤出，仅保存在 ignored `semantic-candidate/`，12个单测和当时 typecheck 通过，不属于本次产品提交，也不是 Esc 修复。其 saved revealer 含旧 DOMRect 复制问题，继续时须将 API diff 合并到当前已修源码，不能整体覆盖。未使用固定像素补偿、每帧强制滚动、全局禁用锚定或 CM 私有 anchor 写入。

## 最终同版本验证

- 最终源码 5k/20k ×900/1200 四矩阵各21步，共24次可见首/重复点击零位移、48次键盘操作，真实 caret 可见；消费后未见额外跳动。四轮全部在本阶段最终源码运行，报告12文件 pin 与当前源码一致（viewport-reveal 不在19文件历史pin中，另按其报告及当前字节验证），14 targeted 与最终矩阵 built JS assets hash相同。
- 三个独立窗口的底部95%位置、empty实际BR行、emoji/组合字符原生点击，均零位移且实际21px caret在视口；在最终同版本重跑，不能把中间03运行混称最终。
- native-cell 99/99 ×2、document-history57/57 ×2，四个独立 userData，19文件 pin 与最终源码相同，sameSourceFrames=0。沿用原始 undo 协议，不宣称OS物理IME或改变既有不同canonical格式契约。协议与产品source snapshots、原始日志、报告和截图均保存。
- 单场景14的13步 overflow 协议完整通过，精确命中字形全部位于内wrapper与垂直viewport，真实mouse wheel/Enter路径成立，source未改。没有扩展为全尺寸overflow矩阵。

严格 `npm run test:regression`：3344 PASS＋10 exact known failures＋1 unexpected symlink 权限 skip，0 collection/hook/unhandled errors，因此 FAIL。唯一 unexpected 是 `src/main/file-identity-resolver.test.ts` 的物理 symlink 身份测试。未更改 allowlist、开发者模式、安全设置；新增豁免仍未获批准。

完整 build、typecheck、lint 通过。正式 `npm run perf:bundle` 通过当前仓库 contract：总 JS gzip1431997/1500000，initial101850/260000；与016差−2字节，不能作性能收益或替代 cp16 的获批1431000上限。

独立只读审查确认该 fixture 的 CSS 所有权、DOMRect 修复、canonical/source identity、handler 单次写入与内 wrapper clip；未发现新增 P0/P1/P2。完整组合与历史最终审查结果见本阶段保存的 review。

采集失败与无效测试原始资料均保留：05/06不形成实际 wrapper overflow；07证明 table 内部裁切；08仅诊断 CSS；11鼠标目标点误中前列；12 Electron ArrowLeft 键名错误；13为有效产品失败。修正后使用真实 elementFromPoint 找到实际末列可点击点，并以 Electron Left/Right 发送原生输入。既有11/12 collector失败未覆盖；本阶段分别在独立窗口完成底部、empty、emoji 边界。

OS物理键盘/IME、Typora许可/UI、混合bidi、全横向组合矩阵、标题新选择实施、Esc稳定性仍未验收。截图为拥有的 Electron webContents capture，未宣称全套 OS 前景像素验收；已查看14步骤009截图，不能从极窄列可达性推导列宽阅读体验完成。

## 本机、官方身份与证据

YULUSTATION：Windows11Enterprise26200，i7-13700K16C24T，RAM34088263680，RTX4070 driver32.0.15.9186，balanced，2560×1440@165Hz/DPR1；Node24.13/npm11.6/Electron41.2/Chrome146，Georgia/MSYaHei18。沿用本机已固定基线，不混用旧9900X或Mac数据。本轮重新 fetch 官方 origin/main，仍为1654e82cd28008cc4f6ae9adec04c5a4d56389ec，tree3ea42b35ece431db21c6eb44e28fd8c7e0404214，见 remote-identity.json。

新原始目录 `.artifacts/table-search-close-20261010/`，持久归档与精确 manifest 位于 `reports/experiments/table-search-close-20261010/`。797逻辑文件、276唯一blob、107986280原始bytes；排除 userData，逐blob SHA256验证。归档SHA256为 **39279908d81a98396038f0bd53b440e9f296c83cfe7b50c26274a5a3868b5487**。manifest精确映射原始driver、失败报告、截图、诊断样例、19文件snapshot、协议、完整门禁、最终summary和独立review；semantic API原型作为证据保存，未纳入产品路径。

旧015/016归档保持不变。标题“固定留白＋超长空格/tab前缀显示源码”的用户选择已记录，不混入本次修复。cp13/cp16、Library403/缺materialization阻塞、RF902/903均未触及；原始旧电脑文件未读取或假定存在。
