# Theme Family Mode Design

## Goal

把当前“单目录主题包”模型升级为“主题家族 + light/dark 模式分支”模型，同时保证：

- `theme.mode` 继续只表示外观模式
- `theme.selectedId` 只表示主题家族 id
- 社区主题安装后统一从 `<userData>/themes` 发现
- 主题家族缺少当前模式时回退到内置默认主题，并在界面提示
- 打包后不再依赖 `src/renderer/styles/themes` 这种仅开发态稳定的扫描路径

## Scope

本设计覆盖：

- 偏好设置中主题字段的语义调整
- 社区主题目录结构从平铺改为 `themes/<id>/<mode>/*.css`
- 主题扫描服务的返回结构
- renderer 运行时的主题解析、回退与提示
- 设置页的主题列表与 warning 文案
- 主题相关测试与文档更新

本设计不覆盖：

- 在线主题市场
- 主题 manifest、作者信息、预览图
- 主题签名或沙箱隔离
- 新增只读 `resources/themes` 扩展目录

## Current Problems

当前实现有三个主要问题：

1. `theme.selectedId` 实际保存的是单个主题目录 id，而不是主题家族 id，导致“外观模式”和“主题选择”语义纠缠。
2. 社区主题目录是平铺的单层 CSS 目录，无法表达“同一主题家族支持 light/dark 两个模式”。
3. `main` 进程当前会扫描 `src/renderer/styles/themes` 作为内置主题目录，这在打包后并不稳定，因为安装包不会包含 `src/`。

## Recommendation

采用“主题家族 + 模式分支”模型：

- 偏好设置只保存：
  - `theme.mode`: `system | light | dark`
  - `theme.selectedId`: `string | null`，表示当前首选主题家族 id
- 内置默认主题固定为家族 `default`
- 社区主题目录统一为 `<userData>/themes/<familyId>/<mode>/`
- 当前模式缺失时回退到内置 `default` 的同模式分支
- 回退时保留 `theme.selectedId`，这样系统或用户切回支持的模式时可自动恢复所选主题家族

## Theme Directory Layout

### Builtin theme family

```text
src/renderer/styles/themes/
  default/
    light/
      tokens.css
      ui.css
      editor.css
      markdown.css
    dark/
      tokens.css
      ui.css
      editor.css
      markdown.css
```

### Community/user theme families

```text
<userData>/themes/
  graphite/
    light/
      tokens.css
      ui.css
    dark/
      tokens.css
      ui.css
      editor.css
      markdown.css
  paper/
    light/
      tokens.css
      ui.css
      editor.css
      markdown.css
```

约束：

- `<familyId>` 是主题家族 id
- `<mode>` 只能是 `light` 或 `dark`
- 每个 mode 目录下允许缺少某些 part
- 只要某个 mode 目录下存在至少一个合法 part，就视为该家族支持该模式
- 整个 mode 目录缺失时，视为该主题家族不支持该模式

## Theme Catalog Model

`main` 侧扫描结果从“单个主题目录”升级为“主题家族”：

```ts
type ThemeFamilyDescriptor = {
  id: string;
  source: "builtin" | "community";
  name: string;
  directoryName: string;
  modes: {
    light: ThemeVariantDescriptor;
    dark: ThemeVariantDescriptor;
  };
};

type ThemeVariantDescriptor = {
  available: boolean;
  availableParts: {
    tokens: boolean;
    ui: boolean;
    editor: boolean;
    markdown: boolean;
  };
  partUrls: Partial<{
    tokens: string;
    ui: string;
    editor: string;
    markdown: string;
  }>;
};
```

实现约束：

- `theme-service` 只扫描 `<userData>/themes`
- 内置 `default` 家族不再依赖 `main` 进程文件扫描
- renderer 内部以静态 URL 方式解析内置 `default/light` 与 `default/dark`

这样做可以彻底去掉“打包后扫描 `src`”这个不稳定点。

## Runtime Resolution

renderer 的主题解析流程：

