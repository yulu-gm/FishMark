import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { rcedit } from "rcedit";

const RETRYABLE_ICON_PATCH_ERRORS = ["EBUSY", "EPERM", "Unable to commit changes", "resource busy", "Access is denied"];
const ICON_PATCH_MAX_ATTEMPTS = 6;
const ICON_PATCH_RETRY_DELAY_MS = 500;

function resolveContext(rawContext) {
  return {
    appOutDir: rawContext.appOutDir,
    electronPlatformName: rawContext.electronPlatformName,
    productFilename: rawContext.packager?.appInfo?.productFilename
  };
}

async function patchWindowsExecutableIcon(rawContext) {
  const context = resolveContext(rawContext);

  if (context.electronPlatformName !== "win32") {
    return;
  }

  if (!context.appOutDir) {
    throw new Error("afterPack hook requires appOutDir.");
  }

  if (!context.productFilename) {
    throw new Error("afterPack hook requires packager.appInfo.productFilename.");
  }

  const executablePath = path.join(context.appOutDir, `${context.productFilename}.exe`);
  const iconPath = path.join(process.cwd(), "build", "icons", "light", "icon.ico");

  let lastError = null;

  for (let attempt = 1; attempt <= ICON_PATCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      await rcedit(executablePath, {
        icon: iconPath
      });
      console.log(`Patched Windows executable icon: ${executablePath}`);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRetryable = RETRYABLE_ICON_PATCH_ERRORS.some((fragment) => message.includes(fragment));

      if (!isRetryable || attempt === ICON_PATCH_MAX_ATTEMPTS) {
        throw error;
      }

      await delay(ICON_PATCH_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError ?? new Error("Failed to patch Windows executable icon.");
}

export default patchWindowsExecutableIcon;

const currentModulePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentModulePath)) {
  const rawContext = process.argv[2] ? JSON.parse(process.argv[2]) : null;

  patchWindowsExecutableIcon(rawContext).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
