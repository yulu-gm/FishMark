import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { normalizeThemePackageManifest, type ThemePackageManifest } from "../shared/theme-package";

export type ThemePackageDescriptor = {
  id: string;
  kind: "manifest-package";
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
  builtinPackagesDir?: string;
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

type ResolveBuiltinThemePackagesDirInput = {
  isPackaged?: boolean;
  moduleDir?: string;
};

export function resolveBuiltinThemePackagesDir(
  input: ResolveBuiltinThemePackagesDirInput = {}
): string {
  const moduleDir = input.moduleDir ?? __dirname;

  return input.isPackaged
    ? path.resolve(moduleDir, "../../dist/theme-packages")
    : path.resolve(moduleDir, "../../src/renderer/theme-packages");
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

async function scanThemePackagesInDirectory(
  themesDir: string,
  source: ThemePackageDescriptor["source"],
  dependencies: ThemePackageServiceDependencies
): Promise<ThemePackageDescriptor[]> {
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
            source,
            packageRoot,
            manifest: manifestState.manifest
          };
        }

        if (manifestState.kind === "invalid") {
          return null;
        }

        return null;
      })
  );

  return packages
    .filter((entry): entry is ThemePackageDescriptor => entry !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function scanThemePackages(
  builtinPackagesDir: string,
  userDataDir: string,
  dependencies: ThemePackageServiceDependencies
): Promise<ThemePackageDescriptor[]> {
  const [builtinPackages, communityPackages] = await Promise.all([
    scanThemePackagesInDirectory(builtinPackagesDir, "builtin", dependencies),
    scanThemePackagesInDirectory(path.join(userDataDir, "themes"), "community", dependencies)
  ]);

  const packageById = new Map<string, ThemePackageDescriptor>();

  for (const entry of builtinPackages) {
    packageById.set(entry.id, entry);
  }

  for (const entry of communityPackages) {
    if (packageById.has(entry.id)) {
      continue;
    }

    packageById.set(entry.id, entry);
  }

  return Array.from(packageById.values()).sort((left, right) => left.id.localeCompare(right.id));
}

export function createThemePackageService(input: CreateThemePackageServiceInput): ThemePackageService {
  const dependencies: ThemePackageServiceDependencies = {
    ...defaultDependencies,
    ...(input.dependencies ?? {})
  };
  const builtinPackagesDir = input.builtinPackagesDir ?? resolveBuiltinThemePackagesDir();

  let cache: ThemePackageDescriptor[] | null = null;

  return {
    async listThemePackages() {
      if (!cache) {
        cache = await scanThemePackages(builtinPackagesDir, input.userDataDir, dependencies);
      }

      return [...cache];
    },
    async refreshThemePackages() {
      cache = await scanThemePackages(builtinPackagesDir, input.userDataDir, dependencies);
      return [...cache];
    }
  };
}
