import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { build as electronBuilderBuild } from "electron-builder";

import {
  OUTPUT_DIRECTORY,
  cleanOutputDirectory,
  loadJson,
  loadReleaseNotes,
  publishReleaseAssets,
  resolveOutputDirectory
} from "./release-github.mjs";

const VALID_MODES = new Set(["package", "release", "beta"]);
const MAC_RELEASE_TARGETS = [
  {
    target: "dmg",
    arch: ["arm64"]
  },
  {
    target: "zip",
    arch: ["arm64"]
  }
];
const MAC_BETA_TARGETS = [
  {
    target: "dmg",
    arch: ["arm64"]
  }
];

function hasEveryEnvironmentValue(env, names) {
  return names.every((name) => typeof env[name] === "string" && env[name].trim().length > 0);
}

function hasNotarizationCredentials(env) {
  return (
    hasEveryEnvironmentValue(env, ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"]) ||
    hasEveryEnvironmentValue(env, ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]) ||
    hasEveryEnvironmentValue(env, ["APPLE_KEYCHAIN_PROFILE"])
  );
}

function hasConfiguredSigningCredentials(env) {
  return (
    hasEveryEnvironmentValue(env, ["CSC_LINK", "CSC_KEY_PASSWORD"]) ||
    (typeof env.CSC_NAME === "string" && env.CSC_NAME.trim().length > 0)
  );
}

function hasDeveloperIdIdentity(spawnSyncImpl) {
  const result = spawnSyncImpl("security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return false;
  }

  return typeof result.stdout === "string" && result.stdout.includes("Developer ID Application");
}

export function validateMacReleaseEnvironment({
  platform = process.platform,
  env = process.env,
  spawnSyncImpl = spawnSync
} = {}) {
  if (platform !== "darwin") {
    throw new Error("macOS release must be run on macOS.");
  }

  const missing = [];
  const hasSigningMaterial = hasConfiguredSigningCredentials(env) || hasDeveloperIdIdentity(spawnSyncImpl);

  if (!hasSigningMaterial) {
    missing.push("a Developer ID Application signing identity");
  }

  if (!hasNotarizationCredentials(env)) {
    missing.push("Apple notarization credentials");
  }

  if (missing.length > 0) {
    throw new Error(
      `macOS release requires ${missing.join(" and ")}. ` +
        "Set CSC_LINK/CSC_KEY_PASSWORD or install a Developer ID Application certificate, " +
        "and set APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER, APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID, or APPLE_KEYCHAIN_PROFILE."
    );
  }
}

function createMacReleaseBuildConfig({ builderConfig, outputDirectory }) {
  const existingMacConfig =
    builderConfig.mac && typeof builderConfig.mac === "object" && !Array.isArray(builderConfig.mac)
      ? builderConfig.mac
      : {};

  return {
    ...builderConfig,
    publish: null,
    directories: {
      ...builderConfig.directories,
      output: outputDirectory
    },
    mac: {
      ...existingMacConfig,
      icon: existingMacConfig.icon ?? "build/icons/dark/icon-512.png",
      artifactName: "${productName}-${version}-${arch}.${ext}",
      forceCodeSigning: true,
      hardenedRuntime: true,
      notarize: true,
      target: MAC_RELEASE_TARGETS
    }
  };
}

function createMacBetaBuildConfig({ builderConfig, outputDirectory }) {
  const existingMacConfig =
    builderConfig.mac && typeof builderConfig.mac === "object" && !Array.isArray(builderConfig.mac)
      ? builderConfig.mac
      : {};

  return {
    ...builderConfig,
    publish: null,
    directories: {
      ...builderConfig.directories,
      output: outputDirectory
    },
    mac: {
      ...existingMacConfig,
      icon: existingMacConfig.icon ?? "build/icons/dark/icon-512.png",
      artifactName: "${productName}-${version}-${arch}.${ext}",
      identity: "-",
      forceCodeSigning: false,
      hardenedRuntime: false,
      notarize: false,
      target: MAC_BETA_TARGETS
    }
  };
}

export async function buildMacArtifacts({
  projectDir,
  builderConfig,
  outputDirectory = OUTPUT_DIRECTORY,
  electronBuilderBuildImpl = electronBuilderBuild
}) {
  const buildConfig = createMacReleaseBuildConfig({ builderConfig, outputDirectory });

  await electronBuilderBuildImpl({
    projectDir,
    mac: ["dmg", "zip"],
    arm64: true,
    config: buildConfig,
    publish: "never"
  });
}

export async function buildMacBetaArtifacts({
  projectDir,
  builderConfig,
  outputDirectory = OUTPUT_DIRECTORY,
  electronBuilderBuildImpl = electronBuilderBuild
}) {
  const buildConfig = createMacBetaBuildConfig({ builderConfig, outputDirectory });

  await electronBuilderBuildImpl({
    projectDir,
    mac: ["dmg"],
    arm64: true,
    config: buildConfig,
    publish: "never"
  });
}

async function readLatestMacVersion(latestMacPath) {
  const source = await readFile(latestMacPath, "utf8");
  const versionLine = source.split(/\r?\n/u).find((line) => line.startsWith("version:"));
  const parsedVersion = versionLine?.slice("version:".length).trim();

  return parsedVersion && parsedVersion.length > 0 ? parsedVersion : null;
}

