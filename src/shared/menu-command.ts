export const APP_MENU_COMMAND_EVENT = "yulora:app-menu-command";

export const APP_MENU_COMMANDS = [
  "new-markdown-document",
  "open-markdown-file",
  "save-markdown-file",
  "save-markdown-file-as"
] as const;

export type AppMenuCommand = (typeof APP_MENU_COMMANDS)[number];
