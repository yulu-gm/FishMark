# 理想 Markdown 编辑器架构基线

这份基线故意不以 FishMark 当前实现为准，而是以“长期可维护的本地优先 Markdown 编辑器”作为标准。

## 1. 分层模型

### Platform 层

只处理系统能力：
- 文件读写
- 窗口
- 菜单
- 剪贴板
- 原生对话框
- shell / protocol / file association

判断标准：
- 这里只回答“怎么和系统交互”
- 不在这里表达文档、workspace、theme、editor 语义

### Infrastructure 层

把外部能力包装成稳定接口：
- 文件仓库
- 偏好存储
- theme package 扫描器
- markdown parser adapter
- 导出器 / 搜索索引 / AI provider adapter

判断标准：
- 这里只负责接外部依赖
- 不直接承载“保存策略”“dirty 规则”“tab 语义”

### Domain 层

这是核心业务模型，至少应能清楚表达：
- Document / DocumentSession
- Workspace / Window / Tab
- Dirty tracking
- Save policy
- Selection / active block / outline
- External file conflict
- Theme selection / preference state

判断标准：
- 不依赖 React
- 不依赖 Electron 细节
- 这里描述“什么是真的”

### Application 层

负责用例编排：
- OpenDocument
- SaveDocument / SaveAs
- CloseTab
- ReloadFromDisk
- ImportClipboardImage
- UpdatePreferences
- ExecuteEditorCommand

判断标准：
- 这里负责把 domain 和 infrastructure 拼成完整动作
- 这里是业务流程入口，不应由 JSX 组件自己编排

### Presentation 层

只负责：
- 渲染视图
- 收集输入
- 订阅状态
- 调用 command / usecase
- 少量表现层状态

判断标准：
- 不直接做文件读写
- 不直接做权威 Markdown 解析
- 不直接承担保存、冲突解决、状态同步策略

## 2. 核心不变量

### Markdown 文本必须只有一个可编辑真相

允许：
- 一个 canonical editor/document owner
- last saved snapshot
- 由真相派生的 outline / word count / preview state

不允许：
- React state 一份文本
- workspace session 一份文本
- editor engine 再一份文本
- 靠手工同步把三者拼起来

review 时重点看：
- 保存到底读的是哪份文本
- dirty 是不是由 canonical content 推出来的
- reload / autosave / external change 是否会打到不同缓存

### 业务状态必须有清晰 owner

应当清楚区分：
- 领域状态：document / workspace / dirty / selection / settings
- UI 状态：drawer open / hover / animation state
- 派生状态：outline / metrics / availability

不允许把三者混在同一个大组件里靠 `useState` 堆出来。

### React 不是业务层

React 组件可以：
- render
- bind events
- call usecase / command

React 组件不应：
- 直接编排打开 / 保存 / 重载 / 冲突解决
- 成为状态真相 owner
- 持有跨模块业务流程

### main / preload / renderer 边界必须可解释

要求：
- main 负责高权限与系统集成
- preload 只暴露最小 typed API
- renderer 把 Electron 当远程平台

直接判失败的情况：
- renderer 直接拿 unrestricted Node API
- preload 暴露过宽接口
- IPC channel 没有清晰 contract

### Editor 需要适配层，而不是业务直接绑死 CodeMirror

理想状态下，业务逻辑应依赖 editor capability，而不是到处依赖具体 `EditorView` 细节。

允许：
- 单独的 controller / adapter / view wrapper

不理想但常见的坏味道：
- application / renderer shell 直接操作大量 CodeMirror internals
- 业务语义散落在 widget 或 DOM 事件补丁中

### User action 应尽量收敛到命令或用例入口

尤其是这些动作：
- save / save as
- open / close / switch tab
- toggle formatting
- import image
- export
- theme switch

反例：
- 业务流程直接写在按钮 click handler
- 菜单、快捷键、按钮各自有一套逻辑

### 公共模块要有清晰 public API

优先看：
- 是否存在模块级入口文件
- 外部模块是否在随意 import 内部细节
- 是否出现 `utils.ts` / `helpers.ts` 垃圾场

## 3. 典型 FAIL 信号

### P0

- renderer 直接处理高权限系统操作
- 保存链路依赖可能过期的缓存
- 外部修改 / autosave / reload 会互相覆盖
- Markdown round-trip 真相被破坏

### P1

- 同一业务信息多份可写真相
- Presentation 组件直接承载 application 流程
- 把 domain 规则塞进 infrastructure 或 JSX
- main / preload / renderer 责任模糊
- 新功能继续扩大既有坏边界

### P2

- 继续增加魔法字符串
- 公共 API 不清晰
- import 穿层
- 新 util 继续堆进无语义文件
- 文件体量继续膨胀且无明确抽象理由

## 4. 审查提问清单

看到改动时至少问：
- 这次改动把职责放在正确层吗
- 是否新增了第二份状态真相
- 是否让 UI 成为业务编排层
- 是否让一个动作出现多个并行入口而没有统一 command/usecase
- 是否让 editor implementation 细节进一步外溢
- 是否让 side effect 更难识别

