import type {
  HandleDroppedMarkdownFileInput,
  HandleDroppedMarkdownFileResult,
  OpenMarkdownFileResult
} from "./open-markdown-file";
import type {
  ActivateWorkspaceTabInput,
  CloseWorkspaceTabInput,
  CreateWorkspaceTabInput,
  DetachWorkspaceTabToNewWindowInput,
  MoveWorkspaceTabToWindowInput,
  OpenWorkspaceFileFromPathResult,
  OpenWorkspaceFileResult,
  ReloadWorkspaceTabFromPathInput,
  ReorderWorkspaceTabInput,
  UpdateWorkspaceTabDraftInput,
  WorkspaceMoveTabResult,
  WorkspaceWindowSnapshot
} from "./workspace";
import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "./save-markdown-file";
import type {
  AppNotification,
  AppUpdateState
} from "./app-update";
import type { AppMenuCommand } from "./menu-command";
import type {
  ExternalMarkdownFileChangedEvent,
  SyncWatchedMarkdownFileInput
} from "./external-file-change";
import type { ImportClipboardImageInput, ImportClipboardImageResult } from "./clipboard-image-import";
import type {
  Preferences,
  PreferencesUpdate,
  UpdatePreferencesResult
} from "./preferences";
import type { OpenWorkspacePathRequest } from "./workspace";
import type { ThemePackageDescriptor } from "./theme-package";

export interface ProductBridge {
  platform: NodeJS.Platform;
  runtimeMode: "editor" | "test-workbench";
  startupOpenPath: string | null;
  openMarkdownFile: () => Promise<OpenMarkdownFileResult>;
  openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
  handleDroppedMarkdownFile: (
    input: HandleDroppedMarkdownFileInput
  ) => Promise<HandleDroppedMarkdownFileResult>;
  getPathForDroppedFile: (file: File) => string;
  getWorkspaceSnapshot: () => Promise<WorkspaceWindowSnapshot>;
  createWorkspaceTab: (input: CreateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
  openWorkspaceFile: () => Promise<OpenWorkspaceFileResult>;
  openWorkspaceFileFromPath: (targetPath: string) => Promise<OpenWorkspaceFileFromPathResult>;
  reloadWorkspaceTabFromPath: (input: ReloadWorkspaceTabFromPathInput) => Promise<WorkspaceWindowSnapshot>;
  activateWorkspaceTab: (input: ActivateWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
  closeWorkspaceTab: (input: CloseWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
  reorderWorkspaceTab: (input: ReorderWorkspaceTabInput) => Promise<WorkspaceWindowSnapshot>;
  moveWorkspaceTabToWindow: (input: MoveWorkspaceTabToWindowInput) => Promise<WorkspaceMoveTabResult>;
  detachWorkspaceTabToNewWindow: (
    input: DetachWorkspaceTabToNewWindowInput
  ) => Promise<WorkspaceWindowSnapshot>;
  updateWorkspaceTabDraft: (input: UpdateWorkspaceTabDraftInput) => Promise<WorkspaceWindowSnapshot>;
  saveMarkdownFile: (input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>;
  saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>;
  syncWatchedMarkdownFile: (input: SyncWatchedMarkdownFileInput) => Promise<void>;
  importClipboardImage: (input: ImportClipboardImageInput) => Promise<ImportClipboardImageResult>;
  onMenuCommand: (listener: (command: AppMenuCommand) => void) => () => void;
  onOpenWorkspacePath: (listener: (payload: OpenWorkspacePathRequest) => void) => () => void;
  confirmWorkspaceWindowClose: () => Promise<boolean>;
  onWorkspaceWindowCloseRequest: (listener: () => Promise<boolean>) => () => void;
  getPreferences: () => Promise<Preferences>;
  updatePreferences: (patch: PreferencesUpdate) => Promise<UpdatePreferencesResult>;
  onPreferencesChanged: (listener: (preferences: Preferences) => void) => () => void;
  onAppUpdateState: (listener: (state: AppUpdateState) => void) => () => void;
  onAppNotification: (listener: (notification: AppNotification) => void) => () => void;
  onExternalMarkdownFileChanged: (
    listener: (event: ExternalMarkdownFileChangedEvent) => void
  ) => () => void;
  listFontFamilies: () => Promise<string[]>;
  listThemePackages: () => Promise<ThemePackageDescriptor[]>;
  refreshThemePackages: () => Promise<ThemePackageDescriptor[]>;
  openThemesDirectory: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
}
