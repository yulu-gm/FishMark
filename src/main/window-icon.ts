import path from "node:path";

import { app } from "electron";

export function resolveWindowIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icons", "dark", "icon.ico");
  }

  return path.join(__dirname, "../../build/icons/dark/icon.ico");
}
