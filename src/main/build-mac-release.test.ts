import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const createdDirectories: string[] = [];

let buildMacArtifacts: (input: {
  projectDir: string;
  builderConfig: Record<string, unknown>;
  outputDirectory?: string;
  electronBuilderBuildImpl?: (options: unknown) => Promise<unknown>;
}) => Promise<void>;
let buildMacBetaArtifacts: (input: {
  projectDir: string;
  builderConfig: Record<string, unknown>;
  outputDirectory?: string;
  electronBuilderBuildImpl?: (options: unknown) => Promise<unknown>;
}) => Promise<void>;
let resolveMacReleaseAssets: (input: {
  projectDir: string;
  version: string;
  outputDirectory?: string;
}) => Promise<Array<{ name: string; filePath: string }>>;
let resolveMacBetaReleaseAssets: (input: {
  projectDir: string;
  version: string;
  outputDirectory?: string;
}) => Promise<Array<{ name: string; filePath: string }>>;
let createMacBetaReleaseOptions: (input: {
  version: string;
  releaseNotes: {
    version: string;
    title: string;
    body: string;
  };
}) => {
  tagName: string;
  name: string;
  body: string;
  prerelease: boolean;
  makeLatest: boolean;
};
let validateMacReleaseEnvironment: (input: {
  platform?: string;
  env?: Record<string, string | undefined>;
  spawnSyncImpl?: (command: string, args: string[], options?: unknown) => { status: number | null; stdout?: string };
}) => void;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "build-mac-release.mjs")).href;
  const releaseScriptModule = (await import(moduleUrl)) as Record<string, unknown>;

  buildMacArtifacts = releaseScriptModule.buildMacArtifacts as typeof buildMacArtifacts;
  buildMacBetaArtifacts = releaseScriptModule.buildMacBetaArtifacts as typeof buildMacBetaArtifacts;
  resolveMacReleaseAssets = releaseScriptModule.resolveMacReleaseAssets as typeof resolveMacReleaseAssets;
  resolveMacBetaReleaseAssets =
    releaseScriptModule.resolveMacBetaReleaseAssets as typeof resolveMacBetaReleaseAssets;
  createMacBetaReleaseOptions = releaseScriptModule.createMacBetaReleaseOptions as typeof createMacBetaReleaseOptions;
  validateMacReleaseEnvironment = releaseScriptModule.validateMacReleaseEnvironment as typeof validateMacReleaseEnvironment;
});

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createBuilderConfig() {
  return {
    productName: "FishMark",
    publish: [
      {
        provider: "github",
        owner: "yulu-gm",
        repo: "FishMark",
        releaseType: "release"
      }
    ],
    mac: {
      category: "public.app-category.productivity",
      icon: "build/icons/dark/icon-512.png"
    }
  };
}

