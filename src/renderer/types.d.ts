import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
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
import type { RunnerEventEnvelope, ScenarioRunTerminal } from "../shared/test-run-session";

export {};

type UpdatePreferencesResult =
  | { status: "success"; preferences: Preferences }
  | {
      status: "error";
      error: { code: "write-failed" | "commit-failed"; message: string };
      preferences: Preferences;
    };

type ThemeDescriptor = {
  id: string;
  source: "builtin" | "community";
  name: string;
  directoryName: string;
  modes: {
    light: {
      available: boolean;
      availableParts: {
        tokens: boolean;
        ui: boolean;
        editor: boolean;
        markdown: boolean;
      };
      partUrls: Partial<{
        tokens: string;
        ui: string;
        editor: string;
        markdown: string;
      }>;
    };
    dark: {
      available: boolean;
      availableParts: {
        tokens: boolean;
        ui: boolean;
        editor: boolean;
        markdown: boolean;
      };
      partUrls: Partial<{
        tokens: string;
        ui: string;
        editor: string;
        markdown: string;
      }>;
    };
  };
};

declare global {
  interface Window {
    yulora: {
      platform: NodeJS.Platform;
      runtimeMode: "editor" | "test-workbench";
      startupOpenPath: string | null;
      openMarkdownFile: () => Promise<OpenMarkdownFileResult>;
      openMarkdownFileFromPath: (targetPath: string) => Promise<OpenMarkdownFileResult>;
      saveMarkdownFile: (input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>;
      saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>;
      openEditorTestWindow: () => Promise<void>;
      listThemes: () => Promise<ThemeDescriptor[]>;
      refreshThemes: () => Promise<ThemeDescriptor[]>;
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
