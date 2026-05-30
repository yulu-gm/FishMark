import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { build as electronBuilderBuild } from "electron-builder";
import { PlatformPackager } from "app-builder-lib";

import patchWindowsExecutableIcon from "./after-pack-win-icon.mjs";
import {
  OUTPUT_DIRECTORY,
  cleanOutputDirectory,
  ensureRelease,
  loadJson,
  loadReleaseNotes,
  publishReleaseAssets,
  resolveGithubPublishConfig,
  resolveOutputDirectory
} from "./release-github.mjs";

export {
  cleanOutputDirectory,
  ensureRelease,
  loadJson,
  loadReleaseNotes,
  resolveGitHubToken,
  resolveGithubPublishConfig
} from "./release-github.mjs";

const VALID_MODES = new Set(["package", "release"]);

function toYamlScalar(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

export async function publishReleaseArtifacts({ projectDir, builderConfig, version, outputDirectory = OUTPUT_DIRECTORY }) {
  const latestPath = path.join(projectDir, outputDirectory, "latest.yml");
  const installerPath = path.join(projectDir, outputDirectory, `FishMark-Setup-${version}.exe`);
  const blockMapPath = `${installerPath}.blockmap`;
  const assets = [
    { name: "latest.yml", filePath: latestPath },
    { name: path.basename(installerPath), filePath: installerPath },
    { name: path.basename(blockMapPath), filePath: blockMapPath }
  ];

  await publishReleaseAssets({
    builderConfig,
    projectDir,
    version,
    assets,
    userAgent: "FishMark-Windows-Release"
  });
}

export async function writeAppUpdateMetadata({ appOutDir, builderConfig }) {
  const publishConfig = resolveGithubPublishConfig(builderConfig);
  const appUpdateYaml = [
    `owner: ${publishConfig.owner}`,
    `repo: ${publishConfig.repo}`,
    "provider: github",
    `releaseType: ${publishConfig.releaseType ?? "release"}`,
    "updaterCacheDirName: fishmark-updater"
  ].join("\n");

  await writeFile(path.join(appOutDir, "resources", "app-update.yml"), `${appUpdateYaml}\n`, "utf8");
}

export async function preparePackagedWindowsApp({
  appOutDir,
  builderConfig,
  patchExecutableIconImpl = patchWindowsExecutableIcon
}) {
  await writeAppUpdateMetadata({ appOutDir, builderConfig });
  await patchExecutableIconImpl({
    appOutDir,
    electronPlatformName: "win32",
    packager: {
      appInfo: {
        productFilename: builderConfig.productName ?? "FishMark"
      }
    }
  });
}

export async function buildWindowsArtifacts({
  projectDir,
  builderConfig,
  outputDirectory = OUTPUT_DIRECTORY,
  electronBuilderBuildImpl = electronBuilderBuild,
  platformPackagerClass = PlatformPackager,
  preparePackagedAppImpl = preparePackagedWindowsApp
}) {
  const buildConfig = {
    ...builderConfig,
    afterPack: null,
    publish: null
  };
  buildConfig.directories = {
    ...buildConfig.directories,
    output: outputDirectory
  };
  const originalPack = platformPackagerClass.prototype.pack;

  platformPackagerClass.prototype.pack = async function packWithDisabledAsarIntegrity(outDir, arch, targets, taskManager) {
    const appOutDir = this.computeAppOutDir(outDir, arch);

    await this.doPack({
      outDir,
      appOutDir,
      platformName: this.platform.nodeName,
      arch,
      platformSpecificBuildOptions: this.platformSpecificBuildOptions,
      targets,
      options: { disableAsarIntegrity: true }
    });

    await preparePackagedAppImpl({
      appOutDir,
      builderConfig
    });
    this.packageInDistributableFormat(appOutDir, arch, targets, taskManager);
  };

  try {
    await electronBuilderBuildImpl({
      projectDir,
      win: ["nsis"],
      x64: true,
      config: buildConfig,
      publish: "never"
    });
  } finally {
    platformPackagerClass.prototype.pack = originalPack;
  }
}

async function computeSha512(filePath) {
  const content = await readFile(filePath);
  return createHash("sha512").update(content).digest("base64");
}

export async function writeLatestReleaseMetadata({ projectDir, version, outputDirectory = OUTPUT_DIRECTORY }) {
  const installerName = `FishMark-Setup-${version}.exe`;
  const installerPath = path.join(projectDir, outputDirectory, installerName);
  const installerStat = await stat(installerPath);
  const sha512 = await computeSha512(installerPath);
  const releaseDate = new Date().toISOString();
  const latestYaml = [
    `version: ${version}`,
    "files:",
    `  - url: ${installerName}`,
    `    sha512: ${sha512}`,
    `    size: ${installerStat.size}`,
    `path: ${installerName}`,
    `sha512: ${sha512}`,
    `releaseDate: ${toYamlScalar(releaseDate)}`
  ].join("\n");

  await writeFile(path.join(projectDir, outputDirectory, "latest.yml"), `${latestYaml}\n`, "utf8");
}

export async function main() {
  const mode = process.argv[2];

  if (!VALID_MODES.has(mode)) {
    throw new Error(`Usage: node scripts/build-win-release.mjs <package|release>`);
  }

  const projectDir = process.cwd();
  const packageJson = await loadJson(path.join(projectDir, "package.json"), "package.json");
  const builderConfig = await loadJson(path.join(projectDir, "electron-builder.json"), "electron-builder.json");
  const version = packageJson.version;
  const outputDirectory = resolveOutputDirectory();

  if (!version || typeof version !== "string") {
    throw new Error("package.json must define a version string.");
  }

  if (mode === "release") {
    await loadReleaseNotes({ projectDir, version });
  }
  await cleanOutputDirectory(projectDir, outputDirectory);
  await buildWindowsArtifacts({ projectDir, builderConfig, outputDirectory });
  await writeLatestReleaseMetadata({ projectDir, version, outputDirectory });

  if (mode === "release") {
    await publishReleaseArtifacts({
      projectDir,
      builderConfig,
      outputDirectory,
      version
    });
  }
}

const currentModulePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentModulePath)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