1. 从 `theme.mode` 解析出 `resolvedMode`
2. 读取 `theme.selectedId`
3. 若 `selectedId === null`，直接使用内置 `default/<resolvedMode>`
4. 若 `selectedId !== null`：
   - 找不到该主题家族：回退到内置 `default/<resolvedMode>`
   - 找到且支持 `resolvedMode`：使用该主题家族的对应 mode 变体
   - 找到但不支持 `resolvedMode`：回退到内置 `default/<resolvedMode>`

回退时保留 `theme.selectedId` 原值，不自动清空。

## Renderer Derived State

为避免设置页重复推导复杂逻辑，renderer 应生成一个派生状态：

```ts
type ActiveThemeResolution = {
  requestedThemeId: string | null;
  resolvedMode: "light" | "dark";
  activeThemeId: string;
  activeThemeSource: "builtin" | "community";
  fallbackReason: null | "missing-theme" | "unsupported-mode";
};
```

语义：

- `requestedThemeId`: 偏好设置里保存的家族 id
- `activeThemeId`: 当前实际挂载的主题家族 id
- `fallbackReason === "unsupported-mode"`: 当前选中的家族存在，但不支持当前 mode
- `fallbackReason === "missing-theme"`: 当前选中的家族已不存在

## Settings UX

设置页行为调整如下：

- “主题包”语义改成“主题家族”
- 下拉选项显示社区主题家族列表，保留 `Yulora 默认`
- 选中一个只支持单模式的主题家族后：
  - 在其支持模式下正常生效
  - 切到不支持模式时，UI 使用内置默认主题渲染
  - 同时显示提示：`该主题不支持浅色模式，已回退到 Yulora 默认。`
    或
    `该主题不支持深色模式，已回退到 Yulora 默认。`
- 如果所选主题家族已不存在，显示现有“未找到”风格提示，但文案改为家族语义

## Preferences Migration

这次不新增 schema 字段，只调整 `theme.selectedId` 的解释方式。

兼容策略：

- 旧值若为 `graphite-dark` / `graphite-light` 这类旧目录 id，启动时优先尝试迁移为去掉模式后缀的家族 id
- 仅当后缀为 `-dark` / `-light` 或 `_dark` / `_light` 时做此迁移
- 迁移后若对应家族不存在，仍保留迁移后的 id，由运行时按“missing-theme”处理

这样可以减少现有用户在升级后的设置丢失。

## Tests

需要补强以下测试：

- `src/shared/preferences.test.ts`
  - 旧 `selectedId` 值的迁移归一化
- `src/main/theme-service.test.ts`
  - 扫描 `themes/<id>/<mode>` 结构
  - 单模式家族
  - 双模式家族
  - 空 mode 目录跳过
- `src/renderer/theme-runtime.test.ts`
  - 内置默认家族路径改成 `default/light` 与 `default/dark`
- `src/renderer/app.autosave.test.ts`
  - 选中主题家族时按 mode 挂载对应 CSS
  - 缺失当前 mode 时回退到默认主题
  - 设置页 warning 文案
- 文档测试用例
  - `<userData>/themes/<familyId>/<mode>` 的手工验证路径

## Risks

1. 旧主题目录结构不兼容
   - 接受这次 breaking change，但通过 `selectedId` 的轻量迁移降低偏好丢失概率

2. 社区主题 part 缺失时可能出现风格混搭
   - 这是当前系统已接受的特性；仍允许缺 part，只清理缺失 part 的旧 link

3. 把内置主题从 `default-light` / `default-dark` 目录迁到 `default/light` / `default/dark` 会影响引用路径
   - 通过主题 runtime 测试和 app 集成测试锁定路径变化

## Acceptance

1. 社区主题统一从 `<userData>/themes/<familyId>/<mode>` 扫描
2. `theme.mode` 仍只控制 light/dark/system
3. `theme.selectedId` 只保存主题家族 id
4. 当前家族缺失当前模式时，界面回退到内置默认主题
5. 设置页显示“该主题不支持浅色/深色模式”的提示
6. 打包后不再依赖扫描 `src/renderer/styles/themes`
