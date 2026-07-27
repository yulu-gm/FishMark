import {
  realpath as defaultRealpath,
  stat as defaultStat
} from "node:fs/promises";
import path from "node:path";

import {
  fileIdentity,
  type FileIdentity,
  type FileLocationIdentity,
  type FileObjectIdentity
} from "@fishmark/workspace-domain";

interface ResolvedFileLocation {
  readonly canonicalPath: string;
  readonly pathKey: FileLocationIdentity;
}

export interface ResolvedExistingFileIdentity extends ResolvedFileLocation {
  readonly exists: true;
  readonly identity: FileIdentity;
  readonly physicalKey: FileObjectIdentity;
}

export interface ResolvedProspectiveFileIdentity extends ResolvedFileLocation {
  readonly exists: false;
  readonly identity: null;
  readonly physicalKey: null;
}

export type ResolvedFileIdentity =
  | ResolvedExistingFileIdentity
  | ResolvedProspectiveFileIdentity;

export interface FileIdentityResolver {
  resolveExisting(targetPath: string): Promise<ResolvedExistingFileIdentity>;
  resolveProspective(targetPath: string): Promise<ResolvedFileIdentity>;
}

type FileIdentityResolverDependencies = {
  readonly platform: NodeJS.Platform;
  readonly cwd: () => string;
  readonly realpath: (targetPath: string) => Promise<string>;
  readonly stat?: (targetPath: string) => Promise<{
    readonly dev: number | bigint;
    readonly ino: number | bigint;
  }>;
};

const defaultDependencies: FileIdentityResolverDependencies = {
  platform: process.platform,
  cwd: process.cwd,
  realpath: defaultRealpath,
  stat: (targetPath) => defaultStat(targetPath, { bigint: true })
};

export function createFileIdentityResolver(
  dependencies: FileIdentityResolverDependencies = defaultDependencies
): FileIdentityResolver {
  const pathApi = dependencies.platform === "win32" ? path.win32 : path.posix;

  async function resolved(
    canonicalPath: string,
    exists: boolean
  ): Promise<ResolvedFileIdentity> {
    const identityPath =
      dependencies.platform === "win32"
        ? canonicalPath.toLocaleLowerCase("en-US")
        : canonicalPath;
    const filesystemIdentity = exists
      ? await resolveFilesystemIdentity(canonicalPath, dependencies.stat)
      : null;
    const pathKey = `path:${identityPath}` as FileLocationIdentity;
    if (!exists) {
      return Object.freeze({
        canonicalPath,
        identity: null,
        exists: false,
        pathKey,
        physicalKey: null
      });
    }
    const physicalKey = (filesystemIdentity ?? `object:${identityPath}`) as FileObjectIdentity;
    return Object.freeze({
      canonicalPath,
      identity: fileIdentity(pathKey, physicalKey),
      exists: true,
      pathKey,
      physicalKey
    });
  }

  return {
    async resolveExisting(targetPath: string): Promise<ResolvedExistingFileIdentity> {
      const absolutePath = pathApi.resolve(dependencies.cwd(), targetPath);
      const result = await resolved(await dependencies.realpath(absolutePath), true);
      if (!result.exists) {
        throw new Error("Existing file resolution produced a prospective identity.");
      }
      return result;
    },

    async resolveProspective(targetPath: string): Promise<ResolvedFileIdentity> {
      const absolutePath = pathApi.resolve(dependencies.cwd(), targetPath);
      const missingSegments: string[] = [];
      let candidate = absolutePath;

      while (true) {
        try {
          const canonicalAncestor = await dependencies.realpath(candidate);
          return resolved(
            pathApi.join(canonicalAncestor, ...missingSegments),
            missingSegments.length === 0
          );
        } catch (error) {
          if (!isMissingPathError(error)) {
            throw error;
          }
          const parent = pathApi.dirname(candidate);
          if (parent === candidate) {
            throw error;
          }
          missingSegments.unshift(pathApi.basename(candidate));
          candidate = parent;
        }
      }
    }
  };
}

async function resolveFilesystemIdentity(
  canonicalPath: string,
  stat: FileIdentityResolverDependencies["stat"]
): Promise<string | null> {
  if (!stat) {
    return null;
  }
  try {
    return reliableFilesystemIdentity(await stat(canonicalPath));
  } catch (error) {
    if (isUnsupportedStatError(error)) {
      return null;
    }
    throw error;
  }
}

function isUnsupportedStatError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return error.code === "ENOSYS" ||
    error.code === "ENOTSUP" ||
    error.code === "EOPNOTSUPP";
}

function reliableFilesystemIdentity(stat: {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
}): string | null {
  const device = String(stat.dev);
  const inode = String(stat.ino);
  if (inode === "0" || !isNonNegativeInteger(device) || !isNonNegativeInteger(inode)) {
    return null;
  }
  return `inode:${device}:${inode}`;
}

function isNonNegativeInteger(value: string): boolean {
  return /^(0|[1-9]\d*)$/.test(value);
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
