# CJK Font Preferences Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add separate document and Chinese font presets backed by system font enumeration and explicit CJK text decorations.

**Architecture:** Extend the shared preferences contract with `document.cjkFontFamily`, add a main-process font catalog IPC that returns installed font families, update the renderer settings flow to use dropdowns only, and generate CodeMirror mark decorations for contiguous CJK text runs so Chinese glyphs always use the configured font. Keep code fences and inline code on the existing monospace path and reuse the current markdown decoration pipeline to preserve IME behavior.

**Tech Stack:** Electron, React 19, TypeScript, CodeMirror 6, Vitest

---

### Task 1: 扩展偏好模型

**Files:**
- Modify: `src/shared/preferences.ts`
- Test: `src/shared/preferences.test.ts`
- Test: `src/main/preferences-service.test.ts`
- Test: `src/main/preferences-store.test.ts`

**Step 1: Write the failing test**

在 `src/shared/preferences.test.ts` 增加最小测试：

```ts
it("normalizes document cjk font family", () => {
  expect(normalizePreferences({ document: { cjkFontFamily: "  思源黑体  " } }).document.cjkFontFamily).toBe("思源黑体");
  expect(normalizePreferences({ document: { cjkFontFamily: "" } }).document.cjkFontFamily).toBeNull();
});
```

在 `src/main/preferences-service.test.ts` / `src/main/preferences-store.test.ts` 增加断言，确保 `document.cjkFontFamily` 能正确读写。

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/shared/preferences.test.ts src/main/preferences-service.test.ts src/main/preferences-store.test.ts`

Expected: FAIL，提示 `cjkFontFamily` 缺失或对象不匹配。

**Step 3: Write minimal implementation**

- 为 `DocumentPreferences` 增加 `cjkFontFamily`
- 在 `DEFAULT_PREFERENCES.document` 中加入 `cjkFontFamily: null`
- 在 `normalizePreferences` 和 `mergePreferences` 中处理该字段

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/shared/preferences.test.ts src/main/preferences-service.test.ts src/main/preferences-store.test.ts`

Expected: PASS

### Task 2: 新增系统字体目录服务

**Files:**
- Create: `src/main/font-catalog-service.ts`
- Test: `src/main/font-catalog-service.test.ts`
- Modify: `src/main/main.ts`

**Step 1: Write the failing test**

在 `src/main/font-catalog-service.test.ts` 为以下行为写测试：

- Windows 注册表输出能解析成字体族名
- macOS 命令输出能解析成字体族名
- 重复值、空值、样式后缀会被清洗
- 返回结果排序稳定

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/main/font-catalog-service.test.ts`

Expected: FAIL，文件或导出不存在。

**Step 3: Write minimal implementation**

- 实现 `createFontCatalogService`
- 平台依赖通过注入的命令执行函数隔离，便于测试
- Windows 解析注册表字体名时去掉 ` (TrueType)` 等尾缀
- macOS 解析系统命令返回时提取 family 字段
- 统一去重、过滤、排序

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/main/font-catalog-service.test.ts`

Expected: PASS

### Task 3: 暴露字体列表 IPC

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/types.d.ts`
- Test: `src/preload/preload.contract.test.ts`
- Test: `src/main/main.test.ts`

**Step 1: Write the failing test**

为以下行为补测试：

- `preload` 暴露 `listFontFamilies()`
- 它调用新增的 IPC channel
- `main.ts` 注册新的 `ipcMain.handle(...)`

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/preload/preload.contract.test.ts src/main/main.test.ts`

Expected: FAIL，API 或 IPC wiring 断言不成立。

**Step 3: Write minimal implementation**

- 新增 channel 常量
- 在 `main.ts` 初始化字体服务并注册 handler
- 在 `preload.ts` 和 `types.d.ts` 中暴露 `listFontFamilies`

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/preload/preload.contract.test.ts src/main/main.test.ts`

Expected: PASS

### Task 4: 让 renderer 加载并应用中文字体变量

**Files:**
- Modify: `src/renderer/editor/App.tsx`
- Test: `src/renderer/app.autosave.test.ts`

**Step 1: Write the failing test**

在 `src/renderer/app.autosave.test.ts` 增加：

- 初始 preferences 带 `document.cjkFontFamily` 时，根节点写入 `--yulora-document-cjk-font-family`
- 偏好更新时，该变量随之更新或移除

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/app.autosave.test.ts`

