import { contextBridge, ipcRenderer } from "electron";

const OPEN_MARKDOWN_FILE_CHANNEL = "yulora:open-markdown-file";
const SAVE_MARKDOWN_FILE_CHANNEL = "yulora:save-markdown-file";
const SAVE_MARKDOWN_FILE_AS_CHANNEL = "yulora:save-markdown-file-as";
const OPEN_EDITOR_TEST_WINDOW_CHANNEL = "yulora:open-editor-test-window";
const APP_MENU_COMMAND_EVENT = "yulora:app-menu-command";
const RUNTIME_MODE_ARGUMENT_PREFIX = "--yulora-runtime-mode=";

type AppMenuCommand = "open-markdown-file" | "save-markdown-file" | "save-markdown-file-as";

function resolveRuntimeModeFromArgv(argv: string[]): "editor" | "test-workbench" {
  const runtimeArgument = argv.find((entry) => entry.startsWith(RUNTIME_MODE_ARGUMENT_PREFIX));
  const runtimeValue = runtimeArgument?.slice(RUNTIME_MODE_ARGUMENT_PREFIX.length);

  return runtimeValue === "test-workbench" ? "test-workbench" : "editor";
}

const api = {
  platform: process.platform,
  runtimeMode: resolveRuntimeModeFromArgv(process.argv ?? []),
  openMarkdownFile: () => ipcRenderer.invoke(OPEN_MARKDOWN_FILE_CHANNEL),
  saveMarkdownFile: (input: { path: string; content: string }) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_CHANNEL, input),
  saveMarkdownFileAs: (input: { currentPath: string; content: string }) =>
    ipcRenderer.invoke(SAVE_MARKDOWN_FILE_AS_CHANNEL, input),
  openEditorTestWindow: () => ipcRenderer.invoke(OPEN_EDITOR_TEST_WINDOW_CHANNEL),
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
