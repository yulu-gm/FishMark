import path from "node:path";
import { pathToFileURL } from "node:url";

export function resolveRendererPayloadDirectory(input: { isPackaged: boolean; appPath: string; moduleDir: string }): string {
  if (!input.isPackaged) return path.resolve(input.moduleDir, "../../dist");
  return path.extname(input.appPath).toLowerCase() === ".asar"
    ? path.join(`${input.appPath}.unpacked`, "dist") : path.join(input.appPath, "dist");
}

export function resolveRendererEntry(
  distDir: string,
  devServerUrl?: string,
  runtimeMode: "editor" | "test-workbench" = "editor"
): string {
  if (devServerUrl) {
    const rendererUrl = new URL(devServerUrl);

    if (runtimeMode === "test-workbench") {
      rendererUrl.searchParams.set("mode", "test-workbench");
    }

    return rendererUrl.toString();
  }

  const rendererUrl = pathToFileURL(path.join(distDir, "index.html"));

  if (runtimeMode === "test-workbench") {
    rendererUrl.searchParams.set("mode", "test-workbench");
  }

  return rendererUrl.toString();
}
