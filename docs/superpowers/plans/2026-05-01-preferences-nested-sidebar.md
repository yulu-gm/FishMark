# Preferences Nested Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the existing FishMark settings drawer into a nested left navigation plus right content layout without adding new preference fields or empty future categories.

**Architecture:** Keep preferences storage, preload contracts, and update handlers unchanged. Add renderer-only navigation state inside `SettingsView`, render the existing controls through section-specific branches, and update `settings.css` so the drawer becomes a stable header/body/footer shell with nested sidebar navigation.

**Tech Stack:** Electron, React, TypeScript, CodeMirror-facing renderer app, CSS, Vitest with jsdom.

---

## File Structure

- Modify `src/renderer/editor/settings-view.tsx`
  - Add renderer-only section ids and category model.
  - Add `SettingsNavigation`, `SettingsGroup`, and `SettingsRow` local components.
  - Move existing controls into four section render branches: `theme`, `typography`, `autosave`, `recent-files`.
  - Preserve all existing handlers and `PreferencesUpdate` patch shapes.
- Modify `src/renderer/styles/settings.css`
  - Change `.settings-shell` into a grid with sticky header, scrollable body, and footer.
  - Add nested sidebar styles for parent category buttons and child section buttons.
  - Keep existing row, input, slider, toggle, footer, animation, and glass styling semantics.
  - Add narrow viewport rules that stack navigation above content.
- Modify `src/renderer/app.autosave.test.ts`
  - Update the existing drawer smoke test so it expects only the default `外观 / 主题` section at first open.
  - Add navigation tests for `外观 / 排版`, `文件 / 自动保存`, and `文件 / 最近文件`.
  - Add a parent expand/collapse test.
  - Add a patch-shape regression test by changing UI font after switching to `排版`.
- Save this implementation plan in `docs/superpowers/plans/2026-05-01-preferences-nested-sidebar.md`.

## Task 1: Add Failing Renderer Tests For Nested Settings Navigation

**Files:**
- Modify: `src/renderer/app.autosave.test.ts`
- Test: `src/renderer/app.autosave.test.ts`

- [ ] **Step 1: Add local helpers near the existing settings tests**

In `src/renderer/app.autosave.test.ts`, near the current `"renders settings as a drawer panel with close affordance while keeping existing controls"` test, add these helpers before that test:

```ts
function getSettingsDrawerPanel(): HTMLElement {
  const drawerPanel = container.querySelector<HTMLElement>('[data-fishmark-panel="settings-drawer"]');
  if (!drawerPanel) {
    throw new Error("settings drawer panel not found");
  }
  return drawerPanel;
}

function getSettingsNavigationButton(name: string): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('[data-fishmark-region="settings-navigation"] button')
  ).find((candidate) => candidate.textContent?.trim() === name);

  if (!button) {
    throw new Error(`settings navigation button not found: ${name}`);
  }

  return button;
}

async function clickSettingsNavigationButton(name: string): Promise<void> {
  const button = getSettingsNavigationButton(name);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}
```

- [ ] **Step 2: Replace the broad existing drawer smoke test with a default-section test**

Replace the current `"renders settings as a drawer panel with close affordance while keeping existing controls"` test with this version:

```ts
it("opens settings on the appearance theme section with nested navigation", async () => {
  const driver = await renderEditorApp();
  await driver.openSettings();

  const drawerPanel = getSettingsDrawerPanel();
  const closeButton = container.querySelector<HTMLButtonElement>('[aria-label="关闭设置"]');
  const navigation = container.querySelector<HTMLElement>('[data-fishmark-region="settings-navigation"]');
  const activeSection = container.querySelector<HTMLElement>('[data-fishmark-settings-section="theme"]');
  const themeSelect = container.querySelector<HTMLSelectElement>("#settings-theme-package");
  const uiFontSelect = container.querySelector<HTMLSelectElement>("#settings-ui-font-preset");
  const autosaveInput = container.querySelector<HTMLInputElement>("#settings-autosave-delay");
  const recentFilesInput = container.querySelector<HTMLInputElement>("#settings-recent-max");

  expect(drawerPanel.getAttribute("role")).toBe("dialog");
  expect(drawerPanel.getAttribute("aria-modal")).toBe("true");
  expect(drawerPanel.textContent).toContain("偏好设置");
  expect(closeButton).not.toBeNull();
  expect(navigation?.getAttribute("aria-label")).toBe("设置分类");
  expect(getSettingsNavigationButton("外观").getAttribute("aria-expanded")).toBe("true");
  expect(getSettingsNavigationButton("文件").getAttribute("aria-expanded")).toBe("true");
  expect(getSettingsNavigationButton("主题").getAttribute("aria-current")).toBe("page");
  expect(activeSection?.textContent).toContain("主题");
  expect(themeSelect).not.toBeNull();
  expect(themeSelect?.className).toContain("settings-select");
  expect(uiFontSelect).toBeNull();
  expect(autosaveInput).toBeNull();
  expect(recentFilesInput).toBeNull();
});
```

