import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { resolveRendererPayloadDirectory } from "./paths";
import { createFileIdentityResolver } from "./file-identity-resolver";
import { readPinnedFile } from "./pinned-file-read";
import { filePathIdentity } from "./file-path";

import {
  normalizeThemePackageManifest,
  type ThemePackageDescriptor,
  type ThemePackageManifest
} from "../shared/theme-package";

type ThemePackageServiceDependencies = {
  readdir: (targetPath: string, options: { withFileTypes: true }) => Promise<
    import("node:fs").Dirent[]
  >;
  readFile: (targetPath: string, options: { encoding: BufferEncoding }, beforeBody?: () => Promise<void>) => Promise<string>;
  realpath: (targetPath: string) => Promise<string>;
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
  readFile: async (targetPath, options, beforeBody = async () => {}) => {
    const pinned = await createFileIdentityResolver().resolveExisting(targetPath);
    if (filePathIdentity(pinned.canonicalPath, process.platform) !== filePathIdentity(targetPath, process.platform)) throw new Error("Manifest path changed.");
    const bytes = await readPinnedFile({ path: pinned.canonicalPath, physicalIdentity: pinned.identity.object,
      check: () => {}, beforeBody: async () => {
        await beforeBody();
        const current = await createFileIdentityResolver().resolveExisting(targetPath);
        if (current.identity.object !== pinned.identity.object || current.identity.location !== pinned.identity.location) throw new Error("Manifest object changed.");
      } });
    return bytes!.toString(options.encoding);
  },
  realpath
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
    ? path.join(resolveRendererPayloadDirectory({ isPackaged: true, appPath: path.resolve(moduleDir, "../.."), moduleDir }), "theme-packages")
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
    const canonical = await dependencies.realpath(manifestPath);
    const relative = path.relative(packageRoot, canonical);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return { kind: "invalid" };
    const rawManifest = await dependencies.readFile(canonical, { encoding: "utf8" }, async () => {
      if (await dependencies.realpath(packageRoot) !== packageRoot || await dependencies.realpath(manifestPath) !== canonical) throw new Error("Manifest root changed.");
    });
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
  let collectionRoot: string;
  try { collectionRoot = await dependencies.realpath(themesDir); } catch { return []; }

  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const packageRoot = path.join(themesDir, entry.name);
        let canonicalRoot: string;
        try { canonicalRoot = await dependencies.realpath(packageRoot); } catch { return null; }
        const relative = path.relative(collectionRoot, canonicalRoot);
        if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
        const manifestState = await readManifestState(
          path.join(packageRoot, "manifest.json"),
          canonicalRoot,
          dependencies
        );

        if (manifestState.kind === "valid") {
          return {
            id: manifestState.manifest.id,
            kind: "manifest-package" as const,
            source,
            packageRoot: canonicalRoot,
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
  let generation = 0;
  let loading: Promise<ThemePackageDescriptor[]> | null = null;
  function scan() {
    const revision = ++generation;
    const pending = scanThemePackages(builtinPackagesDir, input.userDataDir, dependencies).then((packages) => {
      if (revision === generation) cache = packages;
      return packages;
    });
    loading = pending;
    return pending;
  }

  return {
    async listThemePackages() {
      while (cache === null) await (loading ?? scan());

      return [...(cache ?? [])];
    },
    async refreshThemePackages() {
      cache = null;
      await scan();
      return this.listThemePackages();
    }
  };
}
