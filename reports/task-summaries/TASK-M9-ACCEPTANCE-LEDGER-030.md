# M9 当前验收与 RF-902/903 缺口审查

2026-10-13，基线官方 main `3fee9ef20c8d83ce58ebc430e648ae4c74ea4245` / tree `f9f7ac06bb4f523547dcf26d15ce421f0a968043`，重新fetch核验一致，工作区起始干净。精确CI38363749630 attempt1三项成功；保存关闭锁序及强Save协议已经恢复门禁。

本批按用户要求先更新[统一验收清单](../../docs/plans/2026-10-13-m9-acceptance-ledger.md)，两位独立reviewer分别只读审查RF-902流程与RF-903权限边界，未改产品、依赖、测试或系统设置。RF-901仍IN_PROGRESS；RF-902/903仍PLANNED但只读准备完成；正式验收依赖不改，M9保持0/3。本轮用户已授权提前实施不冲突的小批，覆盖旧规则的实施顺序限制；一次只执行一个源码任务，不需要再次询权。

审查把性能债务与证据不足分开：5k/20k首次ready1564.2/2923.9ms超原预算；dispatch/原生输入区间不能代替semantic16/24ms；two-rAF不能替代compositor。十分钟自然GC与终末forcedGC各自保留边界。旧真实OSIME trusted-end失败保留，空白Chromium后台对照支持引擎解释但不是真实OS对照，不能仅凭isTrusted定产品bug或删除校验。

RF-902尚无Playwright产品fixture或test:e2e，现有safety可复用真实两次保存/关闭，却没有relaunch读回及真正autosave原因证明。Inactive watcher+阻止覆盖、pending move/detach+ACK、完整产品crash/relaunch也尚缺真实贯通证据。Formal语料可复用，但独立probe/synthetic键盘不能冒充完整产品原生输入链路。具体文件与后续小批顺序列在清单。

RF-903存在实现缺口：生产sandbox:false、无CSP、资产协议任意绝对路径readFile。已有sender/frame/mode/window/tab检查与导航/弹窗/外链allowlist可保留；合法renderer仍可提交任意openPath，clipboard目标documentPath也由renderer指定。只给资产协议加根名单而允许renderer自授根不能满足目标。审查没有读取用户私有文件或执行利用。下一步路径能力、sandbox/preload、CSP分别设计、验证与发布；不把CI的no-sandbox豁免当安全验收。

本批无代码行为变化，依据用户“可靠长测试不受影响则不重复”的要求，沿用相同代码的lint/typecheck/build、strict3682+8exactknown/0unexpected/skip/errors、foundation310、editing79、safety7、formal121/2541和gzip1434741/1500000。仅新跑文档链接、diff及代码身份检查，并独立review文档。普通main推送后另核验新SHA的完整CI；精确发布结果由本机 `.artifacts/m9-acceptance/publication.json` 记录，不在提交前预报成功。

未占用前台；下一次WindowsOSIME配对提案约3分钟，在测试协议准备就绪后由协调方确认时段。Mac及完整呈现/平台验收仍未测。本批不改指标、不扩大allowlist、不重跑旧失败CI，不涉及cp13/cp16或Library下载。没有新增性能优化，也没有关闭任何M9子任务。
