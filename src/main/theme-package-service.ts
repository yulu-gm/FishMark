import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeThemePackageManifest, type ThemePackageManifest } from "../shared/theme-package";

type ThemePackageKind = "manifest-package" | "legacy-css-family";
type LegacyThemeMode = "light" | "dark";
type LegacyThemeModeAssets = {
  tokens?: string;
  ui?: string;
  editor?: string;
  markdown?: string;
};

export type ThemePackageDescriptor = {
  id: string;
  kind: ThemePackageKind;
  source: "builtin" | "community";
  packageRoot: string;
  manifest: ThemePackageManifest;
};

type ThemePackageServiceDependencies = {
  readdir: (targetPath: string, options: { withFileTypes: true }) => Promise<
    import("node:fs").Dirent[]
  >;
  readFile: (targetPath: string, options: { encoding: BufferEncoding }) => Promise<string>;
};

export type CreateThemePackageServiceInput = {
  userDataDir: string;
  dependencies?: Partial<ThemePackageServiceDependencies>;
};

type ThemePackageService = {
  listThemePackages: () => Promise<ThemePackageDescriptor[]>;
  refreshThemePackages: () => Promise<ThemePackageDescriptor[]>;
};

const defaultDependencies: ThemePackageServiceDependencies = {
  readdir: (targetPath, options) => readdir(targetPath, options),
  readFile: (targetPath, options) => readFile(targetPath, options)
};

function makeThemeName(directoryName: string): string {
  return directoryName
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1))
    .join(" ");
}

async function safeReadDir(
  targetPath: string,
  dependencies: ThemePackageServiceDependencies
): Promise<import("node:fs").Dirent[]> {
  try {
    return await dependencies.readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    return [];
  }
}

async function readManifestState(
  manifestPath: string,
  packageRoot: string,
  dependencies: ThemePackageServiceDependencies
): Promise<
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "valid"; manifest: ThemePackageManifest }
> {
  try {
    const rawManifest = await dependencies.readFile(manifestPath, { encoding: "utf8" });
    const parsed = JSON.parse(rawManifest);
    const manifest = normalizeThemePackageManifest(parsed, packageRoot);

    return manifest ? { kind: "valid", manifest } : { kind: "invalid" };
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "absent" };
    }

    return { kind: "invalid" };
  }
}

function createLegacyManifest(
  directoryName: string,
  modeAssets: Record<LegacyThemeMode, LegacyThemeModeAssets | null>
): ThemePackageManifest {
  const supports = {
    light: modeAssets.light !== null,
    dark: modeAssets.dark !== null
  };
  const tokens: Partial<Record<LegacyThemeMode, string>> = {};
  const styles: ThemePackageManifest["styles"] = {};

  for (const mode of ["light", "dark"] as const) {
    const assets = modeAssets[mode];

    if (!assets) {
      continue;
    }

    if (assets.tokens) {
      tokens[mode] = assets.tokens;
    }
  }

  for (const part of ["ui", "editor", "markdown"] as const) {
    const resolved = modeAssets.light?.[part] ?? modeAssets.dark?.[part];

    if (resolved) {
      styles[part] = resolved;
    }
  }

  return {
    id: directoryName,
    name: makeThemeName(directoryName),
    version: "1.0.0",
    author: null,
    supports,
    tokens,
    styles,
    layout: { titlebar: null },
    scene: null,
    surfaces: {}
  };
}

async function resolveLegacyModeAssets(
  modeDirectory: string,
  packageRoot: string,
  dependencies: ThemePackageServiceDependencies
): Promise<LegacyThemeModeAssets | null> {
  const modeEntries = await safeReadDir(modeDirectory, dependencies);
  const files = new Set(modeEntries.filter((entry) => entry.isFile()).map((entry) => entry.name));

  const assets: LegacyThemeModeAssets = {};

  if (files.has("tokens.css")) {
    assets.tokens = path.join(packageRoot, path.basename(modeDirectory), "tokens.css");
  }

  if (files.has("ui.css")) {
    assets.ui = path.join(packageRoot, path.basename(modeDirectory), "ui.css");
  }

  if (files.has("editor.css")) {
    assets.editor = path.join(packageRoot, path.basename(modeDirectory), "editor.css");
  }

  if (files.has("markdown.css")) {
    assets.markdown = path.join(packageRoot, path.basename(modeDirectory), "markdown.css");
  }

  return Object.keys(assets).length === 0 ? null : assets;
}

async function createLegacyCssFamilyDescriptor(
  packageRoot: string,
  directoryName: string,
  dependencies: ThemePackageServiceDependencies
): Promise<ThemePackageDescriptor | null> {
  const modeAssets: Record<LegacyThemeMode, LegacyThemeModeAssets | null> = {
    light: null,
    dark: null
  };

  for (const mode of ["light", "dark"] as const) {
    const modeDirectory = path.join(packageRoot, mode);
    const assets = await resolveLegacyModeAssets(modeDirectory, packageRoot, dependencies);

    modeAssets[mode] = assets;
  }

  if (modeAssets.light === null && modeAssets.dark === null) {
    return null;
  }

  return {
    id: directoryName,
    kind: "legacy-css-family",
    source: "community",
    packageRoot,
    manifest: createLegacyManifest(directoryName, modeAssets)
  };
}

async function scanThemePackages(
  userDataDir: string,
  dependencies: ThemePackageServiceDependencies
): Promise<ThemePackageDescriptor[]> {
  const themesDir = path.join(userDataDir, "themes");
  const entries = await safeReadDir(themesDir, dependencies);

  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const packageRoot = path.join(themesDir, entry.name);
        const manifestState = await readManifestState(
          path.join(packageRoot, "manifest.json"),
          packageRoot,
          dependencies
        );

        if (manifestState.kind === "valid") {
          return {
            id: manifestState.manifest.id,
            kind: "manifest-package" as const,
            source: "community" as const,
            packageRoot,
            manifest: manifestState.manifest
          };
        }

        if (manifestState.kind === "invalid") {
          return null;
        }

        return createLegacyCssFamilyDescriptor(packageRoot, entry.name, dependencies);
      })
  );

  return packages
    .filter((entry): entry is ThemePackageDescriptor => entry !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function createThemePackageService(input: CreateThemePackageServiceInput): ThemePackageService {
  const dependencies: ThemePackageServiceDependencies = {
    ...defaultDependencies,
    ...(input.dependencies ?? {})
  };

  let cache: ThemePackageDescriptor[] | null = null;

  return {
    async listThemePackages() {
      if (!cache) {
        cache = await scanThemePackages(input.userDataDir, dependencies);
      }

      return [...cache];
    },
    async refreshThemePackages() {
      cache = await scanThemePackages(input.userDataDir, dependencies);
      return [...cache];
    }
  };
}
