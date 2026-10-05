export type SettingsSectionId = "theme" | "typography" | "autosave" | "recent-files" | "images";
export type SettingsCategoryId = "appearance" | "file";

export type SettingsCategory = {
  id: SettingsCategoryId;
  label: string;
  iconLabel: string;
  children: Array<{
    id: SettingsSectionId;
    label: string;
  }>;
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
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
      { id: "recent-files", label: "最近文件" },
      { id: "images", label: "图片" }
    ]
  }
];

export function findCategoryForSection(sectionId: SettingsSectionId): SettingsCategoryId {
  const category = SETTINGS_CATEGORIES.find((candidate) =>
    candidate.children.some((child) => child.id === sectionId)
  );

  return category?.id ?? "appearance";
}

export function toggleCategory(
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
