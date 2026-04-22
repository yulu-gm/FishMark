# 主题与样式验收规则

主题系统的目标是“控制视觉表达”，不是“接管应用结构”。

如果本轮改动涉及：
- `fixtures/themes/**`
- `src/renderer/theme-*`
- `src/shared/theme-*`
- `src/renderer/styles/**`
- 偏好里的 theme / typography / dynamic effects

就用这份规则审查。

## 1. 主题应控制什么

允许主题控制：
- semantic tokens
- markdown visual slots
- editor visual tokens
- titlebar / workbench 背景效果
- declarative shader parameters

允许样式层控制：
- 视觉层次
- 排版
- 颜色
- 阴影
- 透明度
- 合理的交互反馈

## 2. 主题不应控制什么

不允许主题越权控制：
- app-owned 容器几何布局
- 文档真相
- 保存 / 打开 / reload 等业务逻辑
- IPC / runtime business branching

看到以下情况应直接警惕：
- theme CSS 去写 workspace 结构布局规则
- 主题依赖脆弱 DOM 层级或私有 class 才能工作
- 样式改动偷偷编码产品行为

## 3. 理想 contract

主题应尽量依赖：
- semantic CSS variables
- manifest / typed descriptor
- 明确区分 light / dark
- 明确区分 CSS-only 参数与 shader 参数

不理想信号：
- 直接把组件内部 selector 当 public API
- 用硬编码颜色绕过已有 token contract
- runtime 和 theme package contract 脱节

## 4. 动态效果专项规则

动态效果存在时，重点检查：
- 最外层背景是否把动态 surface 完全盖住
- fallback 模式是否仍保持可读性
- reduced / off / full 模式是否有清晰边界

直接判 FAIL 的常见情况：
- shader/runtime 还在，但外层不透明背景把效果完全遮死
- 为了修视觉问题，直接让主题覆盖 app-owned 布局容器几何
- 主题参数没有 contract，靠散落的 magic variable 名称联动

## 5. 和 FishMark 现有主题 skill 的关系

如果改动明确涉及 theme package 结构、manifest、authoring 约束，再补读 `$fishmark-theme-authoring`。

这份 reference 负责“结构验收标准”；
`$fishmark-theme-authoring` 负责“FishMark 当前主题包落地细则”。

## 6. 审查提问清单

- 这次改动是在扩展 public theme contract，还是在偷用实现细节
- 主题是否越权控制了布局或业务层
- 新样式是否会让动态效果失真或不可见
- 新增 token / parameter 是否有清晰语义，而不是临时变量

