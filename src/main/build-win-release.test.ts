import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const createdDirectories: string[] = [];
let buildWindowsArtifacts: (input: {
  projectDir: string;
  builderConfig: Record<string, unknown>;
  electronBuilderBuildImpl?: (options: unknown) => Promise<unknown>;
  platformPackagerClass?: { prototype: { pack: (...args: unknown[]) => Promise<void> | void } };
  preparePackagedAppImpl?: (input: { appOutDir: string; builderConfig: Record<string, unknown> }) => Promise<void>;
}) => Promise<void>;
let preparePackagedWindowsApp: (input: {
  appOutDir: string;
  builderConfig: Record<string, unknown>;
  patchExecutableIconImpl?: (input: unknown) => Promise<void>;
}) => Promise<void>;
let writeAppUpdateMetadata: (input: {
  appOutDir: string;
  builderConfig: Record<string, unknown>;
}) => Promise<void>;
let writeLatestReleaseMetadata: (input: { projectDir: string; version: string }) => Promise<void>;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "build-win-release.mjs")).href;
  const releaseScriptModule = await import(moduleUrl);

  buildWindowsArtifacts = releaseScriptModule.buildWindowsArtifacts;
  preparePackagedWindowsApp = releaseScriptModule.preparePackagedWindowsApp;
  writeAppUpdateMetadata = releaseScriptModule.writeAppUpdateMetadata;
  writeLatestReleaseMetadata = releaseScriptModule.writeLatestReleaseMetadata;
});

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

afterAll(() => {
  createdDirectories.splice(0);
});

function createBuilderConfig() {
  return {
    productName: "Yulora",
    publish: [
      {
        provider: "github",
        owner: "yulu-gm",
        repo: "Yulora",
        releaseType: "release"
      }
    ]
  };
}

describe("build-win-release", () => {
  it("writes app-update metadata into the packaged resources directory", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "yulora-build-win-release-"));
    const appOutDirectory = path.join(tempDirectory, "win-unpacked");
    const resourcesDirectory = path.join(appOutDirectory, "resources");

    createdDirectories.push(tempDirectory);
    mkdirSync(resourcesDirectory, { recursive: true });

    await writeAppUpdateMetadata({
      appOutDir: appOutDirectory,
      builderConfig: createBuilderConfig()
    });

    const metadata = readFileSync(path.join(resourcesDirectory, "app-update.yml"), "utf8");

    expect(metadata).toContain("owner: yulu-gm");
    expect(metadata).toContain("repo: Yulora");
    expect(metadata).toContain("provider: github");
  });

  it("prepares the packaged app by writing updater metadata before patching the executable icon", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "yulora-build-win-release-"));
    const appOutDirectory = path.join(tempDirectory, "win-unpacked");
    const resourcesDirectory = path.join(appOutDirectory, "resources");
    const steps: string[] = [];

    createdDirectories.push(tempDirectory);
    mkdirSync(resourcesDirectory, { recursive: true });

    await preparePackagedWindowsApp({
      appOutDir: appOutDirectory,
      builderConfig: createBuilderConfig(),
      patchExecutableIconImpl: vi.fn(async () => {
        steps.push("patch-icon");
        const metadataPath = path.join(resourcesDirectory, "app-update.yml");
        expect(readFileSync(metadataPath, "utf8")).toContain("provider: github");
      })
    });

    expect(steps).toEqual(["patch-icon"]);
  });

  it("writes latest.yml after the installer exists", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "yulora-build-win-release-"));
    const releaseDirectory = path.join(tempDirectory, "release");
    const installerPath = path.join(releaseDirectory, "Yulora-Setup-0.1.0.exe");

    createdDirectories.push(tempDirectory);
    mkdirSync(releaseDirectory, { recursive: true });
    writeFileSync(installerPath, "installer-binary");

    await writeLatestReleaseMetadata({
      projectDir: tempDirectory,
      version: "0.1.0"
    });

    const latest = readFileSync(path.join(releaseDirectory, "latest.yml"), "utf8");

    expect(latest).toContain("version: 0.1.0");
    expect(latest).toContain("path: Yulora-Setup-0.1.0.exe");
  });

  it("prepares the packaged app before generating distributable artifacts", async () => {
    const steps: string[] = [];

    class FakePlatformPackager {
      platform = { nodeName: "win32" };
      platformSpecificBuildOptions = {};

      async pack(...args: unknown[]) {
        void args;
      }

      computeAppOutDir() {
        return "fake-app-out";
      }

      async doPack() {
        steps.push("doPack");
      }

      packageInDistributableFormat() {
        steps.push("package");
      }
    }

    await buildWindowsArtifacts({
      projectDir: process.cwd(),
      builderConfig: createBuilderConfig(),
      platformPackagerClass: FakePlatformPackager,
      preparePackagedAppImpl: vi.fn(async () => {
        steps.push("prepare");
      }),
      electronBuilderBuildImpl: vi.fn(async () => {
        const packager = new FakePlatformPackager();
        await packager.pack("release", "x64", [], {});
      })
    });

    expect(steps).toEqual(["doPack", "prepare", "package"]);
  });
});
