type ThemeCatalogEntry = Awaited<ReturnType<Window["yulora"]["listThemes"]>>[number];

const LEGACY_THEME_PACKAGE_SUFFIX = /(?:-|_)(light|dark)$/u;

function resolveLegacyThemeFamilyId(themeId: string): string | null {
  const migrated = themeId.replace(LEGACY_THEME_PACKAGE_SUFFIX, "");
  return migrated === themeId ? null : migrated;
}

export function resolveThemeCatalogEntry(
  catalog: ThemeCatalogEntry[],
  requestedId: string | null
): ThemeCatalogEntry | null {
  if (!requestedId) {
    return null;
  }

  const exactMatch = catalog.find((theme) => theme.id === requestedId);
  if (exactMatch) {
    return exactMatch;
  }

  const legacyFamilyId = resolveLegacyThemeFamilyId(requestedId);
  if (!legacyFamilyId) {
    return null;
  }

  return catalog.find((theme) => theme.id === legacyFamilyId) ?? null;
}

export function resolveThemeSelectionValue(
  catalog: ThemeCatalogEntry[],
  requestedId: string | null
): string | null {
  return resolveThemeCatalogEntry(catalog, requestedId)?.id ?? requestedId;
}
