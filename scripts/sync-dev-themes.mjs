import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const DEV_USER_DATA_DIRNAME = "Yulora-dev";
const FIXTURE_THEMES_DIR = path.resolve("fixtures", "themes");
const appDataDirectory = resolveAppDataDirectory(process.env, process.platform);

const targetThemesDirectory = path.join(appDataDirectory, DEV_USER_DATA_DIRNAME, "themes");

function resolveAppDataDirectory(env, platform) {
  if (platform === "win32") {
    if (typeof env.APPDATA === "string" && env.APPDATA.length > 0) {
      return env.APPDATA;
    }

    throw new Error("APPDATA is not defined, cannot resolve the dev userData directory on Windows.");
  }

  if (typeof env.HOME !== "string" || env.HOME.length === 0) {
    throw new Error(`HOME is not defined, cannot resolve the dev userData directory on ${platform}.`);
  }

  if (platform === "darwin") {
    return path.join(env.HOME, "Library", "Application Support");
  }

  if (typeof env.XDG_CONFIG_HOME === "string" && env.XDG_CONFIG_HOME.length > 0) {
    return env.XDG_CONFIG_HOME;
  }

  return path.join(env.HOME, ".config");
}

async function main() {
  await mkdir(targetThemesDirectory, { recursive: true });

  let entries = [];

  try {
    entries = await readdir(FIXTURE_THEMES_DIR, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read fixture themes from ${FIXTURE_THEMES_DIR}: ${message}`);
  }

  const themeDirectories = entries.filter((entry) => entry.isDirectory());

  for (const entry of themeDirectories) {
    const sourceDirectory = path.join(FIXTURE_THEMES_DIR, entry.name);
    const targetDirectory = path.join(targetThemesDirectory, entry.name);
    const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true });
    const hasManifest = sourceEntries.some(
      (sourceEntry) => sourceEntry.isFile() && sourceEntry.name === "manifest.json"
    );

    if (!hasManifest) {
      continue;
    }

    await cp(sourceDirectory, targetDirectory, { recursive: true, force: true });
  }
}

await main();
