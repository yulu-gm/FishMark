import type { WorkspaceState } from "@fishmark/workspace-domain";
import type { RecoveryService } from "./infrastructure/recovery-service";

// Startup replay is document-scoped: a failed chain must not admit later edits
// for that document, or prevent independent documents from recovering.
export async function restoreWorkspaceRecovery(input: {
  workspace: Pick<WorkspaceState, "exportSnapshot" | "restoreSnapshot" | "getTabSession" | "applyDocumentEdits">;
  recovery: Pick<RecoveryService, "loadRecovery" | "preserveRecovery"> & Partial<Pick<RecoveryService, "activateImportedImages">>;
}): Promise<{
  diagnostics: readonly string[];
  notification: { title: "Recovery incomplete" | "Recovery unavailable"; content: string } | null;
}> {
  const recovery = await input.recovery.loadRecovery();
  if (recovery.kind === "no-recovery-needed") {
    input.recovery.activateImportedImages?.(null);
    return { diagnostics: [], notification: null };
  }
  const diagnostics: string[] = [];
  let unavailable = recovery.kind === "corrupt";
  let incomplete = false;
  let preservationMessage: string | null = null;
  async function preserveOriginals(): Promise<void> {
    if (preservationMessage !== null) return;
    try {
      const preserved = await input.recovery.preserveRecovery();
      preservationMessage = `Original recovery files were preserved at ${preserved}.`;
    } catch (error) {
      diagnostics.push(`Recovery preservation could not be completed: ${message(error)}`);
      preservationMessage = "Original recovery files remain in place. Recovery writes are blocked because their preservation could not be completed.";
    }
  }
  if (recovery.kind === "corrupt") {
    diagnostics.push(`Recovery data is unavailable at ${recovery.path}.`);
    await preserveOriginals();
  } else {
    incomplete = Boolean(recovery.incompleteTail || recovery.journalDamage);
    if (recovery.incompleteTail) diagnostics.push("Recovery journal has an interrupted final write; its completed prefix is retained.");
    if (recovery.journalDamage) diagnostics.push(`Recovery journal stopped at ${recovery.journalDamage}; its trusted prefix is retained.`);
    if (incomplete) await preserveOriginals();
    if (recovery.snapshot !== null) {
      const beforeRestore = input.workspace.exportSnapshot();
      try { input.workspace.restoreSnapshot(recovery.snapshot); }
      catch (error) {
        input.workspace.restoreSnapshot(beforeRestore);
        unavailable = true;
        diagnostics.push(`Recovery snapshot could not be restored: ${message(error)}`);
        await preserveOriginals();
      }
    }
    if (!unavailable) {
      const blockedTabs = new Set<string>();
      for (const batch of recovery.editBatches) {
        if (blockedTabs.has(batch.tabId)) continue;
        try {
          const session = input.workspace.getTabSession(batch.tabId);
          // A committed snapshot can precede journal truncation after a crash.
          if (session.revision > batch.baseRevision) continue;
          const result = input.workspace.applyDocumentEdits({
            tabId: batch.tabId, expectedWindowId: session.windowId,
            clientId: `recovery:${batch.clientId}:${batch.baseRevision}`, clientSequence: 1,
            baseRevision: batch.baseRevision, changes: batch.changes
          });
          if (result.kind !== "applied" && result.kind !== "duplicate") throw new Error(result.kind);
        } catch (error) {
          blockedTabs.add(batch.tabId);
          incomplete = true;
          diagnostics.push(`Recovery replay stopped for tab '${batch.tabId}': ${message(error)}`);
          await preserveOriginals();
        }
      }
    }
  }
  input.recovery.activateImportedImages?.(unavailable ? null : input.workspace.exportSnapshot());
  if (!unavailable && !incomplete) return { diagnostics, notification: null };
  return { diagnostics, notification: {
    title: unavailable ? "Recovery unavailable" : "Recovery incomplete",
    content: `${unavailable
      ? "Recovery data could not be restored. The workspace will start fresh."
      : "Some recovery entries could not be recovered. The trusted prefix is available; independent documents were recovered where possible."}\n\n${preservationMessage}`
  } };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
