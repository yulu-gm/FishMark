import { randomUUID } from "node:crypto";
import type { WorkspaceState } from "@fishmark/workspace-domain";
import type { WorkspaceEditorViewHandoff, WorkspaceWindowSnapshot } from "../shared/workspace";

type Entry = WorkspaceEditorViewHandoff & { sourceWindowId: string };

// Selection is transient presentation state. Stage before window readiness can
// resolve, then attach it to the target's document snapshot after ownership moves.
// Repeated reads retain the envelope; the renderer applies each identity once.
export function createWorkspaceEditorViewHandoffs(input: {
  workspace: Pick<WorkspaceState, "getTabSession">;
  createId?: () => string;
}) {
  const entries = new Map<string, Entry>();
  const createId = input.createId ?? randomUUID;
  const prune = () => {
    for (const [tabId, entry] of entries) {
      try {
        if (input.workspace.getTabSession(tabId).revision !== entry.revision) entries.delete(tabId);
      } catch { entries.delete(tabId); }
    }
  };
  return {
    prune,
    stage(tabId: string, sourceWindowId: string, value: unknown): string | null {
      prune();
      if (value === undefined && !entries.has(tabId)) return null;
      const document = input.workspace.getTabSession(tabId);
      if (document.windowId !== sourceWindowId) throw new Error("The tab moved to another window.");
      if (value === undefined) { entries.delete(tabId); return null; }
      if (!isRecord(value) || !isRecord(value.selection) ||
          !Number.isSafeInteger(value.revision) || value.revision !== document.revision ||
          !isOffset(value.selection.anchor, document.content.length) ||
          !isOffset(value.selection.head, document.content.length)) {
        throw new Error("The transferred editor selection does not match the document.");
      }
      const handoffId = createId();
      entries.set(tabId, { handoffId, tabId, sourceWindowId, revision: document.revision,
        selection: { anchor: value.selection.anchor, head: value.selection.head } });
      return handoffId;
    },
    decorate(snapshot: WorkspaceWindowSnapshot): WorkspaceWindowSnapshot {
      prune();
      const document = snapshot.activeDocument;
      if (document === null) return snapshot;
      const entry = entries.get(document.tabId);
      if (entry === undefined || entry.sourceWindowId === snapshot.windowId || entry.revision !== document.revision ||
          input.workspace.getTabSession(document.tabId).windowId !== snapshot.windowId) return snapshot;
      const editorViewHandoff = { handoffId: entry.handoffId, tabId: entry.tabId, revision: entry.revision, selection: entry.selection };
      return { ...snapshot, editorViewHandoff };
    },
    abort(tabId: string, handoffId: string | null): void {
      prune();
      const entry = entries.get(tabId);
      if (entry === undefined || entry.handoffId !== handoffId) return;
      // Watcher failure can occur after ownership committed. Retain the target
      // envelope in that case; only a failed same-owner transfer is discarded.
      if (input.workspace.getTabSession(tabId).windowId === entry.sourceWindowId) entries.delete(tabId);
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isOffset(value: unknown, length: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= length;
}
