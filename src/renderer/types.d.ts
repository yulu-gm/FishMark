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
      openMarkdownFile: () => Promise<OpenMarkdownFileResult>;
      saveMarkdownFile: (input: SaveMarkdownFileInput) => Promise<SaveMarkdownFileResult>;
      saveMarkdownFileAs: (input: SaveMarkdownFileAsInput) => Promise<SaveMarkdownFileResult>;
      onMenuCommand: (listener: (command: AppMenuCommand) => void) => () => void;
    };
  }
}
