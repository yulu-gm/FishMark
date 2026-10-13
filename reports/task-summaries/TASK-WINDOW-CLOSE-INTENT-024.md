# 取消后快速再次关闭：保留新的关闭请求

2026-10-13，YULUSTATION。基于 `f6f922e410282d312c0d854a7acda944f6d936ca` / tree `3bedf2111e41bcd562e313f0e9581b9c85f082c3`，[精确 CI 38348736059](https://github.com/yulu-gm/FishMark/actions/runs/38348736059) Quality、Full regression、Bundle budget 全绿。该提交发布了报告 023 的有界混合段落增量解析；完整 M9/RF-901 仍未验收。

## 问题与确定性证据

此前 6301 的 CI attempt 1 第二次关闭超时，仅记录 Cancel `[2]`。在当前 Windows 真实产品构建中，以测试屏障暂缓第一次 COMPLETE，等待 renderer 恢复编辑，再编辑并触发第二个 native close，然后放行旧 COMPLETE。基线 `.artifacts/m9-close/baseline/result.json` 确定性失败：request `1:1` 已返回 Cancel，第二次 native close 后没有新 REQUEST，15 秒超时、runtimeErrors 空、提示仅 `[2]`。该次 save 已完成，持续等待由关闭意图丢失造成。此结果证明同一生产缺陷，但不伪称已取得原 Linux 失败的完整 IPC 时间线。

根因是 main 在 broker.hasPending 时直接返回；renderer 恢复可编辑早于 preload 发出 COMPLETE。另有 lease 获取尚未建立 broker pending 的空窗，也应由同一窗口意图 owner 串行保护。

## 修复

新增每窗口 `createWindowCloseIntent`，同步取得 running 所有权，覆盖获取 lease、确认、renderer COMPLETE 和旧 lease 释放。期间的新 native close 合并为一个 queued intent；旧 attempt 完整取消后再发新请求，成功关闭/销毁/异常清队列。授权的程序化 close 仍优先 bypass，未授权关闭不会跳过保存确认。

真实取消结果返回 renderer **之前**清除旧重复点击，避免 Cancel 之后因此前双击而再次提示。取消响应返回后、旧 COMPLETE 到达前的新 close 仍保留。窗口关闭时 dispose 并移除 owner；await 后发现窗口已销毁则释放 held lease。没有改变 broker 身份、授权、确认超时、保存协议或错误报告规则。

## 验证

最终构建同协议 `final-same/result.json`：PASS，requests `1:1`→`1:2`，prompts `[2,0]`，窗口销毁，文件精确为 `Smoke first-save second-save pending-close after-cancel`。额外 `final-pre-cancel/result.json` 在 Cancel 响应前再注入一次 native close，仍只有上述两个 request/两个 prompt，证明额外前置重复点击未增加提示；结合 owner 单测确认 Cancel 清旧重复且保留新 close，该组合实测本身不能单独证明清队列。屏障只存在私有测试进程，使用真实 main/preload/renderer 和 native input，独立 userData/样例文件；没有修改用户设置、关联或其他进程。

8 项 owner 单测覆盖真实 broker 的 Cancel→新意图→旧 COMPLETE、获取 lease 期间串行、无新意图不重试、Cancel 清旧重复、成功/销毁清队列、错误后恢复、多窗口独立。关联目标测试 41/41；最后补强的精确 COMPLETE 窗口测试另测 8/8。

完整串行门禁：lint/typecheck/build exit 0；strict **3618 passed +8 exact known，0 skip/unexpected/collection/hook/unhandled errors**，Windows symlink 实际通过；foundation310；gzip **1,434,552/1,500,000 B**；真实 editing79/79、safety7/7、formal121/121 /2541 targets、99known-defect、0unexpected/not-run。最后只有等价缩进和测试补强，无生产语义再变更。原始日志及报告保留 `.artifacts/m9-close/`，独立静态 review PASS。既有 MaxListenersExceededWarning 保留，未通过提高 listener 上限消除。

## 后续边界

本批只修复已复现的关闭意图丢失。此前静态提出的 blur autosave/main close lease 等待环未在此协议中复现，不能据本批宣布全部关闭并发风险已消失。RF-901 仍需解决整篇装饰/派生和坐标更新成本，完成结构编辑、真实 IME、cold/warm editor-ready、长会话内存、完整平台及呈现预算。cp13/cp16 冻结，Library 阻塞不绕过，RF-902/903 未启动。
