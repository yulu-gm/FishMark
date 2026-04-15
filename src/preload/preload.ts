import { contextBridge, ipcRenderer } from "electron";

const OPEN_MARKDOWN_FILE_CHANNEL = "yulora:open-markdown-file";
const SAVE_MARKDOWN_FILE_CHANNEL = "yulora:save-markdown-file";
const SAVE_MARKDOWN_FILE_AS_CHANNEL = "yulora:save-markdown-file-as";
const APP_MENU_COMMAND_EVENT = "yulora:app-menu-command";

type AppMenuCommand = "open-markdown-file" | "save-markdown-file" | "save-markdown-file-as";

const api = {
  platform: process.platform,
  openMarkdownFile: () => ipcRenderer.invoke(OPEN_MARKDOWN_FILE_CHANNEL),
  saveMarkdownFile: (input: { path: string; content: string }) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_CHANNEL, input),
  saveMarkdownFileAs: (input: { currentPath: string; content: string }) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_AS_CHANNEL, input),
  onMenuCommand: (listener: (command: AppMenuCommand) => void) => {
    const handleMenuCommand = (_event: unknown, command: AppMenuCommand) => {
      listener(command);
    };

    ipcRenderer.on(APP_MENU_COMMAND_EVENT, handleMenuCommand);

    return () => {
      ipcRenderer.off(APP_MENU_COMMAND_EVENT, handleMenuCommand);
    };
  }
};

contextBridge.exposeInMainWorld("yulora", api);
