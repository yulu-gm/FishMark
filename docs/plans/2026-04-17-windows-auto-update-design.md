# Windows 自动更新设计

## 目标

为已安装的 Windows 版本 Yulora 增加自动更新能力。

第一版要求：
- 客户端启动后自动检查新版本
- 发现新版本后后台自动下载
- 下载完成后弹窗，让用户选择是否立即重启并安装
- 下载过程中在应用底部状态条显示“正在下载更新”提示
- 默认状态下不显示更新提示

## 范围

本轮只覆盖：
- Windows
- 已打包安装的正式应用
- `GitHub Releases` 作为更新源
- `Help -> Check for Updates` 手动检查入口
- 主进程原生弹窗
- renderer 底部状态条下载提示

本轮不覆盖：
- macOS 自动更新
- 灰度发布
- 渠道更新
- 断点续传可视化管理
- 独立“更新中心”页面
- 版本发布自动化 CI

## 现状

当前仓库已经满足自动更新的基础条件：

- 使用 `electron-builder` 打包
- Windows 目标为 `NSIS`
- 主进程入口位于 `src/main/main.ts`
- 预加载桥位于 `src/preload/preload.ts`
- 编辑器底部已有固定状态条，位于 `src/renderer/editor/App.tsx`

这意味着第一版最合适的技术路线是：

- 打包与发布：`electron-builder`
- 客户端更新：`electron-updater`
- 更新源：`GitHub Releases`

## 方案选择

### 方案 A：`electron-builder + electron-updater + GitHub Releases`

优点：
- 与当前仓库技术栈完全匹配
- `NSIS` 是 Windows 自动更新的标准支持目标
- 支持自动下载、下载进度、下载完成安装
- 后续切换自建更新服务器时，客户端逻辑可大部分复用

缺点：
- 需要规范 Release 附件和版本发布流程

### 方案 B：`update-electron-app + update.electronjs.org`

优点：
- 接入简单

缺点：
- 对交互和行为控制力较弱
- 后续切换自建更新源时迁移价值不高
- 不适合当前“先 GitHub Release，后自建源”的路线

### 方案 C：第一版就做自建更新服务

优点：
- 灵活

缺点：
- 明显过度设计
- 当前目标只需完成“发现、下载、确认安装”

## 推荐方案

采用方案 A：

- `electron-builder + electron-updater + GitHub Releases`

## 总体架构

自动更新分为四层：

1. 发布层
   使用 `electron-builder` 构建并发布 Windows 安装包与更新元数据到 `GitHub Releases`

2. 主进程更新服务层
   新增 `src/main/app-updater.ts`，封装 `electron-updater`、更新状态、日志、对话框和手动检查入口

3. 预加载桥层
   通过 `src/preload/preload.ts` 暴露：
   - 手动检查更新 API
   - 更新状态订阅 API

4. renderer 展示层
   由 `src/renderer/editor/App.tsx` 订阅更新状态，在底部状态条中仅在下载中显示提示

## 主进程职责

新增 `src/main/app-updater.ts` 后，主进程只通过一个服务对象管理自动更新。

该服务负责：
- 初始化 `autoUpdater`
- 判断是否应该启用自动更新
- 自动检查更新
- 手动检查更新
- 转发更新状态到 renderer
- 下载完成后弹系统确认框
- 记录更新日志

该服务不负责：
- 直接改动 renderer 业务状态
- 控制文档保存逻辑
- 暴露不受限 Node 能力给 renderer

## 启用条件

第一版只在以下条件全部成立时启用自动更新：

- `process.platform === "win32"`
- `app.isPackaged === true`
- 当前运行模式不是 `test-workbench`

这样可以避免：
- 开发环境误触发更新逻辑
- 测试工作台环境干扰
- 非 Windows 平台进入未验证路径

## 更新状态模型

建议新增共享类型文件 `src/shared/app-update.ts`，定义最小状态模型：

- `idle`
- `checking`
- `downloading`
- `downloaded`
- `error`

其中 `downloading` 额外携带：
- `version`
- `percent`

其中 `downloaded` 额外携带：
- `version`

其中 `error` 额外携带：
- `message`

renderer 第一版只消费：
- 当前是否处于 `downloading`
- 下载百分比

## 自动检查流程

应用启动后：

1. 等待主窗口建立并进入稳定态
2. 延迟约 5 到 10 秒
3. 主进程执行一次 `checkForUpdates()`

