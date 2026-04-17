import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { build as electronBuilderBuild } from "electron-builder";
import { PlatformPackager } from "app-builder-lib";

import patchWindowsExecutableIcon from "./after-pack-win-icon.mjs";

const VALID_MODES = new Set(["package", "release"]);
const OUTPUT_DIRECTORY = "release";
const RELEASE_ASSET_CONTENT_TYPE = "application/octet-stream";

function toYamlScalar(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Failed to parse ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadJson(filePath, label) {
  const source = await readFile(filePath, "utf8");
  return parseJson(source, label);
}

export async function cleanOutputDirectory(projectDir) {
  const outputDirectory = path.join(projectDir, OUTPUT_DIRECTORY);
  const normalized = path.resolve(outputDirectory);

  if (normalized !== path.join(projectDir, OUTPUT_DIRECTORY)) {
    throw new Error(`Unexpected output directory: ${normalized}`);
  }

  await rm(normalized, { recursive: true, force: true });
}

export function resolveGitHubToken() {
  const directToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

  if (directToken && directToken.trim().length > 0) {
    return directToken.trim();
  }

  const credentialResult = spawnSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0"
    }
  });

  if (credentialResult.status !== 0) {
    throw new Error(
      `Unable to resolve GitHub credentials: ${
        credentialResult.stderr?.trim() || credentialResult.stdout?.trim() || "git credential fill failed"
      }`
    );
  }

  const passwordLine = credentialResult.stdout
    .split(/\r?\n/u)
    .find((line) => line.startsWith("password="));

  if (!passwordLine) {
    throw new Error("GitHub token is not available. Set GH_TOKEN/GITHUB_TOKEN or configure git credentials.");
  }

  return passwordLine.slice("password=".length);
}

export function resolveGithubPublishConfig(builderConfig) {
  const publishEntries = Array.isArray(builderConfig.publish) ? builderConfig.publish : [];
  const githubConfig = publishEntries.find(
    (entry) => entry && typeof entry === "object" && entry.provider === "github"
  );

  if (!githubConfig?.owner || !githubConfig?.repo) {
    throw new Error("electron-builder.json must define a GitHub publish owner/repo.");
  }

  return githubConfig;
}

