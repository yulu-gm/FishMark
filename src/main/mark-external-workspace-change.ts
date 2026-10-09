import type { WorkspaceState } from "@fishmark/workspace-domain";
import { filePathIdentity } from "./file-path";

/** A watch notification marks conflict state only; user commands own resolution. */
export function markExternalWorkspaceChange(
  workspace: Pick<WorkspaceState, "exportSnapshot" | "markExternalChange">,
  targetPath: string,
  kind: "modified" | "deleted",
  platform: NodeJS.Platform = process.platform
): void {
  const identity = filePathIdentity(targetPath, platform);
  for (const session of workspace.exportSnapshot().sessions) {
    if (session.path === null || filePathIdentity(session.path, platform) !== identity) continue;
    workspace.markExternalChange({
      tabId: session.tabId,
      expectedWindowId: session.windowId,
      change: { kind }
    });
  }
}
