import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { rcedit } from "rcedit";

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

  await rcedit(executablePath, {
    icon: iconPath
  });

  console.log(`Patched Windows executable icon: ${executablePath}`);
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