export async function githubRequest(url, init) {
  const response = await fetch(url, init);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status} ${response.statusText}): ${body}`);
  }

  return response;
}

export async function getReleaseByTag({ owner, repo, tagName, token }) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Yulora-Windows-Release"
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to query release ${tagName}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function ensureRelease({ owner, repo, version, token }) {
  const tagName = `v${version}`;
  const existing = await getReleaseByTag({ owner, repo, tagName, token });

  if (existing) {
    return existing;
  }

  const response = await githubRequest(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Yulora-Windows-Release"
    },
    body: JSON.stringify({
      tag_name: tagName,
      target_commitish: "main",
      name: `${version} test release`,
      body: "Windows auto-update validation release.",
      draft: false,
      prerelease: false,
      generate_release_notes: false
    })
  });

  return response.json();
}

export async function deleteExistingAssets({ owner, repo, release, assetNames, token }) {
  const assets = Array.isArray(release.assets) ? release.assets : [];

  for (const asset of assets) {
    if (!assetNames.includes(asset.name)) {
      continue;
    }

    await githubRequest(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Yulora-Windows-Release"
      }
    });
  }
}

export async function uploadReleaseAsset(uploadBaseUrl, assetPath, assetName, token) {
  const uploadScript = [
    "Add-Type -AssemblyName System.Net.Http",
    "$client = [System.Net.Http.HttpClient]::new()",
    "$client.Timeout = [TimeSpan]::FromMinutes(20)",
    "$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $env:YULORA_GH_TOKEN)",
    "$client.DefaultRequestHeaders.Accept.Add([System.Net.Http.Headers.MediaTypeWithQualityHeaderValue]::new('application/vnd.github+json'))",
    "$client.DefaultRequestHeaders.Add('X-GitHub-Api-Version','2022-11-28')",
    "$client.DefaultRequestHeaders.Add('User-Agent','Yulora-Windows-Release')",
    "$bytes = [System.IO.File]::ReadAllBytes($env:YULORA_RELEASE_ASSET_PATH)",
    "$content = [System.Net.Http.ByteArrayContent]::new($bytes)",
    `$content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('${RELEASE_ASSET_CONTENT_TYPE}')`,
    "$url = $env:YULORA_RELEASE_UPLOAD_URL + '?name=' + [System.Uri]::EscapeDataString($env:YULORA_RELEASE_ASSET_NAME)",
    "$response = $client.PostAsync($url, $content).GetAwaiter().GetResult()",
    "if (-not $response.IsSuccessStatusCode) {",
    "  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()",
    "  throw \"GitHub asset upload failed: $([int]$response.StatusCode) $($response.ReasonPhrase) $body\"",
    "}",
    "$content.Dispose()",
    "$client.Dispose()"
  ].join("; ");
  const uploadResult = spawnSync("powershell.exe", ["-Command", uploadScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      YULORA_GH_TOKEN: token,
      YULORA_RELEASE_ASSET_PATH: assetPath,
      YULORA_RELEASE_ASSET_NAME: assetName,
      YULORA_RELEASE_UPLOAD_URL: uploadBaseUrl
    }
  });

  if (uploadResult.status !== 0) {
    throw new Error(
      `Failed to upload ${assetName}: ${
        uploadResult.stderr?.trim() || uploadResult.stdout?.trim() || "PowerShell upload failed"
      }`
    );
  }
}

export async function publishReleaseArtifacts({ projectDir, builderConfig, version }) {
  const githubConfig = resolveGithubPublishConfig(builderConfig);
  const token = resolveGitHubToken();
  const release = await ensureRelease({
    owner: githubConfig.owner,
    repo: githubConfig.repo,
    version,
    token
  });
  const latestPath = path.join(projectDir, OUTPUT_DIRECTORY, "latest.yml");
  const installerPath = path.join(projectDir, OUTPUT_DIRECTORY, `Yulora-Setup-${version}.exe`);
  const blockMapPath = `${installerPath}.blockmap`;
  const assets = [
    { name: "latest.yml", filePath: latestPath },
    { name: path.basename(installerPath), filePath: installerPath },
    { name: path.basename(blockMapPath), filePath: blockMapPath }
  ];

  for (const asset of assets) {
    if (!existsSync(asset.filePath)) {
      throw new Error(`Release artifact is missing: ${asset.filePath}`);
    }
  }

  await deleteExistingAssets({
    owner: githubConfig.owner,
    repo: githubConfig.repo,
    release,
    assetNames: assets.map((asset) => asset.name),
    token
  });

  const uploadBaseUrl = String(release.upload_url).split("{", 1)[0];

  for (const asset of assets) {
    await uploadReleaseAsset(uploadBaseUrl, asset.filePath, asset.name, token);
    console.log(`Uploaded ${asset.name}`);
  }

  console.log(`Published GitHub Release: ${release.html_url}`);
}

export async function writeAppUpdateMetadata({ appOutDir, builderConfig }) {
  const publishConfig = resolveGithubPublishConfig(builderConfig);
  const appUpdateYaml = [
    `owner: ${publishConfig.owner}`,
    `repo: ${publishConfig.repo}`,
    "provider: github",
    `releaseType: ${publishConfig.releaseType ?? "release"}`,
    "updaterCacheDirName: yulora-updater"
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
        productFilename: builderConfig.productName ?? "Yulora"
      }
    }
  });
}

export async function buildWindowsArtifacts({
  projectDir,
  builderConfig,
  electronBuilderBuildImpl = electronBuilderBuild,
  platformPackagerClass = PlatformPackager,
  preparePackagedAppImpl = preparePackagedWindowsApp
}) {
  const buildConfig = {
    ...builderConfig,
    afterPack: null,
    publish: null
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

export async function writeLatestReleaseMetadata({ projectDir, version }) {
  const installerName = `Yulora-Setup-${version}.exe`;
  const installerPath = path.join(projectDir, OUTPUT_DIRECTORY, installerName);
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

  await writeFile(path.join(projectDir, OUTPUT_DIRECTORY, "latest.yml"), `${latestYaml}\n`, "utf8");
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

  if (!version || typeof version !== "string") {
    throw new Error("package.json must define a version string.");
  }

  await cleanOutputDirectory(projectDir);
  await buildWindowsArtifacts({ projectDir, builderConfig });
  await writeLatestReleaseMetadata({ projectDir, version });

  if (mode === "release") {
    await publishReleaseArtifacts({
      projectDir,
      builderConfig,
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
