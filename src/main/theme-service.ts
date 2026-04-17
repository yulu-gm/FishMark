import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ThemePart = "tokens" | "ui" | "editor" | "markdown";
type ThemeAppearanceMode = "light" | "dark";

export type ThemeVariantDescriptor = {
  available: boolean;
  availableParts: Record<ThemePart, boolean>;
  partUrls: Partial<Record<ThemePart, string>>;
};

export type ThemeFamilyDescriptor = {
  id: string;
  source: "builtin" | "community";
  name: string;
  directoryName: string;
  modes: Record<ThemeAppearanceMode, ThemeVariantDescriptor>;
};

type ThemeServiceDependencies = {
  readdir: (targetPath: string, options: { withFileTypes: true }) => Promise<
    import("node:fs").Dirent[]
  >;
};

export type CreateThemeServiceInput = {
  userDataDir: string;
  dependencies?: ThemeServiceDependencies;
};

type ThemeService = {
  listThemes: () => Promise<ThemeFamilyDescriptor[]>;
  refreshThemes: () => Promise<ThemeFamilyDescriptor[]>;
};

const DEFAULT_THEME_PARTS = {
  tokens: "tokens.css",
  ui: "ui.css",
  editor: "editor.css",
  markdown: "markdown.css"
} as const;

const defaultDependencies: ThemeServiceDependencies = {
  readdir: (targetPath, options) => readdir(targetPath, options)
};

function createEmptyVariantDescriptor(): ThemeVariantDescriptor {
  return {
    available: false,
    availableParts: {
      tokens: false,
      ui: false,
      editor: false,
      markdown: false
    },
    partUrls: {}
  };
}

function makeThemeName(directoryName: string): string {
  return directoryName
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(" ");
}

function isNodeErrorWithCode(error: unknown, expectedCode: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as NodeJS.ErrnoException).code === "string" &&
    (error as NodeJS.ErrnoException).code === expectedCode
  );
}

function isThemeDirEntry(entry: import("node:fs").Dirent): boolean {
  return entry.isDirectory();
}

async function resolveAvailableParts(
  variantDirectory: string,
  dependencies: ThemeServiceDependencies
): Promise<Record<ThemePart, boolean>> {
  let entries: import("node:fs").Dirent[];

  try {
    entries = await dependencies.readdir(variantDirectory, { withFileTypes: true });
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return createEmptyVariantDescriptor().availableParts;
    }

    return createEmptyVariantDescriptor().availableParts;
  }

  const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));

  return {
    tokens: files.has(DEFAULT_THEME_PARTS.tokens),
    ui: files.has(DEFAULT_THEME_PARTS.ui),
    editor: files.has(DEFAULT_THEME_PARTS.editor),
    markdown: files.has(DEFAULT_THEME_PARTS.markdown)
  };
}

function hasAvailablePart(availableParts: Record<ThemePart, boolean>): boolean {
  return Object.values(availableParts).some(Boolean);
}

function resolvePartUrls(
  variantDirectory: string,
  availableParts: Record<ThemePart, boolean>
): Partial<Record<ThemePart, string>> {
  const partUrls: Partial<Record<ThemePart, string>> = {};

  for (const part of Object.keys(DEFAULT_THEME_PARTS) as ThemePart[]) {
    if (!availableParts[part]) {
      continue;
    }

    partUrls[part] = pathToFileURL(path.join(variantDirectory, DEFAULT_THEME_PARTS[part])).href;
  }

  return partUrls;
}

async function resolveVariantDescriptor(
  variantDirectory: string,
  dependencies: ThemeServiceDependencies
): Promise<ThemeVariantDescriptor> {
  const availableParts = await resolveAvailableParts(variantDirectory, dependencies);

  if (!hasAvailablePart(availableParts)) {
    return createEmptyVariantDescriptor();
  }

  return {
    available: true,
    availableParts,
    partUrls: resolvePartUrls(variantDirectory, availableParts)
  };
}

function shouldIncludeFamily(modes: Record<ThemeAppearanceMode, ThemeVariantDescriptor>): boolean {
  return modes.light.available || modes.dark.available;
}

function resolveThemesInDirectory(
  source: ThemeFamilyDescriptor["source"],
  themesDirectory: string,
  dependencies: ThemeServiceDependencies
) {
  return async (): Promise<ThemeFamilyDescriptor[]> => {
    let entries: import("node:fs").Dirent[];

    try {
      entries = await dependencies.readdir(themesDirectory, { withFileTypes: true });
    } catch {
      return [];
    }

    const familyDirectoryEntries = entries.filter(isThemeDirEntry);
    const descriptors: ThemeFamilyDescriptor[] = [];

    for (const entry of familyDirectoryEntries) {
      const familyDirectory = path.join(themesDirectory, entry.name);
      const modes = {
        light: await resolveVariantDescriptor(path.join(familyDirectory, "light"), dependencies),
        dark: await resolveVariantDescriptor(path.join(familyDirectory, "dark"), dependencies)
      };

      if (!shouldIncludeFamily(modes)) {
        continue;
      }

      descriptors.push({
        id: entry.name,
        source,
        name: makeThemeName(entry.name),
        directoryName: entry.name,
        modes
      });
    }

    return descriptors.sort((a, b) => a.directoryName.localeCompare(b.directoryName));
  };
}

export function createThemeService(input: CreateThemeServiceInput): ThemeService {
  const dependencies = input.dependencies ?? defaultDependencies;
  const communityThemesDir = path.join(input.userDataDir, "themes");

  let themes: ThemeFamilyDescriptor[] = [];
  let cached = false;

  async function scanThemes(): Promise<ThemeFamilyDescriptor[]> {
    return resolveThemesInDirectory("community", communityThemesDir, dependencies)();
  }

  async function listThemes(): Promise<ThemeFamilyDescriptor[]> {
    if (!cached) {
      themes = await scanThemes();
      cached = true;
    }

    return [...themes];
  }

  async function refreshThemes(): Promise<ThemeFamilyDescriptor[]> {
    themes = await scanThemes();
    cached = true;

    return [...themes];
  }

  return {
    listThemes,
    refreshThemes
  };
}