describe("build-mac-release", () => {
  it("builds macOS dmg and zip artifacts without publishing from electron-builder", async () => {
    const buildMock = vi.fn(async () => undefined);

    await buildMacArtifacts({
      projectDir: process.cwd(),
      builderConfig: createBuilderConfig(),
      electronBuilderBuildImpl: buildMock
    });

    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: process.cwd(),
        mac: ["dmg", "zip"],
        arm64: true,
        publish: "never",
        config: expect.objectContaining({
          publish: null,
          mac: expect.objectContaining({
            icon: "build/icons/dark/icon-512.png",
            notarize: true,
            target: [
              {
                target: "dmg",
                arch: ["arm64"]
              },
              {
                target: "zip",
                arch: ["arm64"]
              }
            ]
          })
        })
      })
    );
  });

  it("requires macOS signing and notarization material before publishing a macOS release", () => {
    expect(() =>
      validateMacReleaseEnvironment({
        platform: "darwin",
        env: {},
        spawnSyncImpl: vi.fn(() => ({ status: 0, stdout: "" }))
      })
    ).toThrow("macOS release requires");
  });

  it("builds a dmg-only beta artifact with ad-hoc signing and without notarization requirements", async () => {
    const buildMock = vi.fn(async () => undefined);

    await buildMacBetaArtifacts({
      projectDir: process.cwd(),
      builderConfig: createBuilderConfig(),
      electronBuilderBuildImpl: buildMock
    });

    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: process.cwd(),
        mac: ["dmg"],
        arm64: true,
        publish: "never",
        config: expect.objectContaining({
          publish: null,
          mac: expect.objectContaining({
            identity: "-",
            forceCodeSigning: false,
            hardenedRuntime: false,
            notarize: false,
            target: [
              {
                target: "dmg",
                arch: ["arm64"]
              }
            ]
          })
        })
      })
    );
  });

  it("accepts keychain signing identity and Apple ID notarization credentials", () => {
    expect(() =>
      validateMacReleaseEnvironment({
        platform: "darwin",
        env: {
          APPLE_ID: "developer@example.test",
          APPLE_APP_SPECIFIC_PASSWORD: "password",
          APPLE_TEAM_ID: "TEAMID"
        },
        spawnSyncImpl: vi.fn(() => ({
          status: 0,
          stdout: '  1) ABCDEF "Developer ID Application: FishMark (TEAMID)"'
        }))
      })
    ).not.toThrow();
  });

  it("resolves the macOS release asset set after electron-builder writes distributables", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-mac-release-"));
    const releaseDirectory = path.join(tempDirectory, "release");

    createdDirectories.push(tempDirectory);
    mkdirSync(releaseDirectory, { recursive: true });
    writeFileSync(path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg"), "dmg");
    writeFileSync(path.join(releaseDirectory, "FishMark-0.2.1-arm64.zip"), "zip");
    writeFileSync(path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg.blockmap"), "blockmap");
    writeFileSync(path.join(releaseDirectory, "latest-mac.yml"), "version: 0.2.1\n");

    await expect(resolveMacReleaseAssets({ projectDir: tempDirectory, version: "0.2.1" })).resolves.toEqual([
      {
        name: "FishMark-0.2.1-arm64.dmg",
        filePath: path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg")
      },
      {
        name: "FishMark-0.2.1-arm64.dmg.blockmap",
        filePath: path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg.blockmap")
      },
      {
        name: "FishMark-0.2.1-arm64.zip",
        filePath: path.join(releaseDirectory, "FishMark-0.2.1-arm64.zip")
      },
      {
        name: "latest-mac.yml",
        filePath: path.join(releaseDirectory, "latest-mac.yml")
      }
    ]);
  });

  it("fails when updater metadata is missing from the macOS release assets", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-mac-release-"));
    const releaseDirectory = path.join(tempDirectory, "release");

    createdDirectories.push(tempDirectory);
    mkdirSync(releaseDirectory, { recursive: true });
    writeFileSync(path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg"), "dmg");
    writeFileSync(path.join(releaseDirectory, "FishMark-0.2.1-arm64.zip"), "zip");

    await expect(resolveMacReleaseAssets({ projectDir: tempDirectory, version: "0.2.1" })).rejects.toThrow(
      "latest-mac.yml"
    );
  });

  it("resolves beta release dmg assets without requiring updater metadata", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-mac-release-"));
    const releaseDirectory = path.join(tempDirectory, "release");

    createdDirectories.push(tempDirectory);
    mkdirSync(releaseDirectory, { recursive: true });
    writeFileSync(path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg"), "dmg");
    writeFileSync(path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg.blockmap"), "blockmap");

    await expect(resolveMacBetaReleaseAssets({ projectDir: tempDirectory, version: "0.2.1" })).resolves.toEqual([
      {
        name: "FishMark-0.2.1-arm64.dmg",
        filePath: path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg")
      },
      {
        name: "FishMark-0.2.1-arm64.dmg.blockmap",
        filePath: path.join(releaseDirectory, "FishMark-0.2.1-arm64.dmg.blockmap")
      }
    ]);
  });

  it("uses a separate prerelease tag for macOS beta releases", () => {
    expect(
      createMacBetaReleaseOptions({
        version: "0.2.1",
        releaseNotes: {
          version: "0.2.1",
          title: "FishMark 0.2.1 Release",
          body: "### 本次更新\n\n- 改进发布流程。"
        }
      })
    ).toEqual({
      tagName: "v0.2.1-mac-beta",
      name: "FishMark 0.2.1 macOS Beta",
      body: [
        "> macOS beta build: this DMG is ad-hoc signed and not notarized. macOS may require manual approval in System Settings before opening.",
        "",
        "### 本次更新",
        "",
        "- 改进发布流程。"
      ].join("\n"),
      prerelease: true,
      makeLatest: false
    });
  });
});