Expected: FAIL，CSS 变量未写入。

**Step 3: Write minimal implementation**

- 新增 `DOCUMENT_CJK_FONT_FAMILY_CSS_VAR`
- 在 `applyPreferencesToDocument` / `clearDocumentPreferences` 中读写它
- 初始化时与 preferences、themes 一起拉取字体列表并保存在顶层状态

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/app.autosave.test.ts`

Expected: PASS

### Task 5: 更新设置页为双下拉框

**Files:**
- Modify: `src/renderer/editor/settings-view.tsx`
- Modify: `src/renderer/styles/settings.css`
- Test: `src/renderer/app.autosave.test.ts`

**Step 1: Write the failing test**

补最小行为测试：

- 设置页显示“文档字体预设”和“中文字体预设”两个下拉框
- 不再渲染文档字体文本输入框
- 选择任一下拉项会提交对应 patch

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/renderer/app.autosave.test.ts`

Expected: FAIL，控件不存在或行为不符。

**Step 3: Write minimal implementation**

- `SettingsView` 接收字体列表属性
- 文档字体与中文字体都改为下拉框
- 删除自由输入框及其提交逻辑
- 保留 `系统默认` 选项

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/renderer/app.autosave.test.ts`

Expected: PASS

### Task 6: 为编辑器正文增加中文连续段装饰

**Files:**
- Modify: `packages/editor-core/src/decorations/inline-decorations.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.ts`
- Modify: `packages/editor-core/src/decorations/block-decorations.test.ts`
- Modify: `src/renderer/styles/markdown-render.css`

**Step 1: Write the failing test**

在 `packages/editor-core/src/decorations/block-decorations.test.ts` 增加：

- 连续中文文本只生成一个 `cm-yulora-cjk-font` 范围
- `Hello 中文 world 测试` 被拆成两个中文范围
- 行内代码 `` `中文` `` 不生成中文字体装饰
- code fence 内容不生成中文字体装饰

**Step 2: Run test to verify it fails**

Run: `npm run test -- packages/editor-core/src/decorations/block-decorations.test.ts`

Expected: FAIL，类名不存在或范围数量不符。

**Step 3: Write minimal implementation**

- 新增“扫描连续中文段”的 helper
- 在 paragraph / heading / list / blockquote 的 inline 文本路径上追加 mark 装饰
- 跳过 `codeSpan`
- 为新类名添加 CSS，引用 `--yulora-document-cjk-font-family`

**Step 4: Run test to verify it passes**

Run: `npm run test -- packages/editor-core/src/decorations/block-decorations.test.ts`

Expected: PASS

### Task 7: 整体验证与文档对齐

**Files:**
- Modify: `docs/test-cases.md`
- Verify: `src/shared/preferences.test.ts`
- Verify: `src/main/font-catalog-service.test.ts`
- Verify: `src/main/preferences-service.test.ts`
- Verify: `src/main/preferences-store.test.ts`
- Verify: `src/preload/preload.contract.test.ts`
- Verify: `src/main/main.test.ts`
- Verify: `src/renderer/app.autosave.test.ts`
- Verify: `packages/editor-core/src/decorations/block-decorations.test.ts`

**Step 1: Update docs**

在 `docs/test-cases.md` 补充手工验证：

- 设置中文字体预设
- 中文字符变化
- 西文保持主字体
- 行内代码和代码块不变
- 字体缺失时静默回退

**Step 2: Run focused verification**

Run:

```bash
npm run test -- src/shared/preferences.test.ts src/main/font-catalog-service.test.ts src/main/preferences-service.test.ts src/main/preferences-store.test.ts src/preload/preload.contract.test.ts src/main/main.test.ts src/renderer/app.autosave.test.ts packages/editor-core/src/decorations/block-decorations.test.ts
```

Expected: PASS

**Step 3: Run quality gates**

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: 全部 exit 0
