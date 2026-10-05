import type { SettingsCategory, SettingsCategoryId, SettingsSectionId } from "./settings-navigation-model";
type SettingsNavigationProps = {
  categories: SettingsCategory[];
  activeSectionId: SettingsSectionId;
  expandedCategoryIds: SettingsCategoryId[];
  onToggleCategory: (categoryId: SettingsCategoryId) => void;
  onSelectSection: (sectionId: SettingsSectionId) => void;
};

export function SettingsNavigation({
  categories,
  activeSectionId,
  expandedCategoryIds,
  onToggleCategory,
  onSelectSection
}: SettingsNavigationProps) {
  return (
    <nav
      className="settings-navigation"
      data-fishmark-region="settings-navigation"
      aria-label="设置分类"
    >
      {categories.map((category) => {
        const isExpanded = expandedCategoryIds.includes(category.id);
        const isActiveCategory = category.children.some((child) => child.id === activeSectionId);
        const childrenId = `settings-navigation-${category.id}-children`;

        return (
          <div
            key={category.id}
            className="settings-navigation-group"
          >
            <button
              type="button"
              className={`settings-navigation-parent ${isActiveCategory ? "is-active" : ""}`}
              aria-expanded={isExpanded}
              aria-controls={childrenId}
              onClick={() => onToggleCategory(category.id)}
            >
              <span
                className="settings-navigation-chevron"
                aria-hidden="true"
              >
                {isExpanded ? "⌄" : "›"}
              </span>
              <span
                className="settings-navigation-icon"
                aria-hidden="true"
              >
                {category.iconLabel}
              </span>
              <span>{category.label}</span>
            </button>
            {isExpanded ? (
              <div
                id={childrenId}
                className="settings-navigation-children"
              >
                {category.children.map((child) => {
                  const isActive = child.id === activeSectionId;

                  return (
                    <button
                      key={child.id}
                      type="button"
                      className={`settings-navigation-child ${isActive ? "is-active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
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
