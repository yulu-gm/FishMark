import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const DEV_USER_DATA_DIRNAME = "Yulora-dev";
const FIXTURE_THEMES_DIR = path.resolve("fixtures", "themes");
const appDataDirectory = process.env.APPDATA;

if (!appDataDirectory) {
  throw new Error("APPDATA is not defined, cannot resolve the dev userData directory.");
}

const targetThemesDirectory = path.join(appDataDirectory, DEV_USER_DATA_DIRNAME, "themes");

async function main() {
  await mkdir(targetThemesDirectory, { recursive: true });

  let entries = [];

  try {
    entries = await readdir(FIXTURE_THEMES_DIR, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read fixture themes from ${FIXTURE_THEMES_DIR}: ${message}`);
  }

  const themeDirectories = entries.filter((entry) => entry.isDirectory());

  for (const entry of themeDirectories) {
    const sourceDirectory = path.join(FIXTURE_THEMES_DIR, entry.name);
    const targetDirectory = path.join(targetThemesDirectory, entry.name);
    await cp(sourceDirectory, targetDirectory, { recursive: true, force: true });
  }
}

await main();
