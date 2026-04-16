import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ThemePart = "tokens" | "ui" | "editor" | "markdown";

export type ThemeDescriptor = {
  id: string;
  source: "builtin" | "community";
  name: string;
  directoryName: string;
  availableParts: Record<ThemePart, boolean>;
  partUrls: Partial<Record<ThemePart, string>>;
};

type ThemeServiceDependencies = {
  readdir: (targetPath: string, options: { withFileTypes: true }) => Promise<
    import("node:fs").Dirent[]
  >;
};

export type CreateThemeServiceInput = {
  builtinThemesDir: string;
  userDataDir: string;
  dependencies?: ThemeServiceDependencies;
};

type ThemePartState = {
  tokens: boolean;
  ui: boolean;
  editor: boolean;
  markdown: boolean;
};

type ThemeService = {
  listThemes: () => Promise<ThemeDescriptor[]>;
  refreshThemes: () => Promise<ThemeDescriptor[]>;
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

function makeThemeName(directoryName: string): string {
  return directoryName
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(" ");
}

function createThemeDescriptor(source: ThemeDescriptor["source"], directoryName: string): ThemeDescriptor {
  return {
    id: directoryName,
    source,
    name: makeThemeName(directoryName),
    directoryName,
    availableParts: {
      tokens: false,
      ui: false,
      editor: false,
      markdown: false
    },
    partUrls: {}
  };
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
  themeDirectory: string,
  dependencies: ThemeServiceDependencies
): Promise<ThemePartState> {
  let entries: import("node:fs").Dirent[];

  try {
    entries = await dependencies.readdir(themeDirectory, { withFileTypes: true });
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return {
        tokens: false,
        ui: false,
        editor: false,
        markdown: false
      };
    }

    return {
      tokens: false,
      ui: false,
      editor: false,
      markdown: false
    };
  }

  const files = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  );

  return {
    tokens: files.has(DEFAULT_THEME_PARTS.tokens),
    ui: files.has(DEFAULT_THEME_PARTS.ui),
    editor: files.has(DEFAULT_THEME_PARTS.editor),
    markdown: files.has(DEFAULT_THEME_PARTS.markdown)
  };
}

function shouldIncludeTheme(availableParts: ThemePartState): boolean {
  return Object.values(availableParts).some(Boolean);
}

function resolvePartUrls(
  themeDirectory: string,
  availableParts: ThemePartState
): Partial<Record<ThemePart, string>> {
  const partUrls: Partial<Record<ThemePart, string>> = {};

  for (const part of Object.keys(DEFAULT_THEME_PARTS) as ThemePart[]) {
    if (!availableParts[part]) {
      continue;
    }

    partUrls[part] = pathToFileURL(path.join(themeDirectory, DEFAULT_THEME_PARTS[part])).href;
  }

  return partUrls;
}

function resolveThemesInDirectory(
  source: ThemeDescriptor["source"],
  themesDirectory: string,
  dependencies: ThemeServiceDependencies
) {
  return async (): Promise<ThemeDescriptor[]> => {
    let entries: import("node:fs").Dirent[];

    try {
      entries = await dependencies.readdir(themesDirectory, { withFileTypes: true });
    } catch {
      return [];
    }

    const themeDirectoryEntries = entries.filter(isThemeDirEntry);
    const descriptors: ThemeDescriptor[] = [];

    for (const entry of themeDirectoryEntries) {
      const themeDirectory = path.join(themesDirectory, entry.name);
      const availableParts = await resolveAvailableParts(
        themeDirectory,
        dependencies
      );
      if (!shouldIncludeTheme(availableParts)) {
        continue;
      }

      descriptors.push({
        ...createThemeDescriptor(source, entry.name),
        availableParts,
        partUrls: resolvePartUrls(themeDirectory, availableParts)
      });
    }

    return descriptors.sort((a, b) => a.directoryName.localeCompare(b.directoryName));
  };
}

export function createThemeService(input: CreateThemeServiceInput): ThemeService {
  const dependencies = input.dependencies ?? defaultDependencies;
  const communityThemesDir = path.join(input.userDataDir, "themes");
  const builtinThemesDir = input.builtinThemesDir;

  let themes: ThemeDescriptor[] = [];
  let cached = false;

  async function scanThemes(): Promise<ThemeDescriptor[]> {
    const [builtinThemes, communityThemes] = await Promise.all([
      resolveThemesInDirectory("builtin", builtinThemesDir, dependencies)(),
      resolveThemesInDirectory("community", communityThemesDir, dependencies)()
    ]);

    return [...builtinThemes, ...communityThemes];
  }

  async function listThemes(): Promise<ThemeDescriptor[]> {
    if (!cached) {
      themes = await scanThemes();
      cached = true;
    }

    return [...themes];
  }

  async function refreshThemes(): Promise<ThemeDescriptor[]> {
    themes = await scanThemes();
    cached = true;

    return [...themes];
  }

  return {
    listThemes,
    refreshThemes
  };
}
