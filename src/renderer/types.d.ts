import type {
  HandleDroppedMarkdownFileInput,
  HandleDroppedMarkdownFileResult,
  OpenMarkdownFileResult
} from "../shared/open-markdown-file";
import type { AppMenuCommand } from "../shared/menu-command";
import type {
  EditorTestCommandEnvelope,
  EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
import type { Preferences, PreferencesUpdate } from "../shared/preferences";
import type { AppNotification, AppUpdateState } from "../shared/app-update";
import type {
  ExternalMarkdownFileChangedEvent,
  SyncWatchedMarkdownFileInput
} from "../shared/external-file-change";
import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";
import type {
  ImportClipboardImageInput,
  ImportClipboardImageResult
} from "../shared/clipboard-image-import";
import type { RunnerEventEnvelope, ScenarioRunTerminal } from "../shared/test-run-session";
import type { ThemePackageManifest } from "../shared/theme-package";
import type {
  ActivateWorkspaceTabInput,
  CloseWorkspaceTabInput,
  CreateWorkspaceTabInput,
  DetachWorkspaceTabToNewWindowInput,
  MoveWorkspaceTabToWindowInput,
  OpenWorkspacePathRequest,
  ReloadWorkspaceTabFromPathInput,
  ReorderWorkspaceTabInput,
  UpdateWorkspaceTabDraftInput,
  WorkspaceMoveTabResult,
  WorkspaceWindowSnapshot
} from "../shared/workspace";

export {};

type UpdatePreferencesResult =
  | { status: "success"; preferences: Preferences }
  | {
      status: "error";
      error: { code: "write-failed" | "commit-failed"; message: string };
      preferences: Preferences;
    };

type ThemePackageDescriptor = {
  id: string;
  kind: "manifest-package";
  source: "builtin" | "community";
  packageRoot: string;
  manifest: ThemePackageManifest;
};

declare global {
  const __FISHMARK_APP_VERSION__: string;

  interface Window {
    fishmark: {
      platform: NodeJS.Platform;
      runtimeMode: "editor" | "test-workbench";
      startupOpenPath: string | null;
      openMarkdownFile: () => Promise<OpenMarkdownFileResult>;
      openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
      getWorkspaceSnapshot: () => Promise<WorkspaceWindowSnapshot>;
      createWorkspaceTab: (input: CreateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
      openWorkspaceFile: () => Promise<WorkspaceWindowSnapshot | { status: "cancelled" }>;
      openWorkspaceFileFromPath: (targetPath: string) => Promise<WorkspaceWindowSnapshot>;
      activateWorkspaceTab: (input: ActivateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
      closeWorkspaceTab: (input: CloseWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
      reorderWorkspaceTab: (input: ReorderWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
      moveWorkspaceTabToWindow: (
        input: MoveWorkspaceTabToWindowInput
      ) => Promise<WorkspaceMoveTabResult>;
      detachWorkspaceTabToNewWindow: (
        input: DetachWorkspaceTabToNewWindowInput
      ) => Promise<WorkspaceWindowSnapshot>;
      updateWorkspaceTabDraft: (
        input: UpdateWorkspaceTabDraftInput
      ) => Promise<WorkspaceWindowSnapshot>;
      reloadWorkspaceTabFromPath: (
        input: ReloadWorkspaceTabFromPathInput
      ) => Promise<WorkspaceWindowSnapshot>;
      handleDroppedMarkdownFile: (
        input: HandleDroppedMarkdownFileInput
      ) => Promise<HandleDroppedMarkdownFileResult>;
      getPathForDroppedFile: (file: File) => string;
      saveMarkdownFile: (input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>;
      saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>;
      syncWatchedMarkdownFile: (input: SyncWatchedMarkdownFileInput) => Promise<void>;
      importClipboardImage: (input: ImportClipboardImageInput) => Promise<ImportClipboardImageResult>;
      openEditorTestWindow: () => Promise<void>;
      listFontFamilies: () => Promise<string[]>;
      listThemePackages: () => Promise<ThemePackageDescriptor[]>;
      refreshThemePackages: () => Promise<ThemePackageDescriptor[]>;
      openThemesDirectory: () => Promise<void>;
      checkForUpdates: () => Promise<void>;
      startScenarioRun: (input: { scenarioId: string }) => Promise<{ runId: string }>;
      interruptScenarioRun: (input: { runId: string }) => Promise<void>;
      onScenarioRunEvent: (listener: (payload: RunnerEventEnvelope) => void) => () => void;
      onScenarioRunTerminal: (listener: (payload: ScenarioRunTerminal) => void) => () => void;
      onEditorTestCommand: (listener: (payload: EditorTestCommandEnvelope) => void) => () => void;
      completeEditorTestCommand: (payload: EditorTestCommandResultEnvelope) => Promise<void>;
      onMenuCommand: (listener: (command: AppMenuCommand) => void) => () => void;
      onOpenWorkspacePath: (listener: (payload: OpenWorkspacePathRequest) => void) => () => void;
      getPreferences: () => Promise<Preferences>;
      updatePreferences: (patch: PreferencesUpdate) => Promise<UpdatePreferencesResult>;
      onPreferencesChanged: (listener: (preferences: Preferences) => void) => () => void;
      onAppUpdateState: (listener: (state: AppUpdateState) => void) => () => void;
      onAppNotification: (listener: (notification: AppNotification) => void) => () => void;
      onExternalMarkdownFileChanged: (
        listener: (event: ExternalMarkdownFileChangedEvent) => void
      ) => () => void;
    };
  }
}
