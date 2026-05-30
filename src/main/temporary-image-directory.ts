import path from "node:path";
import { dialog } from "electron";

import type { Preferences } from "../shared/preferences";

type OpenDirectoryDialogResult = {
  canceled: boolean;
  filePaths: string[];
};

type OpenDirectoryDialogOptions = {
  title: string;
  properties: Array<"openDirectory" | "createDirectory">;
};

export type SelectTemporaryImageDirectoryDependencies = {
  showOpenDialog: (options: OpenDirectoryDialogOptions) => Promise<OpenDirectoryDialogResult>;
};

const defaultDependencies: SelectTemporaryImageDirectoryDependencies = {
  showOpenDialog: (options) => dialog.showOpenDialog(options)
};

export async function selectTemporaryImageDirectory(
  dependencies: SelectTemporaryImageDirectoryDependencies = defaultDependencies
): Promise<string | null> {
  const result = await dependencies.showOpenDialog({
    title: "Select Temporary Image Directory",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

export function resolveTemporaryImageDirectory(
  userDataDir: string,
  preferences: Preferences
): string {
  return (
    preferences.images.temporaryDirectory ??
    path.join(userDataDir, "temp", "clipboard-images")
  );
}
