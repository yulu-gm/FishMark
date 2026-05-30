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
let loadReleaseNotes: (input: { projectDir: string; version: string }) => Promise<{
  version: string;
  title: string;
  body: string;
}>;
let ensureRelease: (input: {
  owner: string;
  repo: string;
  version: string;
  token: string;
  releaseNotes: {
    version: string;
    title: string;
    body: string;
  };
}) => Promise<{ html_url?: string }>;
let resolveGitHubToken: (input?: {
  env?: Record<string, string | undefined>;
  spawnSyncImpl?: (command: string, args: string[], options?: unknown) => {
    status: number | null;
    stdout?: string;
    stderr?: string;
  };
}) => string;

beforeAll(async () => {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), "scripts", "build-win-release.mjs")).href;
  const releaseScriptModule = (await import(moduleUrl)) as Record<string, unknown>;

  buildWindowsArtifacts = releaseScriptModule.buildWindowsArtifacts as typeof buildWindowsArtifacts;
  preparePackagedWindowsApp = releaseScriptModule.preparePackagedWindowsApp as typeof preparePackagedWindowsApp;
  writeAppUpdateMetadata = releaseScriptModule.writeAppUpdateMetadata as typeof writeAppUpdateMetadata;
  writeLatestReleaseMetadata = releaseScriptModule.writeLatestReleaseMetadata as typeof writeLatestReleaseMetadata;
  loadReleaseNotes = releaseScriptModule.loadReleaseNotes as typeof loadReleaseNotes;
  ensureRelease = releaseScriptModule.ensureRelease as typeof ensureRelease;
  resolveGitHubToken = releaseScriptModule.resolveGitHubToken as typeof resolveGitHubToken;
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
    productName: "FishMark",
    publish: [
      {
        provider: "github",
        owner: "yulu-gm",
        repo: "FishMark",
        releaseType: "release"
      }
    ]
  };
}

describe("build-win-release", () => {
  it("loads release notes from project metadata for the target version", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-win-release-"));
    const metadataDirectory = path.join(tempDirectory, "release-metadata");

    createdDirectories.push(tempDirectory);
    mkdirSync(metadataDirectory, { recursive: true });
    writeFileSync(
      path.join(metadataDirectory, "release-notes.json"),
      JSON.stringify(
        {
          version: "0.1.2",
          title: "FishMark 0.1.2 Release",
          body: "### 本次更新\n\n- 改进发布流程。"
        },
        null,
        2
      )
    );

    await expect(loadReleaseNotes({ projectDir: tempDirectory, version: "0.1.2" })).resolves.toEqual({
      version: "0.1.2",
      title: "FishMark 0.1.2 Release",
      body: "### 本次更新\n\n- 改进发布流程。"
    });
  });

  it("fails when release notes metadata is missing", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-win-release-"));

    createdDirectories.push(tempDirectory);

    await expect(loadReleaseNotes({ projectDir: tempDirectory, version: "0.1.2" })).rejects.toThrow(
      "release-metadata/release-notes.json"
    );
  });

  it("fails when release notes metadata version does not match package.json", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-win-release-"));
    const metadataDirectory = path.join(tempDirectory, "release-metadata");

    createdDirectories.push(tempDirectory);
    mkdirSync(metadataDirectory, { recursive: true });
    writeFileSync(
      path.join(metadataDirectory, "release-notes.json"),
      JSON.stringify(
        {
          version: "0.1.1",
          title: "FishMark 0.1.1 Release",
          body: "### 本次更新\n\n- 旧版本说明。"
        },
        null,
        2
      )
    );

    await expect(loadReleaseNotes({ projectDir: tempDirectory, version: "0.1.2" })).rejects.toThrow(
      "does not match package.json version 0.1.2"
    );
  });

  it("writes app-update metadata into the packaged resources directory", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-win-release-"));
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
    expect(metadata).toContain("repo: FishMark");
    expect(metadata).toContain("provider: github");
  });

  it("prepares the packaged app by writing updater metadata before patching the executable icon", async () => {
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-win-release-"));
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
    const tempDirectory = mkdtempSync(path.join(tmpdir(), "fishmark-build-win-release-"));
    const releaseDirectory = path.join(tempDirectory, "release");
    const installerPath = path.join(releaseDirectory, "FishMark-Setup-0.1.0.exe");

    createdDirectories.push(tempDirectory);
    mkdirSync(releaseDirectory, { recursive: true });
    writeFileSync(installerPath, "installer-binary");

    await writeLatestReleaseMetadata({
      projectDir: tempDirectory,
      version: "0.1.0"
    });

    const latest = readFileSync(path.join(releaseDirectory, "latest.yml"), "utf8");

    expect(latest).toContain("version: 0.1.0");
    expect(latest).toContain("path: FishMark-Setup-0.1.0.exe");
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

  it("requests x64 Windows artifacts regardless of host architecture", async () => {
    class FakePlatformPackager {
      async pack(...args: unknown[]) {
        void args;
      }
    }

    const buildMock = vi.fn(async () => {});

    await buildWindowsArtifacts({
      projectDir: process.cwd(),
      builderConfig: createBuilderConfig(),
      platformPackagerClass: FakePlatformPackager,
      electronBuilderBuildImpl: buildMock
    });

    expect(buildMock).toHaveBeenCalledWith(
      expect.objectContaining({
        win: ["nsis"],
        x64: true,
        publish: "never"
      })
    );
  });

  it("creates a GitHub release using the structured release note title and body", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/releases/tags/v0.1.2")) {
        return {
          status: 404,
          ok: false,
          statusText: "Not Found"
        };
      }

      if (url.endsWith("/releases")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          tag_name: "v0.1.2",
          name: "FishMark 0.1.2 Release",
          body: "### 本次更新\n\n- 改进发布流程。",
          draft: false,
          prerelease: false
        });

        return {
          ok: true,
          json: async () => ({ html_url: "https://example.test/release/v0.1.2" })
        };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ensureRelease({
        owner: "yulu-gm",
        repo: "FishMark",
        version: "0.1.2",
        token: "token",
        releaseNotes: {
          version: "0.1.2",
          title: "FishMark 0.1.2 Release",
          body: "### 本次更新\n\n- 改进发布流程。"
        }
      })
    ).resolves.toMatchObject({
      html_url: "https://example.test/release/v0.1.2"
    });

    vi.unstubAllGlobals();
  });

  it("uses GitHub CLI authentication as a release token fallback", () => {
    const spawnSyncImpl = vi.fn((command: string) => {
      if (command === "git") {
        return {
          status: 128,
          stderr: "fatal: could not read Username"
        };
      }

      return {
        status: 0,
        stdout: "gho_example\n"
      };
    });

    expect(resolveGitHubToken({ env: {}, spawnSyncImpl })).toBe("gho_example");
    expect(spawnSyncImpl).toHaveBeenCalledWith("gh", ["auth", "token"], expect.any(Object));
  });
});
