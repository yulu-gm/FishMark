type ThemeCatalogEntry = Awaited<ReturnType<Window["yulora"]["listThemePackages"]>>[number];

export function resolveThemeCatalogEntry(
  catalog: ThemeCatalogEntry[],
  requestedId: string | null
): ThemeCatalogEntry | null {
  if (!requestedId) {
    return null;
  }

  return catalog.find((themePackage) => themePackage.id === requestedId) ?? null;
}

export function resolveThemeSelectionValue(
  catalog: ThemeCatalogEntry[],
  requestedId: string | null
): string | null {
  return resolveThemeCatalogEntry(catalog, requestedId)?.id ?? requestedId;
}