- [ ] **Step 3: Add tests for the other three existing sections**

Add these tests after the default-section test:

```ts
it("switches settings to typography without changing preference patch semantics", async () => {
  const driver = await renderEditorApp();
  await driver.openSettings();

  await clickSettingsNavigationButton("排版");

  const activeSection = container.querySelector<HTMLElement>('[data-fishmark-settings-section="typography"]');
  const themeSelect = container.querySelector<HTMLSelectElement>("#settings-theme-package");
  const uiFontSelect = container.querySelector<HTMLSelectElement>("#settings-ui-font-preset");
  const documentFontSelect = container.querySelector<HTMLSelectElement>("#settings-document-font-preset");
  const documentCjkFontSelect = container.querySelector<HTMLSelectElement>("#settings-document-cjk-font-preset");

  expect(getSettingsNavigationButton("排版").getAttribute("aria-current")).toBe("page");
  expect(activeSection?.textContent).toContain("排版");
  expect(themeSelect).toBeNull();
  expect(uiFontSelect).not.toBeNull();
  expect(documentFontSelect).not.toBeNull();
  expect(documentCjkFontSelect).not.toBeNull();

  await act(async () => {
    if (uiFontSelect) {
      uiFontSelect.value = "Segoe UI";
      uiFontSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await Promise.resolve();
  });

  expect(window.fishmark.updatePreferences).toHaveBeenCalledWith({
    ui: { fontFamily: "Segoe UI" }
  });
});

it("switches settings to autosave under the file category", async () => {
  const driver = await renderEditorApp();
  await driver.openSettings();

  await clickSettingsNavigationButton("自动保存");

  const activeSection = container.querySelector<HTMLElement>('[data-fishmark-settings-section="autosave"]');
  const autosaveInput = container.querySelector<HTMLInputElement>("#settings-autosave-delay");
  const themeSelect = container.querySelector<HTMLSelectElement>("#settings-theme-package");
  const uiFontSelect = container.querySelector<HTMLSelectElement>("#settings-ui-font-preset");

  expect(getSettingsNavigationButton("自动保存").getAttribute("aria-current")).toBe("page");
  expect(activeSection?.textContent).toContain("自动保存");
  expect(autosaveInput).not.toBeNull();
  expect(themeSelect).toBeNull();
  expect(uiFontSelect).toBeNull();
});

it("switches settings to recent files while keeping the existing disabled pending control", async () => {
  const driver = await renderEditorApp();
  await driver.openSettings();

  await clickSettingsNavigationButton("最近文件");

  const activeSection = container.querySelector<HTMLElement>('[data-fishmark-settings-section="recent-files"]');
  const recentFilesInput = container.querySelector<HTMLInputElement>("#settings-recent-max");
  const themeSelect = container.querySelector<HTMLSelectElement>("#settings-theme-package");

  expect(getSettingsNavigationButton("最近文件").getAttribute("aria-current")).toBe("page");
  expect(activeSection?.textContent).toContain("最近文件");
  expect(recentFilesInput?.disabled).toBe(true);
  expect(activeSection?.textContent).toContain("将在 TASK-006 接入后开放");
  expect(themeSelect).toBeNull();
});
```

- [ ] **Step 4: Add a parent expand/collapse test**

Add this test after the section switching tests:

