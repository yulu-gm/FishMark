# RF-902：产品保存重启与 idle 自动保存

2026-10-13，YULUSTATION。基线 main `afccc0b7f3bc290adebffd3c65fb3014b0cd9fb8` / tree `df3b8fdb645b31a9cda983958af8b4c1f381e3da`，fetch核验一致。用户明确授权无人使用的测试桌面，本批仅使用隔离FishMark窗口、临时文档及独立userData；不操作其他应用或用户文档。

实现 Playwright Electron 产品 fixture、`test:e2e` 及 Windows CI job，精确锁定 `@playwright/test@1.64.0`；使用已有Electron41.2，不下载浏览器。真实dist main/preload/renderer创建窗口与注册IPC，没有替代产品窗口或新增renderer特权bridge。启动时核验独立profile、实际fileURL、product bridge且无fishmarkTest；CDP已执行脚本的路径与源内容核对构建preload，保存产物hash。测试单worker、retries=0，每次新run目录留存JSON、截图和trace。

两条贯通流程：

1. 原生输入Unicode内容，实际File→Save菜单，确认保存发生在菜单命令后且之前未失焦；磁盘原始UTF-8字节/hash及产品clean状态准确。正常关闭并确认启动器、真实Electron main及记录的GPU/Utility/renderer进程退出后，同一profile和磁盘文件重新启动，内容准确，再正常退出。
2. 配置真实idle delay1500ms，原生编辑后等待产品计时器；无Save命令、无窗口/编辑器失焦及visibility变化。记录匹配计时器触发与实际保存IPC顺序，并检查精确落盘、dirty清除和退出清理。`rf902-idle-01`：最后输入1791882268968，计时器1791882270483，保存IPC1791882270484（毫秒时间戳）；聚焦持续。该时间仅证明触发顺序，不是RF-901性能预算或OS IME证据。

观测器保留真实行为：main IPC包装仅记录进入/退出并调用原handler；timer包装保留原callback、延迟、参数和取消语义，不推进时钟或调用保存。Node原生warning按真实warning事件ID及直接native writeOut调用来源单列，原始输出保留；真正console.error、renderer错误、unhandled rejection及preload/load/process失败仍失败。不新增具体告警字符串豁免，不提高listener上限。既有MaxListenersExceededWarning在保存时出现，仍是待查诊断债务。

Windows上的Playwright child是cmd启动器，不将它冒充Electron main。fixture记录bootstrap main PID和实际app metrics进程；退出后核验所有记录成员消失，失败时只对仍存活的所属启动器树作有界清理，不按历史PID盲杀。launch尚未返回handle时也读取bootstrap PID作退出核验。递归删除前核验临时目录真实路径是创建时temp根的直属、指定前缀子目录；发现存活进程时保留profile并失败。

开发失败保留：`rf902-manual-01`实际进入产品后因Electron41 getLastWebPreferences不含preload字段而在测试身份检查失败；改用实际CDP加载脚本证据。`rf902-manual-02`只完成首轮保存和退出，Node默认console.error输出warning被错分为应用错误，未到重启；改为原生warning来源分类。两者没有产品源码修改，不通过重跑掩盖原结果。`rf902-manual-03`实际两次启动/两次正常退出及读回PASS；`rf902-idle-01`独立PASS。最后清理边界修订后完整两用例及标准/严格门禁再执行，最终结果保存在 `.artifacts/rf902-persistence/`，独立astra-high复核后才发布。

最终冻结源 `rf902-final-01` 两用例通过：三次启动均正常退出，记录的进程全部消失，应用错误及cleanupErrors为0；idle间隔1525ms。随后完整lint/typecheck/build、strict **3682 passed +8 exact known、0unexpected/skip/collection/hook/unhandled**、foundation310、editing79、safety7、formal121/2541、原bundle合同均通过。astra-high独立review PASS，旧进度段落已标历史避免覆盖RF901 PAUSED/RF902 IN_PROGRESS。完整原始日志、strict/safety/formal JSON及review均在 `.artifacts/rf902-persistence/`；普通main发布与精确CI终态另记录，不提前声称远端通过。

本批只覆盖两个持久化流程，RF-902仍IN_PROGRESS。待续真实非活动tab外部冲突、pending edits跨窗口/ACK、完整产品crash/relaunch、nested产品按键与平台IME。RF-901执行暂停，超预算/呈现/长期内存/平台证据原结论不变；RF-903未开始实施。Playwright显式chromiumSandbox:true且无no-sandbox参数，不代表产品sandbox:false已解决。Windows E2E与原三项Linux CI并列，Mac/Linux本套件未验收。cp13/cp16、Library、已知失败清单和指标不变。
