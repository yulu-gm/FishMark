declare module "../../scripts/build-win-release.mjs" {
  export function buildWindowsArtifacts(input: {
    projectDir: string;
    builderConfig: Record<string, unknown>;
    electronBuilderBuildImpl?: (options: unknown) => Promise<unknown>;
    platformPackagerClass?: {
      prototype: {
        pack: (...args: unknown[]) => Promise<void> | void;
      };
    };
    preparePackagedAppImpl?: (input: {
      appOutDir: string;
      builderConfig: Record<string, unknown>;
    }) => Promise<void>;
  }): Promise<void>;

  export function preparePackagedWindowsApp(input: {
    appOutDir: string;
    builderConfig: Record<string, unknown>;
    patchExecutableIconImpl?: (input: unknown) => Promise<void>;
  }): Promise<void>;

  export function writeAppUpdateMetadata(input: {
    appOutDir: string;
    builderConfig: Record<string, unknown>;
  }): Promise<void>;

  export function writeLatestReleaseMetadata(input: {
    projectDir: string;
    version: string;
  }): Promise<void>;
}