export async function resolveMacReleaseAssets({ projectDir, version, outputDirectory = OUTPUT_DIRECTORY }) {
  const releaseDirectory = path.join(projectDir, outputDirectory);
  const latestMacPath = path.join(releaseDirectory, "latest-mac.yml");

  if (!existsSync(latestMacPath)) {
    throw new Error(`Release artifact is missing: ${latestMacPath}`);
  }

  const latestMacVersion = await readLatestMacVersion(latestMacPath);

  if (latestMacVersion !== version) {
    throw new Error(`latest-mac.yml version ${latestMacVersion ?? "(missing)"} does not match package.json version ${version}.`);
  }

  const fileNames = (await readdir(releaseDirectory)).sort((a, b) => a.localeCompare(b));
  const macArtifactNames = fileNames.filter(
    (fileName) =>
      fileName.includes(version) &&
      (fileName.endsWith(".dmg") || fileName.endsWith(".zip") || fileName.endsWith(".dmg.blockmap"))
  );

  const assets = macArtifactNames.map((name) => ({
    name,
    filePath: path.join(releaseDirectory, name)
  }));

  assets.push({
    name: "latest-mac.yml",
    filePath: latestMacPath
  });

  if (!assets.some((asset) => asset.name.endsWith(".dmg"))) {
    throw new Error(`macOS release is missing a .dmg artifact for version ${version}.`);
  }

  if (!assets.some((asset) => asset.name.endsWith(".zip"))) {
    throw new Error(`macOS release is missing a .zip artifact for version ${version}.`);
  }

  return assets;
}

export async function resolveMacBetaReleaseAssets({ projectDir, version, outputDirectory = OUTPUT_DIRECTORY }) {
  const releaseDirectory = path.join(projectDir, outputDirectory);
  const fileNames = (await readdir(releaseDirectory)).sort((a, b) => a.localeCompare(b));
  const macArtifactNames = fileNames.filter(
    (fileName) => fileName.includes(version) && (fileName.endsWith(".dmg") || fileName.endsWith(".dmg.blockmap"))
  );
  const assets = macArtifactNames.map((name) => ({
    name,
    filePath: path.join(releaseDirectory, name)
  }));

  if (!assets.some((asset) => asset.name.endsWith(".dmg"))) {
    throw new Error(`macOS beta release is missing a .dmg artifact for version ${version}.`);
  }

  return assets;
}

export function createMacBetaReleaseOptions({ version, releaseNotes }) {
  return {
    tagName: `v${version}-mac-beta`,
    name: `FishMark ${version} macOS Beta`,
    body: [
      "> macOS beta build: this DMG is ad-hoc signed and not notarized. macOS may require manual approval in System Settings before opening.",
      "",
      releaseNotes.body
    ].join("\n"),
    prerelease: true,
    makeLatest: false
  };
}

export async function publishMacReleaseArtifacts({ projectDir, builderConfig, version, outputDirectory = OUTPUT_DIRECTORY }) {
  const assets = await resolveMacReleaseAssets({ projectDir, version, outputDirectory });

  await publishReleaseAssets({
    builderConfig,
    projectDir,
    version,
    assets,
    userAgent: "FishMark-macOS-Release"
  });
}

export async function publishMacBetaReleaseArtifacts({
  projectDir,
  builderConfig,
  version,
  outputDirectory = OUTPUT_DIRECTORY,
  releaseNotes
}) {
  const assets = await resolveMacBetaReleaseAssets({ projectDir, version, outputDirectory });

  await publishReleaseAssets({
    builderConfig,
    projectDir,
    version,
    assets,
    userAgent: "FishMark-macOS-Beta-Release",
    releaseOptions: createMacBetaReleaseOptions({ version, releaseNotes })
  });
}

export async function main() {
  const mode = process.argv[2];

  if (!VALID_MODES.has(mode)) {
    throw new Error(`Usage: node scripts/build-mac-release.mjs <package|release|beta>`);
  }

  const projectDir = process.cwd();
  const packageJson = await loadJson(path.join(projectDir, "package.json"), "package.json");
  const builderConfig = await loadJson(path.join(projectDir, "electron-builder.json"), "electron-builder.json");
  const version = packageJson.version;
  const outputDirectory = resolveOutputDirectory();

  if (!version || typeof version !== "string") {
    throw new Error("package.json must define a version string.");
  }

  let releaseNotes = null;

  if (mode === "release") {
    releaseNotes = await loadReleaseNotes({ projectDir, version });
    validateMacReleaseEnvironment();
  } else if (mode === "beta") {
    releaseNotes = await loadReleaseNotes({ projectDir, version });
  }

  await cleanOutputDirectory(projectDir, outputDirectory);

  if (mode === "beta") {
    await buildMacBetaArtifacts({ projectDir, builderConfig, outputDirectory });
  } else {
    await buildMacArtifacts({ projectDir, builderConfig, outputDirectory });
  }

  if (mode === "release") {
    await publishMacReleaseArtifacts({
      projectDir,
      builderConfig,
      outputDirectory,
      version
    });
  } else if (mode === "beta") {
    await publishMacBetaReleaseArtifacts({
      projectDir,
      builderConfig,
      outputDirectory,
      version,
      releaseNotes
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