自动检查的交互约束：
- 检查开始时不弹窗
- 无更新时不提示
- 出错时只记录日志，不主动打断用户

## 手动检查流程

在 `Help` 菜单新增 `Check for Updates`。

用户手动触发后：

1. 主进程执行同一套 updater 检查逻辑
2. 若没有可用更新，则弹“当前已是最新版本”
3. 若检查失败，则弹“检查更新失败”
4. 若发现更新，则继续进入后台下载流程

## 下载与安装流程

当收到 `update-available` 后：

- 客户端自动后台下载

下载阶段：
- renderer 底部状态条显示下载提示
- 如有进度则显示百分比

下载完成后：
- 主进程弹系统对话框
- 选项为：
  - `立即重启更新`
  - `稍后`

若用户选择立即安装：
- 调用 `quitAndInstall()`

## 状态条设计

底部状态条沿用现有结构，不新增第二条底栏。

默认状态：
- 不显示更新提示

下载中：
- 显示 `正在下载更新…`
- 若有进度则显示 `正在下载更新 42%`

下载完成：
- 该提示消失
- 由主进程系统弹窗接管

错误状态：
- 自动检查场景下不在状态条常驻显示错误
- 手动检查场景下由弹窗反馈

这样可以保证状态条只在用户真正需要感知下载时出现额外噪音。

## 顶部通知条

除下载中的持续状态外，所有临时提示统一使用页面顶部居中的通知条。

通知条行为：
- 仅在需要时显示
- 从上方滑入展开
- 默认停留 3 秒
- 再向上折叠收起
- 新通知到来时替换当前内容并重置计时

当前接入的提示来源：
- 手动检查更新无可用新版本
- 手动检查更新失败
- 主题家族不支持当前颜色模式时的回退提示
- 已配置主题不存在时的回退提示

不再保留设置页中的主题 warning 文案，统一由顶部通知条承载一次性反馈。

## UI 落点

renderer 的改动只落在编辑器壳层，不改 Markdown 数据模型。

计划改动点：
- `src/renderer/editor/App.tsx`
  - 订阅更新状态
  - 在状态条追加条件渲染的下载提示
- `src/renderer/styles/app-ui.css`
  - 为下载提示增加轻量样式

约束：
- 不新增 toast
- 不新增 modal
- 不改变当前状态条定位结构

## 菜单与桥接

为支持手动检查更新，需要补齐三处：

1. `src/shared/menu-command.ts`
   新增菜单命令类型

2. `src/main/application-menu.ts`
   在 `Help` 菜单下新增手动检查入口

3. `src/preload/preload.ts`
   暴露：
   - `checkForUpdates()`
   - `onAppUpdateState(listener)`

## 发布配置

需要补的发布层配置：

- `package.json`
  - 新增 `repository`
  - 新增 `electron-updater` 运行时依赖
  - 建议新增 `electron-log`
  - 增加 Windows 发布脚本

- `electron-builder.json`
  - 增加 `publish.github` 配置
  - 指定 `owner`
  - 指定 `repo`
  - 建议指定 `electronUpdaterCompatibility`

发布成功后，Release 附件应包含：
- `Yulora-Setup-<version>.exe`
- `latest.yml`
- 对应 `.blockmap`

## 后续迁移到自建服务器

为了后续支持服务器链路，第一版必须把更新源细节收敛在主进程更新服务内。

未来迁移时预计只需改：
- `electron-builder` 的 publish provider
- 发布脚本
- 必要时 updater provider 配置覆盖

无需重写：
- renderer 状态条
- 手动检查入口
- 下载完成确认弹窗

## 风险

1. Release 附件不完整
   会导致客户端能发现更新但无法正常下载或安装。

2. 在未安装或开发环境验证更新
   容易得到误导性结果。

3. 不签名的 Windows 包
   可能影响安装与升级体验，后续建议尽快补代码签名。

4. 若把更新状态直接耦合进文档状态
   会污染编辑器核心状态模型，因此必须单独建模。

## 验收标准

完成后应满足：
- 已安装 Windows 客户端启动后可自动检查 GitHub Releases 上的新版本
- 发现新版本后自动后台下载
- 下载中底部状态条显示更新提示
- 非下载状态默认不显示更新提示
- 下载完成后弹出“立即重启更新 / 稍后”确认框
- `Help` 菜单可手动检查更新
- 手动检查无更新时有明确反馈
- 自动检查无更新时不打扰用户
- 架构上保留未来切换自建更新源的空间
