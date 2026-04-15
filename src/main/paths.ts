import path from "node:path";
import { pathToFileURL } from "node:url";

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