```ts
it("lets parent settings categories expand and collapse without hiding the active branch", async () => {
  const driver = await renderEditorApp();
  await driver.openSettings();

  await clickSettingsNavigationButton("文件");

  expect(getSettingsNavigationButton("文件").getAttribute("aria-expanded")).toBe("false");
  expect(getSettingsNavigationButton("外观").getAttribute("aria-expanded")).toBe("true");
  expect(getSettingsNavigationButton("主题").getAttribute("aria-current")).toBe("page");

  await clickSettingsNavigationButton("文件");
  await clickSettingsNavigationButton("自动保存");

  expect(getSettingsNavigationButton("文件").getAttribute("aria-expanded")).toBe("true");
  expect(getSettingsNavigationButton("自动保存").getAttribute("aria-current")).toBe("page");

  await clickSettingsNavigationButton("文件");

  expect(getSettingsNavigationButton("文件").getAttribute("aria-expanded")).toBe("true");
  expect(getSettingsNavigationButton("自动保存").getAttribute("aria-current")).toBe("page");
  expect(container.querySelector<HTMLElement>('[data-fishmark-settings-section="autosave"]')).not.toBeNull();
});
```

- [ ] **Step 5: Run the focused tests and verify they fail for the expected reason**

Run:

```bash
npm run test -- src/renderer/app.autosave.test.ts -t "settings"
```

Expected: FAIL. The first new failure should mention missing `[data-fishmark-region="settings-navigation"]` or missing navigation buttons, because the implementation does not exist yet.

## Task 2: Implement Renderer Navigation State And Section Rendering

**Files:**
- Modify: `src/renderer/editor/settings-view.tsx`
- Test: `src/renderer/app.autosave.test.ts`

- [ ] **Step 1: Add section and category types after `FontOption`**

Insert this code after the `type FontOption` definition:

```ts
type SettingsSectionId = "theme" | "typography" | "autosave" | "recent-files";
type SettingsCategoryId = "appearance" | "file";

type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  iconLabel: string;
  children: Array<{
    id: SettingsSectionId;
    label: string;
  }>;
};

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "appearance",
    label: "外观",
    iconLabel: "A",
    children: [
      { id: "theme", label: "主题" },
      { id: "typography", label: "排版" }
    ]
  },
  {
    id: "file",
    label: "文件",
    iconLabel: "F",
    children: [
      { id: "autosave", label: "自动保存" },
      { id: "recent-files", label: "最近文件" }
    ]
  }
];

const DEFAULT_EXPANDED_SETTINGS_CATEGORIES: SettingsCategoryId[] = ["appearance", "file"];
const DEFAULT_SETTINGS_SECTION_ID: SettingsSectionId = "theme";
```

- [ ] **Step 2: Add helper functions after `buildFontOptions`**

Insert:

```ts
function findCategoryForSection(sectionId: SettingsSectionId): SettingsCategoryId {
  const category = SETTINGS_CATEGORIES.find((candidate) =>
    candidate.children.some((child) => child.id === sectionId)
  );

  return category?.id ?? "appearance";
}

function toggleCategory(
  categoryId: SettingsCategoryId,
  activeSectionId: SettingsSectionId,
  currentExpandedCategoryIds: SettingsCategoryId[]
): SettingsCategoryId[] {
  const activeCategoryId = findCategoryForSection(activeSectionId);
  if (categoryId === activeCategoryId) {
    return currentExpandedCategoryIds.includes(categoryId)
      ? currentExpandedCategoryIds
      : [...currentExpandedCategoryIds, categoryId];
  }

  return currentExpandedCategoryIds.includes(categoryId)
    ? currentExpandedCategoryIds.filter((id) => id !== categoryId)
    : [...currentExpandedCategoryIds, categoryId];
}
```

- [ ] **Step 3: Add local layout components before `ThemeFolderIcon`**

Insert:

