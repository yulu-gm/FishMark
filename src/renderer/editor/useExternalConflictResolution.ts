import { useCallback } from "react";

import type { AppNotification } from "../../shared/app-update";
import type { WorkspaceDocumentSnapshot } from "../../shared/workspace";
import type { ExternalMarkdownFileState } from "./editor-shell-state";

// Presents the main-owned external-change state (from the canonical workspace projection)
// and sends typed resolve commands back to main. The renderer no longer owns conflict state.
export function useExternalConflictResolution(input: {
  fishmark: Window["fishmark"];
  getActiveDocument: () => WorkspaceDocumentSnapshot | null;
  refreshSnapshot: () => Promise<void>;
  showNotification: (notification: AppNotification) => void;
}) {
  const { fishmark, getActiveDocument, refreshSnapshot, showNotification } = input;
  const activeDocument = getActiveDocument();
  const externalChange = activeDocument?.externalChange ?? null;
  const externalFileState: ExternalMarkdownFileState = externalChange === null
    ? { status: "idle" }
    : {
        status: "pending",
        path: activeDocument?.path ?? "",
        kind: externalChange.kind
      };

  const resolve = useCallback(
    async (command: "keep-memory" | "reload" | "save-as" | "cancel"): Promise<void> => {
      const document = getActiveDocument();
      if (!document) return;
      try {
        const result = await fishmark.resolveExternalChange({
          tabId: document.tabId,
          command
        });
        if (result.kind === "error") {
          showNotification({ kind: "error", message: result.message });
          return;
        }
        await refreshSnapshot();
      } catch (error) {
        showNotification({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [fishmark, getActiveDocument, refreshSnapshot, showNotification]
  );

  const keepMemoryVersion = useCallback(() => resolve("keep-memory"), [resolve]);
  const reloadFromDisk = useCallback(() => resolve("reload"), [resolve]);
  const dismissConflict = useCallback(() => resolve("cancel"), [resolve]);
  const hasExternalFileConflict = useCallback(
    () => (getActiveDocument()?.externalChange ?? null) !== null,
    [getActiveDocument]
  );

  return {
    externalFileState,
    keepMemoryVersion,
    dismissConflict,
    reloadFromDisk,
    hasExternalFileConflict
  };
}
