# Preferences Nested Sidebar Design

Date: 2026-05-01
Scope: renderer settings drawer presentation and settings-view structure

## Goal

FishMark 的偏好设置项已经从少量基础控件扩展到主题、主题参数、字体、自动保存和最近文件等多个区域。继续把所有设置平铺在一个滚动抽屉里，会让用户难以快速定位，也会让后续新增设置缺少稳定位置。

本次设计把现有偏好设置重排为“左侧可展开分类树 + 右侧当前子分类内容”的抽屉布局。首版只重排已有设置，不新增空分类，不新增偏好字段，不改变保存语义。

## Approved Direction

采用当前悬浮设置抽屉内的双栏结构：

- 左侧为窄分类栏，显示一级分类和可展开子分类。
- 右侧为当前子分类的设置内容。
- 抽屉仍覆盖在编辑器之上，不挤压、不卸载编辑器。
- 保留现有 sticky header、footer、关闭行为、自动保存状态和“恢复默认值”入口。
- 抽屉可适度加宽，以容纳左侧分类栏和右侧表单。

## Category Taxonomy

首版只展示已有设置：

```text
外观
  主题
  排版
文件
  自动保存
  最近文件
```

### 外观 / 主题

包含现有主题相关控件：

- 颜色模式：system / light / dark
- 主题包选择
- 打开主题目录
- 刷新主题
- 动态效果
- 当前主题参数
- 重置当前主题参数

当前主题参数只在选中的主题包提供参数时出现，逻辑与现有行为保持一致。

### 外观 / 排版

包含现有字体和字号控件：

- 应用 UI 字体预设
- 应用 UI 字号
- 文档字号
- 文档字体预设
- 中文字体预设

这些控件仍写入 `preferences.ui` 和 `preferences.document`。

### 文件 / 自动保存

包含现有自动保存控件：

- 空闲触发时长

仍写入 `preferences.autosave.idleDelayMs`，范围和提交时机保持不变。

### 文件 / 最近文件

包含现有最近文件控件：

- 最多保留条数

首版保持当前禁用 / read-only 状态和提示文案，不提前接入未完成能力。

## Interaction Model

左侧一级分类是可展开项，子分类是实际内容切换项。

- 默认打开设置时选中 `外观 / 主题`。
- 点击一级分类只展开或收起该分类，不直接切换右侧内容。
- 点击子分类切换右侧内容。
- 当前选中的子分类所属一级分类必须保持展开。
- 收起非当前一级分类时，不影响当前右侧内容。
- 点击当前子分类所属的一级分类时，该一级分类保持展开，不隐藏当前选中项。
- 关闭再打开设置时，首版不要求记住上次子分类；默认回到 `外观 / 主题`。

## Responsive Behavior

桌面宽度下使用双栏：

- 抽屉宽度从当前单栏宽度扩展到可容纳分类栏和表单的宽度。
- 左侧分类栏固定宽度。
- header 和 footer 固定在抽屉顶部 / 底部，中间 body 承担滚动。
- 左侧分类栏在中间 body 内保持可见，右侧内容独立滚动。

窄屏下避免硬塞双栏：

- 左侧分类栏移动到内容顶部，呈现为可横向滚动或紧凑树形区域。
- 右侧设置行继续使用现有单列响应式表单规则。
- 文字、按钮和 select 不得溢出容器。

## Component Structure

重构 `SettingsView` 的渲染结构，但不改变 main / preload / shared preferences 合同。

拆分为小的 renderer 内部单元：

- `SettingsNavigation`
  - 接收分类模型、展开状态、当前子分类 id。
  - 负责渲染一级分类、展开按钮和子分类按钮。
- `SettingsSection`
  - 接收当前子分类 id 和现有 handler / derived state。
  - 根据子分类渲染对应控件。
- `SettingsGroup` / `SettingsRow`
  - 保留现有行组语义，允许作为轻量局部组件抽出。
  - 不引入通用设计系统抽象，避免为了单页设置过度泛化。

分类模型应是 renderer 内的显式常量，描述 id、label、children。它不进入 shared preferences，也不写入磁盘。

## Data Flow

设置数据流保持当前模式：

```text
用户操作控件
  -> SettingsView handler
  -> onUpdate(PreferencesUpdate)
  -> preload bridge
  -> main preferences service
  -> preferences changed
  -> renderer 重新接收 Preferences
```

本次新增的导航状态仅为 renderer UI state：

- `expandedCategoryIds`
- `activeSectionId`

这些状态不持久化，不影响偏好文件 schema。

## Error Handling

现有错误展示保留：

- `onUpdate` 返回错误时继续显示 `error-banner`。
- 刷新主题失败时继续显示“主题列表刷新失败。”
- 打开主题目录失败时继续显示“无法打开主题目录。”

切换分类不得清空当前错误，除非后续操作成功并按现有逻辑清理错误。

## Visual Rules

- 设置抽屉仍是一个 coherent surface，不把右侧每组设置做成嵌套卡片。
- 左侧分类栏使用低对比背景和轻量选中态，不能抢主表单焦点。
- 一级分类使用展开箭头和图标位；子分类使用缩进列表。
- 主题和排版作为 `外观` 下的子分类，不在一级导航重复出现。
- 自动保存和最近文件作为 `文件` 下的子分类。
- 继续使用现有 theme tokens、settings primitives 和 `settings.css` 的布局责任划分。

## Accessibility

- 设置抽屉继续使用 `role="dialog"`、`aria-modal="true"` 和 heading 关联。
- 左侧分类栏使用 `nav aria-label="设置分类"`。
- 一级分类按钮使用 `aria-expanded`。
- 当前子分类按钮使用 `aria-current="page"`。
- 键盘用户可以 Tab 到分类项并切换子分类。
- Escape 关闭设置行为保持不变。

## Testing

需要补或更新 renderer 测试，覆盖：

- 打开设置时默认显示 `外观 / 主题` 内容。
- 点击 `外观 / 排版` 后显示字体和字号控件，不显示主题包控件。
- 点击 `文件 / 自动保存` 后显示空闲触发时长控件。
- 点击 `文件 / 最近文件` 后显示最近文件禁用控件和提示。
- 一级分类展开 / 收起状态可切换。
- 当前子分类切换不改变已有 `onUpdate` patch 结构。
- 关闭设置和 Escape 行为不回归。

质量门禁仍按项目定义执行：

- build
- lint
- typecheck
- 相关测试

## Out Of Scope

- 不新增新的偏好字段。
- 不持久化当前设置子分类。
- 不实现空的未来分类。
- 不接入最近文件功能。
- 不替换主题系统、偏好存储或 preload 合同。
- 不把设置页改成独立窗口。