```tsx
function SettingsGroup({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-group">
      <header className="settings-group-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

function SettingsRow({
  label,
  hint,
  htmlFor,
  children
}: {
  label: string;
  hint: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const labelContent = (
    <>
      <span>{label}</span>
      <span className="settings-hint">{hint}</span>
    </>
  );

  return (
    <div className="settings-row">
      {htmlFor ? (
        <label className="settings-label" htmlFor={htmlFor}>
          {labelContent}
        </label>
      ) : (
        <div className="settings-label">{labelContent}</div>
      )}
      {children}
    </div>
  );
}

function SettingsNavigation({
  activeSectionId,
  expandedCategoryIds,
  onToggleCategory,
  onSelectSection
}: {
  activeSectionId: SettingsSectionId;
  expandedCategoryIds: SettingsCategoryId[];
  onToggleCategory: (categoryId: SettingsCategoryId) => void;
  onSelectSection: (sectionId: SettingsSectionId) => void;
}) {
  return (
    <nav className="settings-navigation" data-fishmark-region="settings-navigation" aria-label="设置分类">
      {SETTINGS_CATEGORIES.map((category) => {
        const isExpanded = expandedCategoryIds.includes(category.id);
        const isActiveCategory = category.children.some((child) => child.id === activeSectionId);

        return (
          <div className="settings-navigation-group" key={category.id}>
            <button
              type="button"
              className={`settings-navigation-parent ${isActiveCategory ? "is-active" : ""}`}
              aria-expanded={isExpanded}
              onClick={() => onToggleCategory(category.id)}
            >
              <span className="settings-navigation-chevron" aria-hidden="true">
                {isExpanded ? "⌄" : "›"}
              </span>
              <span className="settings-navigation-icon" aria-hidden="true">
                {category.iconLabel}
              </span>
              <span>{category.label}</span>
            </button>
            {isExpanded ? (
              <div className="settings-navigation-children">
                {category.children.map((child) => {
                  const isActive = child.id === activeSectionId;

                  return (
                    <button
                      type="button"
                      className={`settings-navigation-child ${isActive ? "is-active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      key={child.id}
                      onClick={() => onSelectSection(child.id)}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Import the React type used by the new components**

Change the import at the top of `settings-view.tsx` from:

```ts
import { useEffect, useMemo, useState } from "react";
```

to:

```ts
import { useEffect, useMemo, useState, type ReactNode } from "react";
```

Then replace each `React.ReactNode` in the new component prop types with `ReactNode`.

- [ ] **Step 5: Add navigation state inside `SettingsView`**

Inside `SettingsView`, after the existing `useState` calls, add:

```ts
const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION_ID);
const [expandedCategoryIds, setExpandedCategoryIds] = useState<SettingsCategoryId[]>(
  DEFAULT_EXPANDED_SETTINGS_CATEGORIES
);
```

Add these handlers after `applyPatch`:

```ts
function handleToggleCategory(categoryId: SettingsCategoryId): void {
  setExpandedCategoryIds((current) => toggleCategory(categoryId, activeSectionId, current));
}

function handleSelectSection(sectionId: SettingsSectionId): void {
  const categoryId = findCategoryForSection(sectionId);
  setExpandedCategoryIds((current) =>
    current.includes(categoryId) ? current : [...current, categoryId]
  );
  setActiveSectionId(sectionId);
}
```

- [ ] **Step 6: Replace the existing `<div className="settings-groups">` body with a nested layout**

Replace the current content from `<div className="settings-groups">` through its closing `</div>` immediately before `<footer className="settings-footer">` with:

```tsx
<div className="settings-body">
  <SettingsNavigation
    activeSectionId={activeSectionId}
    expandedCategoryIds={expandedCategoryIds}
    onToggleCategory={handleToggleCategory}
    onSelectSection={handleSelectSection}
  />
  <div className="settings-content">
    {activeSectionId === "theme" ? (
      <div className="settings-groups" data-fishmark-settings-section="theme">
        {renderThemeSection()}
      </div>
    ) : null}
    {activeSectionId === "typography" ? (
      <div className="settings-groups" data-fishmark-settings-section="typography">
        {renderTypographySection()}
      </div>
    ) : null}
    {activeSectionId === "autosave" ? (
      <div className="settings-groups" data-fishmark-settings-section="autosave">
        {renderAutosaveSection()}
      </div>
    ) : null}
    {activeSectionId === "recent-files" ? (
      <div className="settings-groups" data-fishmark-settings-section="recent-files">
        {renderRecentFilesSection()}
      </div>
    ) : null}
  </div>
</div>
```

- [ ] **Step 7: Extract render functions before the component `return`**

Move the current section JSX into four local functions inside `SettingsView`, just before `return (`. Preserve every current control id, label text, value expression, event handler, disabled state, and button handler.

Use this section map:

```ts
const settingsSectionMap: Record<SettingsSectionId, string[]> = {
  theme: [
    "settings-theme-mode",
    "settings-theme-package",
    "settings-theme-effects",
    "settings-theme-parameter-${activeThemePackage.id}-${parameter.id}"
  ],
  typography: [
    "settings-ui-font-preset",
    "settings-ui-font-size",
    "settings-document-font-size",
    "settings-document-font-preset",
    "settings-document-cjk-font-preset"
  ],
  autosave: ["settings-autosave-delay"],
  "recent-files": ["settings-recent-max"]
};
```

Create four local render functions named `renderThemeSection`, `renderTypographySection`, `renderAutosaveSection`, and `renderRecentFilesSection`. Each function returns the JSX for one section and uses the ids listed in `settingsSectionMap`.

For the remaining functions, use the same `SettingsGroup` and `SettingsRow` wrappers and place these controls by id:

```ts
renderTypographySection: [
  "settings-ui-font-preset",
  "settings-ui-font-size",
  "settings-document-font-size",
  "settings-document-font-preset",
  "settings-document-cjk-font-preset"
];

renderAutosaveSection: ["settings-autosave-delay"];

renderRecentFilesSection: ["settings-recent-max"];
```

- [ ] **Step 8: Run the focused tests and verify navigation behavior**

Run:

```bash
npm run test -- src/renderer/app.autosave.test.ts -t "settings"
```

Expected: PASS for the new settings navigation tests, or FAIL only on CSS-specific assertions that Task 3 updates.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/renderer/editor/settings-view.tsx src/renderer/app.autosave.test.ts
git commit -m "feat(renderer): add nested settings navigation"
```

## Task 3: Update Settings Drawer Layout CSS

**Files:**
- Modify: `src/renderer/styles/settings.css`
- Modify: `src/renderer/app.autosave.test.ts`
- Test: `src/renderer/app.autosave.test.ts`

- [ ] **Step 1: Add CSS assertions for the nested drawer layout**

Add this test near the existing `"styles preferences as a semi-transparent glass drawer"` test:

```ts
it("styles preferences as a nested navigation drawer with stable chrome", () => {
  const settingsStylesheet = readFileSync(settingsStylesheetPath, "utf-8").replace(/\r\n/g, "\n");

  expect(settingsStylesheet).toContain("grid-template-rows: auto minmax(0, 1fr) auto;");
  expect(settingsStylesheet).toContain(".settings-body");
  expect(settingsStylesheet).toContain("grid-template-columns: 184px minmax(0, 1fr);");
  expect(settingsStylesheet).toContain(".settings-navigation");
  expect(settingsStylesheet).toContain(".settings-navigation-parent");
  expect(settingsStylesheet).toContain(".settings-navigation-child");
  expect(settingsStylesheet).toContain(".settings-navigation-child.is-active");
  expect(settingsStylesheet).toContain(".settings-content");
  expect(settingsStylesheet).toContain("overflow-y: auto;");
  expect(settingsStylesheet).toContain("@media (max-width: 860px)");
});
```

- [ ] **Step 2: Run the CSS assertion and verify it fails**

Run:

```bash
npm run test -- src/renderer/app.autosave.test.ts -t "nested navigation drawer"
```

Expected: FAIL because the new CSS selectors and grid layout are not present yet.

- [ ] **Step 3: Update `.settings-shell` to grid chrome**

In `src/renderer/styles/settings.css`, update `.settings-shell` so it keeps the existing position, border, radius, background, shadow, blur, and animations, and changes layout-related properties to:

```css
.settings-shell {
  position: fixed;
  top: var(--fishmark-shell-edge);
  bottom: var(--fishmark-shell-edge);
  left: calc(var(--fishmark-shell-rail-width) + var(--fishmark-shell-edge));
  width: min(760px, calc(100vw - var(--fishmark-shell-rail-width) - (var(--fishmark-shell-edge) * 3)));
  z-index: 31;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  margin: 0;
  padding: 0;
  border: 1px solid var(--fishmark-panel-border, rgba(15, 23, 42, 0.12));
  border-radius: var(--fishmark-radius-2xl);
  background: var(--fishmark-panel-bg, rgba(255, 255, 255, 0.92));
  color: var(--fishmark-text-secondary, #31353d);
  box-shadow: var(--fishmark-panel-shadow, var(--fishmark-shadow-3));
  backdrop-filter: blur(28px) saturate(1.12);
  -webkit-backdrop-filter: blur(28px) saturate(1.12);
  overflow: hidden;
  isolation: isolate;
}
```

- [ ] **Step 4: Update header and footer spacing for grid shell**

Replace the negative-margin sticky header rules with:

```css
.settings-header {
  display: flex;
  align-items: center;
  gap: var(--fishmark-space-4);
  padding: var(--fishmark-space-5) var(--fishmark-space-5) var(--fishmark-space-4);
  background: color-mix(
    in srgb,
    var(--fishmark-panel-bg, rgba(255, 255, 255, 0.92)) 92%,
    var(--fishmark-control-bg, rgba(255, 255, 255, 0.9)) 8%
  );
  border-bottom: 1px solid var(--fishmark-panel-border, rgba(15, 23, 42, 0.12));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 2;
}

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--fishmark-space-4);
  padding: var(--fishmark-space-4) var(--fishmark-space-5);
  border-top: 1px solid var(--fishmark-panel-border, rgba(15, 23, 42, 0.12));
}
```

- [ ] **Step 5: Add body, navigation, and content styles**

Add these rules after `.settings-error`:

```css
.settings-body {
  min-height: 0;
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr);
}

