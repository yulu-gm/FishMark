import path from "node:path";
import { dialog } from "electron";

import type { Preferences } from "../shared/preferences";
import type { FileIdentityPort } from "@fishmark/workspace-application";
import type { createPreferencesService } from "./preferences-service";

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

export async function selectAndPersistTemporaryImageDirectory(input: {
  select: () => Promise<string | null>;
  fileIdentity: Pick<FileIdentityPort, "resolveProspective">;
  check: () => void;
  service: Pick<ReturnType<typeof createPreferencesService>, "updatePreferences">;
  commit: (directory: string) => void;
}): Promise<string | null> {
  const selected = await input.select();
  input.check();
  if (selected === null) return null;
  const resolved = await input.fileIdentity.resolveProspective(selected);
  input.check();
  const result = await input.service.updatePreferences({ images: { temporaryDirectory: resolved.canonicalPath } });
  if (result.status === "error") throw new Error(result.error.message);
  input.commit(resolved.canonicalPath);
  return resolved.canonicalPath;
}
