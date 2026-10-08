# 2026-10-08 TASK-UX-SEARCH-001 intake

## 目标与授权

用户要求优先修复 Ctrl+F 不聚焦、表格搜索命中不正确跳转，并以 Typora 为参考调查表格自适应。允许从官方 Git 远端读取已发布 main，在全新隔离 checkout 修改、测试和本地提交；未经完整验证不 push。

## 固定来源

- 远端：`https://github.com/yulu-gm/FishMark.git`
- 已发布 main：`996cb3496986386a56a022583b61af4f5e5e3e54`
- tree：`728c06f71e6023e249b0d258b3a88a32f1fa11f3`
- 分支：`codex/windows-search-ux-20261008`
- 锁文件 SHA256：`45e7224ac54d077e3c915f7c06cc365dd8b9bd6aa576f477ad598f58bbe06ff0`
- Windows 11 25H2 26200.9457、Ryzen 9 9900X、96GiB；Node24.14.0/npm11.9.0/Electron41.2.0。
- 已按项目支持的 `npm ci` 完成独立依赖安装。没有升级依赖或运行 audit fix。

原仓库 `D:\MyAgent\FishMark\FishMark` 的三个 dirty 文件不动。这里不是未发布 RF901/cp16；Library search helper 内部能力发现失败，公开 prepare_materialize schema 仍存在，二者不可混为一谈，也没有新的 HTTP403。未获取、冒充或重建受阻候选。

## 实施边界

1. 在 main 重新确认焦点事件因果，补红绿回归后作小修复。覆盖首次/再次、Esc后重开、异步打开、IME和修饰键；不以不断延迟 focus 掩盖竞态。
2. 表格搜索沿用 CM 查询和完整匹配范围、当前 canonical snapshot；新增必要的呈现/reveal适配，不建立第二模型或旧 widget 位置权威缓存，不强行把搜索选区折叠为单元格编辑光标。
3. 表格自适应先记录实际字体、DPR、viewport下的列宽/行高/溢出及编辑切换；仅证据支持的最小修复进入本轮。没有 Typora 原生界面工具时明确保留对照缺口。
4. 独立 appData/userData/sessionData/cache/端口/PID；正常退出并清理本轮进程。Windows实际渲染器截图/焦点/scroll evidence与单元测试分开；不冒称native IME、首次paint或完整性能验收。

## 门槛与验收

cp13/cp16固定性能协议不变、不跑完整ABBA。用户批准的gzip1431000不变，交接候选1431588仍FAIL+588；公开main现有fixture1430000也不修改。记录本轮独立bundle实际值与原contract结果，禁止为通过而放宽门槛。

定向测试先红后绿，随后typecheck/lint/build及适当集成验证；独立review后本地阶段提交。未覆盖项、失败和运行限制必须保留，不能据本轮小修复标记M9通过或更新主线验收状态。