.settings-navigation {
  min-height: 0;
  padding: var(--fishmark-space-4) var(--fishmark-space-3);
  border-right: 1px solid color-mix(in srgb, var(--fishmark-panel-border, rgba(15, 23, 42, 0.12)) 72%, transparent);
  background: color-mix(in srgb, var(--fishmark-control-bg, rgba(255, 255, 255, 0.9)) 34%, transparent);
  overflow-y: auto;
}

.settings-navigation-group {
  display: grid;
  gap: var(--fishmark-space-1);
}

.settings-navigation-group + .settings-navigation-group {
  margin-top: var(--fishmark-space-2);
}

.settings-navigation-parent,
.settings-navigation-child {
  border: 0;
  color: var(--fishmark-text-secondary, #31353d);
  background: transparent;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.settings-navigation-parent {
  min-height: 36px;
  display: grid;
  grid-template-columns: 16px 24px minmax(0, 1fr);
  align-items: center;
  gap: var(--fishmark-space-2);
  width: 100%;
  padding: 0 var(--fishmark-space-2);
  border-radius: var(--fishmark-radius-lg);
}

.settings-navigation-parent:hover,
.settings-navigation-child:hover,
.settings-navigation-parent:focus-visible,
.settings-navigation-child:focus-visible {
  color: var(--fishmark-text-primary, #171a1f);
  background: var(--fishmark-control-bg-hover, rgba(255, 255, 255, 0.96));
}

.settings-navigation-parent:focus-visible,
.settings-navigation-child:focus-visible {
  outline: 2px solid var(--fishmark-focus-ring, #5da7ff);
  outline-offset: 2px;
}

.settings-navigation-parent.is-active {
  color: var(--fishmark-text-primary, #171a1f);
}

.settings-navigation-chevron {
  color: var(--fishmark-text-muted, #687180);
  font-size: 0.82rem;
}

.settings-navigation-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: var(--fishmark-radius-md);
  color: var(--fishmark-text-secondary, #31353d);
  background: color-mix(in srgb, var(--fishmark-control-bg, rgba(255, 255, 255, 0.9)) 78%, transparent);
  font-size: 0.72rem;
  font-weight: 650;
}

.settings-navigation-children {
  display: grid;
  gap: 2px;
  margin: 2px 0 var(--fishmark-space-2) 40px;
  padding-left: var(--fishmark-space-2);
  border-left: 1px solid color-mix(in srgb, var(--fishmark-panel-border, rgba(15, 23, 42, 0.12)) 72%, transparent);
}

.settings-navigation-child {
  min-height: 32px;
  width: 100%;
  padding: 0 var(--fishmark-space-2);
  border-radius: var(--fishmark-radius-md);
  font-size: 0.9rem;
}

.settings-navigation-child.is-active {
  color: var(--fishmark-text-primary, #171a1f);
  background: color-mix(in srgb, var(--fishmark-focus-ring, #5da7ff) 16%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fishmark-focus-ring, #5da7ff) 22%, transparent);
}

.settings-content {
  min-width: 0;
  min-height: 0;
  padding: var(--fishmark-space-5);
  overflow-y: auto;
}
```

- [ ] **Step 6: Adjust `.settings-error` and `.settings-groups` for the new body**

Update `.settings-error`:

```css
.settings-error {
  margin: var(--fishmark-space-4) var(--fishmark-space-5) 0;
}
```

Keep `.settings-groups` as:

```css
.settings-groups {
  display: grid;
  gap: var(--fishmark-space-6);
}
```

- [ ] **Step 7: Update responsive rules**

Inside `@media (max-width: 860px)`, use:

```css
@media (max-width: 860px) {
  .settings-shell {
    left: calc(var(--fishmark-shell-rail-width) + 10px);
    width: min(620px, calc(100vw - var(--fishmark-shell-rail-width) - 22px));
  }

  .settings-header,
  .settings-content,
  .settings-footer {
    padding-inline: var(--fishmark-space-4);
  }

  .settings-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .settings-navigation {
    display: flex;
    gap: var(--fishmark-space-2);
    padding: var(--fishmark-space-3) var(--fishmark-space-4);
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--fishmark-panel-border, rgba(15, 23, 42, 0.12)) 72%, transparent);
    overflow-x: auto;
    overflow-y: hidden;
  }

  .settings-navigation-group {
    min-width: max-content;
  }

  .settings-navigation-children {
    margin-left: 0;
  }

  .settings-row {
    grid-template-columns: 1fr;
  }

  .settings-radio-group,
  .settings-input-narrow {
    justify-self: stretch;
    width: 100%;
  }

  .settings-inline-note {
    grid-column: auto;
    justify-self: stretch;
    margin-top: -6px;
  }

  .settings-inline-actions {
    justify-items: stretch;
  }
}
```

Keep the existing `@media (max-width: 640px)` block, but remove any rules that assume negative header margins.

- [ ] **Step 8: Run CSS and focused settings tests**

Run:

```bash
npm run test -- src/renderer/app.autosave.test.ts -t "settings|nested navigation drawer|semi-transparent glass drawer"
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/renderer/styles/settings.css src/renderer/app.autosave.test.ts
git commit -m "style(renderer): lay out nested settings drawer"
```

## Task 4: Regression Pass And Documentation Touch-Up

**Files:**
- Modify: `docs/design.md`
- Test: `src/renderer/app.autosave.test.ts`

- [ ] **Step 1: Update the shell baseline documentation**

In `docs/design.md`, under `## 10. 编辑器壳层基线`, update the settings drawer bullet from:

```md
- 设置页改为偏离屏幕边缘的悬浮抽屉，通过遮罩覆盖当前工作区，而不是把页面硬挤开
```

to:

```md
- 设置页是偏离屏幕边缘的悬浮抽屉，通过遮罩覆盖当前工作区，而不是把页面硬挤开；抽屉内部使用可展开分类导航承载现有偏好设置
```

- [ ] **Step 2: Run focused renderer settings tests**

Run:

```bash
npm run test -- src/renderer/app.autosave.test.ts -t "settings|preferences|recent-files|font preset|theme effects"
```

Expected: PASS.

- [ ] **Step 3: Run full renderer app test file**

Run:

```bash
npm run test -- src/renderer/app.autosave.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run project quality gates**

Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit Task 4**

```bash
git add docs/design.md src/renderer/app.autosave.test.ts
git commit -m "docs: record nested preferences drawer"
```

## Self-Review Checklist

- Spec coverage:
  - Existing settings are mapped to `外观 / 主题`, `外观 / 排版`, `文件 / 自动保存`, and `文件 / 最近文件`.
  - Navigation state is renderer-only and not persisted.
  - No shared preferences, preload, main process, or schema changes are included.
  - Error handling remains inside existing update and theme-directory flows.
  - Accessibility requirements are covered through `nav`, `aria-expanded`, and `aria-current`.
  - Responsive behavior is covered in `settings.css`.
  - Tests cover default section, section switching, parent expand/collapse, patch shape, and disabled recent files.
- Placeholder scan:
  - The plan contains no placeholder markers or unspecified future work.
  - Every command has an expected outcome.
- Type consistency:
  - Section ids are consistently `theme`, `typography`, `autosave`, and `recent-files`.
  - Category ids are consistently `appearance` and `file`.
  - New component names are consistently `SettingsNavigation`, `SettingsGroup`, and `SettingsRow`.
