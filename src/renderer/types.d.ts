import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { AppMenuCommand } from "../shared/menu-command";
import type {
  EditorTestCommandEnvelope,
  EditorTestCommandResultEnvelope
} from "../shared/editor-test-command";
import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";
import type { RunnerEventEnvelope, ScenarioRunTerminal } from "../shared/test-run-session";

export {};

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
      startScenarioRun: (input: { scenarioId: string }) => Promise<{ runId: string }>;
      interruptScenarioRun: (input: { runId: string }) => Promise<void>;
      onScenarioRunEvent: (listener: (payload: RunnerEventEnvelope) => void) => () => void;
      onScenarioRunTerminal: (listener: (payload: ScenarioRunTerminal) => void) => () => void;
      onEditorTestCommand: (listener: (payload: EditorTestCommandEnvelope) => void) => () => void;
      completeEditorTestCommand: (payload: EditorTestCommandResultEnvelope) => Promise<void>;
      onMenuCommand: (listener: (command: AppMenuCommand) => void) => () => void;
    };
  }
}
