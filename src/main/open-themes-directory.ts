import path from "node:path";
import { mkdir } from "node:fs/promises";
import { shell } from "electron";

export type OpenThemesDirectoryDependencies = {
  mkdir: (targetPath: string, options: { recursive: true }) => Promise<string | undefined>;
  openPath: (targetPath: string) => Promise<string>;
};

const defaultDependencies: OpenThemesDirectoryDependencies = {
  mkdir,
  openPath: (targetPath) => shell.openPath(targetPath)
};

export async function openThemesDirectory(
  userDataDir: string,
  dependencies: OpenThemesDirectoryDependencies = defaultDependencies
): Promise<void> {
  const themesDirectory = path.join(userDataDir, "themes");

  await dependencies.mkdir(themesDirectory, { recursive: true });

  const failureMessage = await dependencies.openPath(themesDirectory);

  if (failureMessage) {
    throw new Error(failureMessage);
  }
}
