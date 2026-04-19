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
  const __YULORA_APP_VERSION__: string;

  interface Window {
    yulora: {
      platform: NodeJS.Platform;
      runtimeMode: "editor" | "test-workbench";
      startupOpenPath: string | null;
      openMarkdownFile: () => Promise<OpenMarkdownFileResult>;
      openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
      handleDroppedMarkdownFile: (
        input: HandleDroppedMarkdownFileInput
      ) => Promise<HandleDroppedMarkdownFileResult>;
      getPathForDroppedFile: (file: File) => string;
      saveMarkdownFile: (input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>;
      saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>;
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
      getPreferences: () => Promise<Preferences>;
      updatePreferences: (patch: PreferencesUpdate) => Promise<UpdatePreferencesResult>;
      onPreferencesChanged: (listener: (preferences: Preferences) => void) => () => void;
      onAppUpdateState: (listener: (state: AppUpdateState) => void) => () => void;
      onAppNotification: (listener: (notification: AppNotification) => void) => () => void;
    };
  }
}
