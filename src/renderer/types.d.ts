import type { OpenMarkdownFileResult } from "../shared/open-markdown-file";
import type { AppMenuCommand } from "../shared/menu-command";
import type {
  SaveMarkdownFileAsInput,
  SaveMarkdownFileInput,
  SaveMarkdownFileResult
} from "../shared/save-markdown-file";

export {};

declare global {
  interface Window {
    yulora: {
      platform: NodeJS.Platform;
      runtimeMode: "editor" | "test-workbench";
      openMarkdownFile: () => Promise<OpenMarkdownFileResult>;
      saveMarkdownFile: (input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>;
      saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>;
      openEditorTestWindow: () => Promise<void>;
      onMenuCommand: (listener: (command: AppMenuCommand) => void) => () => void;
    };
  }
}
