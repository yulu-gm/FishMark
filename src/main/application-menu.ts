import type { AppMenuCommand } from "../shared/menu-command";

export type ApplicationMenuItem = {
  accelerator?: string;
  click?: () => void;
  label?: string;
  role?: string;
  submenu?: ApplicationMenuItem[];
  type?: "separator";
};

type CreateApplicationMenuTemplateOptions = {
  dispatchCommand: (command: AppMenuCommand) => void;
};

function createCommandItem(
  label: string,
  accelerator: string,
  command: AppMenuCommand,
  dispatchCommand: (command: AppMenuCommand) => void
): ApplicationMenuItem {
  return {
    label,
    accelerator,
    click: () => dispatchCommand(command)
  };
}

export function createApplicationMenuTemplate({
  dispatchCommand
}: CreateApplicationMenuTemplateOptions): ApplicationMenuItem[] {
  return [
    {
      label: "File",
      submenu: [
        createCommandItem("Open...", "CmdOrCtrl+O", "open-markdown-file", dispatchCommand),
        { type: "separator" },
        createCommandItem("Save", "CmdOrCtrl+S", "save-markdown-file", dispatchCommand),
        createCommandItem("Save As...", "Shift+CmdOrCtrl+S", "save-markdown-file-as", dispatchCommand),
        { type: "separator" },
        { role: "close" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }]
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }]
    },
    {
      label: "Help",
      submenu: []
    }
  ];
}
