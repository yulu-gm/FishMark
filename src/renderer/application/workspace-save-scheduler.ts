import type { AppNotification } from "../../shared/app-update";
import type { WorkspaceDocumentSnapshot } from "../../shared/workspace";
import type { WorkspaceSaveOutcome } from "./workspace-renderer-application";

export type WorkspaceSaveSchedulerPorts = {
  getActiveDocument: () => WorkspaceDocumentSnapshot | null;
  runSaveTransaction: (input: { forceSaveAs: boolean; hasExternalConflict: boolean }) => Promise<WorkspaceSaveOutcome>;
  hasExternalFileConflict: () => boolean;
  autosaveDelayMs: number;
  showNotification: (notification: AppNotification) => void;
};

// Owns scheduling only. The application transaction and edit client remain the single writer.
export class WorkspaceSaveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private replay = false;
  private origin: "manual" | "autosave" | null = null;
  private disposed = false;
  constructor(private ports: WorkspaceSaveSchedulerPorts) {}

  setDelay(delay: number): void { this.ports.autosaveDelayMs = delay; }
  clearAutosaveTimer = (): void => {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  };
  resetAutosaveRuntime = (): void => { this.clearAutosaveTimer(); this.replay = false; };
  dispose(): void { this.disposed = true; this.resetAutosaveRuntime(); }
  isSaveInFlight = (): boolean => this.origin !== null;
  getEffectiveSaveState = (document: WorkspaceDocumentSnapshot | null): WorkspaceDocumentSnapshot["saveState"] | "idle" =>
    document && this.origin !== null ? (this.origin === "manual" ? "manual-saving" : "autosaving") : document?.saveState ?? "idle";

  private eligible(): boolean {
    const document = this.ports.getActiveDocument();
    return !this.disposed && !!document?.path && document.isDirty && !this.ports.hasExternalFileConflict();
  }
  scheduleAutosave = (delay = this.ports.autosaveDelayMs): void => {
    this.clearAutosaveTimer();
    if (this.disposed) return;
    if (this.origin !== null) { this.replay = true; return; }
    if (!this.eligible()) { this.replay = false; return; }
    this.timer = setTimeout(() => { this.timer = null; void this.runAutosave(); }, delay);
  };
  runAutosave = async (): Promise<void> => {
    this.clearAutosaveTimer();
    if (!this.eligible()) return;
    if (this.origin !== null) { this.replay = true; return; }
    await this.save("autosave", false);
  };
  runManualSave = async (options: { forceSaveAs?: boolean } = {}): Promise<WorkspaceSaveOutcome> => {
    if (this.disposed || !this.ports.getActiveDocument()) return { kind: "no-document" };
    if (this.origin !== null) return { kind: "superseded" };
    return this.save("manual", options.forceSaveAs ?? false);
  };
  private async save(origin: "manual" | "autosave", forceSaveAs: boolean): Promise<WorkspaceSaveOutcome> {
    this.clearAutosaveTimer();
    this.origin = origin;
    this.replay = false;
    try {
      let outcome: WorkspaceSaveOutcome;
      try {
        outcome = await this.ports.runSaveTransaction({ forceSaveAs, hasExternalConflict: origin === "manual" && this.ports.hasExternalFileConflict() });
      } catch (error) { outcome = { kind: "failed", error }; }
      if (!this.disposed) {
        const notification = saveNotification(outcome, origin);
        if (notification) this.ports.showNotification(notification);
      }
      return outcome;
    } finally {
      this.origin = null;
      if (!this.disposed && this.replay) {
        this.replay = false;
        if (origin === "autosave") void this.runAutosave();
        else this.scheduleAutosave();
      }
    }
  }
}

function saveNotification(outcome: WorkspaceSaveOutcome, origin: "manual" | "autosave"): AppNotification | null {
  let message: string;
  if (outcome.kind === "committed") {
    if (outcome.value.status !== "error") return null;
    message = outcome.value.error.message;
  } else if (outcome.kind === "cancelled" || outcome.kind === "superseded" || outcome.kind === "no-document") return null;
  else message = outcome.error instanceof Error && outcome.error.message.trim() ? outcome.error.message : "Save failed. Changes are still in memory.";
  return { kind: "error", message: origin === "autosave" ? "Autosave failed. Changes are still in memory." : message };
}
