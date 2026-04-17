# 中文字体预设设计

## 目标

为文档排版增加独立的中文字体预设，使用户可以分别设置：

- 文档主字体预设
- 中文字体预设

并满足以下约束：

- 设置页两个入口都使用下拉框
- 移除原“文档字体预设”下的自由输入框
- 代码块与行内代码继续保留现有等宽字体策略
- 当设置了中文字体时，中文字符应直接使用该字体，而不是依赖浏览器字体回退
- 未安装所选字体时静默回退

## 现状

当前文档排版偏好只有：

- `document.fontFamily`
- `document.fontSize`

对应链路已经完整贯通：

- `src/shared/preferences.ts`
- `src/preload/preload.ts`
- `src/renderer/types.d.ts`
- `src/renderer/editor/settings-view.tsx`
- `src/renderer/editor/App.tsx`
- `src/renderer/styles/editor-source.css`

编辑器 Markdown 装饰链路集中在 `packages/editor-core`：

- `packages/editor-core/src/extensions/markdown.ts`
- `packages/editor-core/src/decorations/block-decorations.ts`
- `packages/editor-core/src/decorations/inline-decorations.ts`

这条链路已经处理 inactive block、inline 样式、图片预览和 composition guard，是本次功能最稳妥的落点。

## 范围

本设计覆盖：

- 偏好模型新增中文字体字段
- 设置页新增中文字体下拉框，并移除文档字体自由输入框
- 新增系统字体列表 IPC
- 编辑器正文的中文字符强制字体装饰
- 相关测试与文档更新

本设计不覆盖：

- 把字体文件打包进 app
- 在线下载字体
- 按语言标签或段落语言做复杂脚本识别
- 代码块或行内代码的中文字体覆盖

## 推荐方案

采用“双预设 + 系统字体枚举 + 中文连续段装饰”方案：

1. 偏好结构扩展为：
   - `document.fontFamily`
   - `document.cjkFontFamily`
   - `document.fontSize`
2. `main` 进程新增字体服务，按平台读取系统已安装字体族名
3. renderer 设置页通过 IPC 获取字体列表，供两个下拉框使用
4. editor 根节点新增 `--yulora-document-cjk-font-family`
5. `packages/editor-core` 为正文里的中文连续字符生成 `Decoration.mark`
6. CSS 对该装饰类强制应用中文字体变量

## 字体来源策略

初版不内置字体文件，全部使用系统字体。

原因：

- 当前仓库没有字体资产、`@font-face` 或字体打包链路
- 内置字体会显著增加安装包体积
- 还会引入额外的字体许可与跨平台路径问题

行为定义：

- 下拉框列出系统已安装字体族名
- 用户选择后直接保存字体族名
- 字体缺失时由浏览器静默回退

## 系统字体服务

新增 `main` 侧字体服务，例如：

```ts
type FontCatalogService = {
  listFontFamilies: () => Promise<string[]>;
};
```

平台策略：

- Windows：读取字体注册表并归一化出字体族名
- macOS：调用系统命令读取字体清单并提取字体族名
- 其他平台：返回空列表或尽力返回可用字体

输出要求：

- 去重
- 去除空字符串
- 按 `localeCompare` 稳定排序

renderer 不关心平台细节，只接收 `string[]`。

## 偏好模型

`src/shared/preferences.ts` 中 `DocumentPreferences` 扩展为：

```ts
type DocumentPreferences = {
  fontFamily: string | null;
  cjkFontFamily: string | null;
  fontSize: number | null;
};
```

归一化规则：

- 仍复用现有 `normalizeFontFamily`
- 空字符串和空白字符归一为 `null`
- 旧偏好没有 `cjkFontFamily` 时默认 `null`

不需要升级 schema version；本次只是在现有 schema 下增加可选字段并通过 normalize 兜底。

## Renderer 设置页

设置页排版区调整为：

- `文档字号`
- `文档字体预设`
- `中文字体预设`

交互规则：

- 两个字体设置都使用下拉框
- 两者都带 `系统默认` 选项
- 删除文档字体自定义输入框
- 中文字体提示文案说明“仅作用于正文中文字符，代码块和行内代码不受影响”

字体列表来源：

- `Window.yulora.listFontFamilies()`

为了减少无谓刷新，可在 App 初始化时与 preferences、themes 一起加载字体列表，并缓存在顶层状态中。

## 中文强制字体策略

不能依赖如下方式：

```css
font-family: "西文字体", "中文字体";
```

因为当主字体本身带有中文字形时，中文不会稳定落到第二字体。

因此需要显式装饰中文字符范围。

### 装饰原则

- 只为连续中文段创建一个 mark range
- 不按单字符创建装饰
- 不进入代码围栏内容
- 不覆盖行内代码 token
- 可与现有 strong/emphasis/strikethrough 装饰叠加

### 装饰落点

优先并入现有 `blockDecorations` 管线，而不是单独新增一套并行插件。

原因：

- 当前装饰刷新已经受 composition guard 保护
- 现有块类型边界已经能区分 paragraph / heading / list / blockquote / codeFence
- 与现有 inline 装饰共享范围、测试和刷新时机，风险更低

### 目标块

- heading
- paragraph
- list item inline content
- blockquote line inline content

排除块：

- codeFence content
- 行内 codeSpan content

### 样式

新增类名例如：

```css
.cm-yulora-cjk-font {
  font-family: var(--yulora-document-cjk-font-family);
}
```

只有当 `--yulora-document-cjk-font-family` 存在时，装饰才产生视觉效果。

## 性能策略

本功能的性能关键点不在“中文字符数”，而在“中文连续段数量”。

优化原则：

- 采用连续段装饰，而不是单字装饰
- 不扫描代码围栏和行内代码
- 仅在现有 derived-state 重算时顺带生成，不另起额外刷新通道

预期：

- 正常长文档：影响可控
- 极端中英逐字交替的文档：装饰数量会明显增加，但仍优于逐字装饰方案

## 测试范围

需要补强以下测试：

- `src/shared/preferences.test.ts`
  - `document.cjkFontFamily` 的归一化
  - merge 保留与覆盖行为
- `src/main/font-catalog-service.test.ts`
  - 平台输出解析
  - 去重、排序、空值过滤
- `src/preload/preload.contract.test.ts`
  - 新增字体列表 IPC 暴露
- `src/renderer/app.autosave.test.ts`
  - 初始化与偏好更新时写入 `--yulora-document-cjk-font-family`
- `src/renderer/editor/settings-view` 相关测试
  - 两个下拉框显示
  - 自由输入框已移除
- `packages/editor-core/src/decorations/block-decorations.test.ts`
  - 连续中文段装饰
  - 中英混排拆段
  - 行内代码不装饰
  - 代码围栏不装饰

## 验收标准

1. 设置页存在“文档字体预设”和“中文字体预设”两个下拉框
2. 原文档字体自由输入框被移除
3. 字体列表来自系统字体枚举结果
4. `document.cjkFontFamily` 可持久化并通过 preload/renderer 读写
5. 设置中文字体后，正文中文字符使用该字体
6. 西文仍使用主文档字体
7. 代码块与行内代码不受中文字体设置影响
8. 未安装字体时静默回退，不弹错
