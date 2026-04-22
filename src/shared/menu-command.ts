export const APP_MENU_COMMAND_EVENT = "fishmark:app-menu-command";

export const APP_MENU_COMMANDS = [
  "new-markdown-document",
  "open-markdown-file",
  "new-editor-window",
  "save-markdown-file",
  "save-markdown-file-as",
  "check-for-updates"
] as const;

export type AppMenuCommand = (typeof APP_MENU_COMMANDS)[number];
